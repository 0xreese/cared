import assert from 'assert'
import type Stripe from 'stripe'
import { ORPCError } from '@orpc/server'
import { Decimal } from 'decimal.js'

import type { CreditsMetadata, OrderKind, OrderStatus } from '@cared/db/schema'
import { and, eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { Credits, CreditsOrder } from '@cared/db/schema'
import log from '@cared/log'

import type { UserContext } from '../orpc'
import { getStripe } from '../client/stripe'
import { cfg } from '../config'
import { env } from '../env'

/**
 * Cancel a credits order
 * @param ctx - User context
 * @param orderId - Order ID to cancel
 * @param organizationId - Optional organization ID
 * @param forceCancel - Whether to force cancel the order
 * @returns Promise<boolean> - Returns true if canceled successfully, false if it cannot be canceled
 */
export async function cancelCreditsOrder(
  orderId: string,
  userId?: string | null,
  organizationId?: string | null,
  forceCancel = false,
): Promise<boolean> {
  const stripe = getStripe()

  return await getDb().transaction(async (tx) => {
    // Find the order with select for update
    const order = (
      await tx
        .select()
        .from(CreditsOrder)
        .where(
          and(
            eq(CreditsOrder.id, orderId),
            organizationId
              ? eq(CreditsOrder.organizationId, organizationId)
              : eq(CreditsOrder.userId, userId!),
          ),
        )
        .for('update')
    )[0]

    if (!order) {
      throw new ORPCError('NOT_FOUND', {
        message: 'Order not found',
      })
    }

    // Check if order can be canceled based on status
    const cancelableStatuses = [
      'draft',
      'open',
      'uncollectible',
      'requires_action',
      'requires_capture',
      'requires_confirmation',
      'requires_payment_method',
    ]
    if (
      !cancelableStatuses.includes(order.status) ||
      (order.status === 'draft' && (order.object as Stripe.Invoice).billing_reason !== 'manual')
    ) {
      if (forceCancel) {
        throw new ORPCError('BAD_REQUEST', {
          message: `Order cannot be canceled in current status: ${order.status}`,
        })
      }
      return false
    }

    let newStatus: OrderStatus
    switch (order.kind) {
      case 'stripe-payment':
      case 'stripe-subscription': {
        // Cancel checkout session
        const session = order.object as Stripe.Checkout.Session
        await stripe.checkout.sessions.expire(session.id)
        newStatus = 'expired'
        break
      }
      case 'stripe-invoice': {
        const invoice = order.object as Stripe.Invoice
        if (invoice.status === 'draft') {
          await stripe.invoices.del(invoice.id!)
          newStatus = 'deleted'
        } else {
          await stripe.invoices.voidInvoice(invoice.id!)
          newStatus = 'void'
        }
        break
      }
      case 'stripe-payment-intent': {
        const paymentIntent = order.object as Stripe.PaymentIntent
        await stripe.paymentIntents.cancel(paymentIntent.id)
        newStatus = 'canceled'
        break
      }
    }

    // Update the order status within the transaction
    await tx
      .update(CreditsOrder)
      .set({
        status: newStatus,
      })
      .where(eq(CreditsOrder.id, order.id))

    // Get credits with select for update
    const credits = (
      await tx
        .select()
        .from(Credits)
        .where(
          organizationId ? eq(Credits.organizationId, organizationId) : eq(Credits.userId, userId!),
        )
        .for('update')
    )[0]

    if (credits) {
      const metadata = credits.metadata
      const update = clearIdFromMetadataByKind(order.objectId, metadata, order.kind)

      if (update) {
        await tx
          .update(Credits)
          .set({
            metadata,
          })
          .where(eq(Credits.id, credits.id))
      }
    }

    return true
  })
}

/**
 * Cancel credits orders by OrderKind
 * @param ctx - User context
 * @param orderKind - The kind of order to cancel
 * @param organizationId - Optional organization ID
 * @param throwOnInconsistency - Whether to throw an error if inconsistency occurs
 * @returns Promise<boolean | undefined> - Returns true if canceled successfully, false if cannot be canceled, undefined if no need to cancel
 */
export async function cancelCreditsOrdersByKind(
  orderKind: OrderKind,
  userId?: string | null,
  organizationId?: string | null,
  throwOnInconsistency = false,
): Promise<boolean | undefined> {
  // First, find the credits record
  const credits = await getDb().query.Credits.findFirst({
    where: organizationId
      ? eq(Credits.organizationId, organizationId)
      : eq(Credits.userId, userId!),
  })

  if (!credits) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Credits  not found',
    })
  }

  // Get the relevant ID from credits metadata based on orderKind
  let relevantId: string | undefined
  switch (orderKind) {
    case 'stripe-payment':
      relevantId = credits.metadata.onetimeRechargeSessionId
      break
    case 'stripe-payment-intent':
      relevantId = credits.metadata.autoRechargePaymentIntentId
      break
    case 'stripe-subscription':
      relevantId = credits.metadata.autoRechargeSessionId
      break
    case 'stripe-invoice':
      relevantId = credits.metadata.autoRechargeInvoiceId
      break
  }

  if (!relevantId) {
    return undefined
  }

  // Find the specific order using the objectId from metadata
  const order = await getDb().query.CreditsOrder.findFirst({
    where: and(
      eq(CreditsOrder.objectId, relevantId),
      eq(CreditsOrder.kind, orderKind),
      organizationId
        ? eq(CreditsOrder.organizationId, organizationId)
        : eq(CreditsOrder.userId, userId!),
    ),
  })

  if (!order) {
    if (throwOnInconsistency) {
      throw new ORPCError('NOT_FOUND', {
        message: `Order with objectId ${relevantId} not found`,
      })
    }

    await getDb().transaction(async (tx) => {
      // Get credits with select for update
      const lockedCredits = (
        await tx
          .select()
          .from(Credits)
          .where(
            organizationId
              ? eq(Credits.organizationId, organizationId)
              : eq(Credits.userId, userId!),
          )
          .for('update')
      )[0]!

      const metadata = lockedCredits.metadata
      const update = clearIdFromMetadataByKind(relevantId, metadata, orderKind)
      if (update) {
        await tx
          .update(Credits)
          .set({
            metadata,
          })
          .where(eq(Credits.id, lockedCredits.id))
      }
    })

    return undefined
  }

  return await cancelCreditsOrder(order.id, userId, organizationId, false)
}

/**
 * Create automatic recharge invoice
 * @param ctx - User context
 * @param organizationId - Optional organization ID
 * @param allowRecreate - Whether to allow recreating if an invoice already exists
 * @returns Promise<void>
 */
export async function createAutoRechargeInvoice(
  ctx: UserContext,
  organizationId?: string,
  allowRecreate = false,
): Promise<void> {
  const stripe = getStripe()

  const credits = await ctx.db.query.Credits.findFirst({
    where: organizationId
      ? eq(Credits.organizationId, organizationId)
      : eq(Credits.userId, ctx.auth.userId),
  })
  if (!credits) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Credits record not found',
    })
  }

  const metadata = credits.metadata
  if (!metadata.autoRechargeSubscriptionId) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Auto-recharge subscription does not exist',
    })
  }
  if (Number(credits.credits) > metadata.autoRechargeThreshold!) {
    throw new ORPCError('BAD_REQUEST', {
      message: `You have enough credits (${credits.credits}), no need to recharge`,
    })
  }

  // Get customer ID from credits metadata
  const customerId = metadata.customerId
  if (!customerId) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Customer ID not found in credits metadata',
    })
  }

  // Get recharge price
  if (!env.NEXT_PUBLIC_STRIPE_CREDITS_PRICE_ID) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Stripe top-up price ID is not configured',
    })
  }

  if (metadata.autoRechargeInvoiceId) {
    if (allowRecreate) {
      // Cancel any existing auto-recharge invoice orders before creating a new one
      const cancelled = await cancelCreditsOrdersByKind(
        'stripe-invoice',
        ctx.auth.userId,
        organizationId,
        false,
      )
      if (cancelled === false) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Cannot cancel existing auto-recharge invoice order',
        })
      }
    } else {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Auto-recharge invoice already exists',
      })
    }
  }

  const price = await stripe.prices.retrieve(env.NEXT_PUBLIC_STRIPE_CREDITS_PRICE_ID, {
    expand: ['product'],
  })
  if (
    !(
      price.active &&
      price.billing_scheme === 'per_unit' &&
      price.type === 'one_time' &&
      !!price.unit_amount_decimal
    )
  ) {
    log.error(`Stripe top-up price is not configured correctly:`, price)
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Stripe top-up price is not configured correctly',
    })
  }

  await stripe.invoiceItems.create({
    customer: customerId,
    pricing: {
      price: price.id,
    },
    quantity: Math.ceil(
      metadata.autoRechargeAmount! * 100 +
        Math.max(metadata.autoRechargeAmount! * 100 * cfg.platform.creditsFeeRate, 80),
    ),
    subscription: credits.metadata.autoRechargeSubscriptionId,
  })

  const { lastResponse: _, ...invoice } = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    auto_advance: true,
    metadata: {
      credits: metadata.autoRechargeAmount!.toString(),
    },
  })

  try {
    await ctx.db.transaction(async (tx) => {
      await tx.insert(CreditsOrder).values({
        type: organizationId ? 'organization' : 'user',
        userId: organizationId ? undefined : ctx.auth.userId,
        organizationId: organizationId,
        kind: 'stripe-invoice',
        status: invoice.status!,
        objectId: invoice.id!,
        object: invoice,
      })

      // Get credits with select for update
      const lockedCredits = (
        await tx
          .select()
          .from(Credits)
          .where(
            organizationId
              ? eq(Credits.organizationId, organizationId)
              : eq(Credits.userId, ctx.auth.userId),
          )
          .for('update')
      )[0]!

      if (lockedCredits.metadata.autoRechargeInvoiceId) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Auto-recharge invoice already exists',
        })
      }

      await tx
        .update(Credits)
        .set({
          metadata: {
            ...lockedCredits.metadata,
            autoRechargeInvoiceId: invoice.id!,
          },
        })
        .where(eq(Credits.id, lockedCredits.id))
    })
  } catch (err) {
    // If the order creation fails, we need to void the invoice.
    await stripe.invoices.voidInvoice(invoice.id!)

    throw err
  }
}

export async function triggerAutoRechargePaymentIntent(
  credits: Credits,
  allowRecreate = false,
): Promise<void> {
  const metadata = credits.metadata

  if (!metadata.autoRechargeEnabled) {
    return
  }

  if (Number(credits.credits) > metadata.autoRechargeThreshold!) {
    return
  }

  const customerId = metadata.customerId
  if (!customerId) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Customer ID not found in credits metadata',
    })
  }

  if (metadata.autoRechargePaymentIntentId) {
    if (allowRecreate) {
      // Cancel any existing auto-recharge payment intent orders before creating a new one
      const cancelled = await cancelCreditsOrdersByKind(
        'stripe-payment-intent',
        credits.userId,
        credits.organizationId,
        false,
      )
      if (cancelled === false) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Cannot cancel existing auto-recharge payment intent order',
        })
      }
    } else {
      return
    }
  }

  const stripe = getStripe()

  // Get customer to check for default payment method
  const customer = await stripe.customers.retrieve(customerId)
  if (customer.deleted) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Customer not found',
    })
  }

  // Use default payment method if available, otherwise use first available payment method
  const defaultPaymentMethod = customer.invoice_settings.default_payment_method
  let paymentMethodId =
    typeof defaultPaymentMethod === 'string' ? defaultPaymentMethod : defaultPaymentMethod?.id
  if (!paymentMethodId) {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
    })
    paymentMethodId = paymentMethods.data[0]?.id
  }

  if (!paymentMethodId) {
    return
  }

  const amount = Math.ceil(
    metadata.autoRechargeAmount! * 100 +
      Math.max(metadata.autoRechargeAmount! * 100 * cfg.platform.creditsFeeRate, 80),
  )

  let paymentIntent: Stripe.PaymentIntent | undefined

  try {
    await getDb().transaction(async (tx) => {
      // Get credits with select for update
      const lockedCredits = (
        await tx.select().from(Credits).where(eq(Credits.id, credits.id)).for('update')
      )[0]!

      if (lockedCredits.metadata.autoRechargePaymentIntentId) {
        return
      }

      const { lastResponse: _, ...pi } = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        customer: customerId,
        payment_method: paymentMethodId,
        // return_url: 'https://example.com/order/123/complete',
        off_session: true,
        confirm: true,
        metadata: {
          credits: metadata.autoRechargeAmount!.toString(),
        },
      })
      paymentIntent = pi

      await tx
        .update(Credits)
        .set({
          ...(paymentIntent.status === 'succeeded' && {
            credits: new Decimal(lockedCredits.credits)
              .add(metadata.autoRechargeAmount!)
              .toDecimalPlaces(10, Decimal.ROUND_FLOOR)
              .toString(),
          }),
          ...(paymentIntent.status !== 'succeeded' && {
            metadata: {
              ...lockedCredits.metadata,
              autoRechargePaymentIntentId: paymentIntent.id,
            },
          }),
        })
        .where(eq(Credits.id, lockedCredits.id))

      await tx.insert(CreditsOrder).values({
        type: credits.organizationId ? 'organization' : 'user',
        userId: credits.organizationId ? undefined : credits.userId,
        organizationId: credits.organizationId,
        kind: 'stripe-payment-intent',
        status: paymentIntent.status,
        objectId: paymentIntent.id,
        object: paymentIntent,
      })
    })
  } catch (err) {
    if (paymentIntent && paymentIntent.status !== 'succeeded') {
      // If error occurred, we need to cancel the payment intent.
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id)
      } catch (err) {
        log.error('Failed to cancel payment intent:', err)
      }
    }

    throw err
  }
}

function clearIdFromMetadataByKind(
  id: string,
  metadata: CreditsMetadata | undefined,
  kind: OrderKind,
) {
  switch (kind) {
    case 'stripe-payment':
      if (metadata?.onetimeRechargeSessionId === id) {
        metadata.onetimeRechargeSessionId = undefined
        return true
      }
      break
    case 'stripe-payment-intent':
      if (metadata?.autoRechargePaymentIntentId === id) {
        metadata.autoRechargePaymentIntentId = undefined
        return true
      }
      break
    case 'stripe-subscription':
      if (metadata?.autoRechargeSessionId === id) {
        assert(
          !metadata.autoRechargeSubscriptionId,
          'Auto-recharge subscription ID should not be set when auto-recharge session ID is set',
        )
        metadata.autoRechargeSessionId = undefined
        return true
      }
      break
    case 'stripe-invoice':
      if (metadata?.autoRechargeInvoiceId === id) {
        metadata.autoRechargeInvoiceId = undefined
        return true
      }
      break
  }
  return false
}
