import type { Context } from 'hono'
import type { Stripe } from 'stripe'
import { Decimal } from 'decimal.js'
import hash from 'stable-hash'

import { eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { Credits, CreditsOrder } from '@cared/db/schema'
import log from '@cared/log'

import { getStripe } from '../../client/stripe'
import { env } from '../../env'

export async function POST(c: Context): Promise<Response> {
  const stripe = getStripe()

  let event: Stripe.Event

  if (env.STRIPE_WEBHOOK_SECRET) {
    try {
      const stripeSignature = c.req.header('stripe-signature')
      if (!stripeSignature) {
        return c.json({ message: 'Payment webhook error: Missing stripe-signature header' }, 400)
      }

      event = stripe.webhooks.constructEvent(
        await c.req.text(),
        stripeSignature,
        env.STRIPE_WEBHOOK_SECRET,
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.log(`❌ Payment webhook error: ${errorMessage}`)
      return c.json({ message: `Payment webhook error: ${errorMessage}` }, 400)
    }
  } else {
    event = await c.req.json()
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        {
          const session = event.data.object
          log.info(
            `Received checkout session event: ${event.type} for checkout session with id ${session.id}`,
          )

          await getDb().transaction(async (tx) => {
            const order = (
              await tx
                .select()
                .from(CreditsOrder)
                .where(eq(CreditsOrder.objectId, session.id))
                .for('update')
            )[0]

            if (order) {
              if (hash(order.object) !== hash(session)) {
                await tx
                  .update(CreditsOrder)
                  .set({
                    status: session.status!,
                    object: session,
                  })
                  .where(eq(CreditsOrder.id, order.id))
              }

              if (
                (event.type === 'checkout.session.completed' ||
                  event.type === 'checkout.session.async_payment_succeeded') &&
                session.mode === 'payment' &&
                session.status === 'complete' &&
                session.payment_status === 'paid' &&
                order.status !== 'complete'
              ) {
                const delta = !isNaN(Number(session.metadata?.credits))
                  ? Number(session.metadata?.credits)
                  : 0

                if (delta) {
                  const credits = (
                    await tx
                      .select()
                      .from(Credits)
                      .where(
                        order.type === 'organization'
                          ? eq(Credits.organizationId, order.organizationId!)
                          : eq(Credits.userId, order.userId!),
                      )
                      .for('update')
                  )[0]

                  if (credits?.metadata.onetimeRechargeSessionId === session.id) {
                    await tx
                      .update(Credits)
                      .set({
                        credits: new Decimal(credits.credits)
                          .add(delta)
                          .toDecimalPlaces(10, Decimal.ROUND_FLOOR)
                          .toString(),
                        metadata: {
                          ...credits.metadata,
                          onetimeRechargeSessionId: undefined,
                        },
                      })
                      .where(eq(Credits.id, credits.id))
                  } else {
                    const entityType = order.type === 'organization' ? 'organization' : 'user'
                    const entityId =
                      order.type === 'organization' ? order.organizationId : order.userId
                    if (!credits) {
                      log.error(
                        `${entityType} credits not found for ${entityType} with id ${entityId}`,
                      )
                    } else {
                      log.error(
                        `onetimeRechargeSessionId mismatched for ${entityType} with id ${entityId}`,
                      )
                    }
                  }
                } else {
                  log.error(
                    `Invalid quantity for checkout session with id ${session.id}: credits=${delta}`,
                    session,
                  )
                }
              }

              if (
                (event.type === 'checkout.session.completed' ||
                  event.type === 'checkout.session.async_payment_succeeded') &&
                session.mode === 'subscription' &&
                session.status === 'complete' &&
                (session.payment_status === 'paid' ||
                  session.payment_status === 'no_payment_required') &&
                order.status !== 'complete'
              ) {
                const subscriptionId =
                  typeof session.subscription === 'string'
                    ? session.subscription
                    : session.subscription?.id

                if (subscriptionId) {
                  const credits = (
                    await tx
                      .select()
                      .from(Credits)
                      .where(
                        order.type === 'organization'
                          ? eq(Credits.organizationId, order.organizationId!)
                          : eq(Credits.userId, order.userId!),
                      )
                      .for('update')
                  )[0]

                  if (credits?.metadata.autoRechargeSessionId === session.id) {
                    await tx
                      .update(Credits)
                      .set({
                        metadata: {
                          ...credits.metadata,
                          autoRechargeSubscriptionId: subscriptionId,
                        },
                      })
                      .where(eq(Credits.id, credits.id))
                  } else {
                    const entityType = order.type === 'organization' ? 'organization' : 'user'
                    const entityId =
                      order.type === 'organization' ? order.organizationId : order.userId
                    if (!credits) {
                      log.error(
                        `${entityType} credits not found for ${entityType} with id ${entityId}`,
                      )
                    } else {
                      log.error(
                        `autoRechargeSessionId mismatched for ${entityType} with id ${entityId}`,
                      )
                    }
                  }
                } else {
                  log.error(
                    `Invalid subscription id for checkout session with id ${session.id}: subscriptionId=${subscriptionId}`,
                    session,
                  )
                }
              }
            } else {
              log.error(`Order not found for checkout session with id ${session.id}`)
            }
          })
        }
        break

      case 'payment_intent.created':
        break
      case 'payment_intent.amount_capturable_updated':
      case 'payment_intent.canceled':
      case 'payment_intent.partially_funded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.processing':
      case 'payment_intent.requires_action':
      case 'payment_intent.succeeded':
        {
          const paymentIntent = event.data.object
          log.info(
            `Received payment intent event: ${event.type} for payment intent with id ${paymentIntent.id}`,
          )

          await getDb().transaction(async (tx) => {
            const order = (
              await tx
                .select()
                .from(CreditsOrder)
                .where(eq(CreditsOrder.objectId, paymentIntent.id))
                .for('update')
            )[0]

            if (order) {
              if (hash(order.object) !== hash(paymentIntent)) {
                await tx
                  .update(CreditsOrder)
                  .set({
                    status: paymentIntent.status,
                    object: paymentIntent,
                  })
                  .where(eq(CreditsOrder.id, order.id))
              }

              if (
                event.type === 'payment_intent.succeeded' &&
                paymentIntent.status === 'succeeded' &&
                order.status !== 'succeeded'
              ) {
                const quantity = Math.floor(paymentIntent.amount_received) / 100
                const delta = !isNaN(Number(paymentIntent.metadata.credits))
                  ? Number(paymentIntent.metadata.credits)
                  : 0

                const credits = (
                  await tx
                    .select()
                    .from(Credits)
                    .where(
                      order.type === 'organization'
                        ? eq(Credits.organizationId, order.organizationId!)
                        : eq(Credits.userId, order.userId!),
                    )
                    .for('update')
                )[0]

                if (credits?.metadata.autoRechargePaymentIntentId === paymentIntent.id) {
                  await tx
                    .update(Credits)
                    .set({
                      ...(quantity &&
                        delta &&
                        quantity >= delta && {
                          credits: new Decimal(credits.credits)
                            .add(delta)
                            .toDecimalPlaces(10, Decimal.ROUND_FLOOR)
                            .toString(),
                        }),
                      metadata: {
                        ...credits.metadata,
                        autoRechargePaymentIntentId: undefined,
                      },
                    })
                    .where(eq(Credits.id, credits.id))
                } else {
                  const entityType = order.type === 'organization' ? 'organization' : 'user'
                  const entityId =
                    order.type === 'organization' ? order.organizationId : order.userId
                  if (!credits) {
                    log.error(
                      `${entityType} credits not found for ${entityType} with id ${entityId}`,
                    )
                  } else {
                    log.error(
                      `autoRechargePaymentIntentId mismatched for ${entityType} with id ${entityId}`,
                    )
                  }
                }
              }
            } else {
              log.error(`Order not found for payment intent with id ${paymentIntent.id}`)
            }
          })
        }
        break
      case 'invoice.created':
      case 'invoice.deleted':
      case 'invoice.finalization_failed':
      case 'invoice.finalized':
      case 'invoice.marked_uncollectible':
      case 'invoice.overdue':
      case 'invoice.overpaid':
      case 'invoice.paid':
      case 'invoice.payment_action_required':
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded':
      case 'invoice.sent':
      case 'invoice.upcoming':
      case 'invoice.updated':
      case 'invoice.voided':
      case 'invoice.will_be_due':
        {
          const invoice = event.data.object
          log.info(`Received invoice event: ${event.type} for invoice with id ${invoice.id}`)

          await getDb().transaction(async (tx) => {
            const order = (
              await tx
                .select()
                .from(CreditsOrder)
                .where(eq(CreditsOrder.objectId, invoice.id!))
                .for('update')
            )[0]

            if (order) {
              if (hash(order.object) !== hash(invoice)) {
                await tx
                  .update(CreditsOrder)
                  .set({
                    status: event.type === 'invoice.deleted' ? invoice.status! : 'deleted',
                    object: invoice,
                  })
                  .where(eq(CreditsOrder.id, order.id))
              }

              if (
                (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') &&
                invoice.status === 'paid' &&
                order.status !== 'paid'
              ) {
                const quantity = Math.floor(invoice.amount_paid) / 100
                const delta = !isNaN(Number(invoice.metadata?.credits))
                  ? Number(invoice.metadata?.credits)
                  : 0

                if (quantity && delta && quantity >= delta) {
                  const credits = (
                    await tx
                      .select()
                      .from(Credits)
                      .where(
                        order.type === 'organization'
                          ? eq(Credits.organizationId, order.organizationId!)
                          : eq(Credits.userId, order.userId!),
                      )
                      .for('update')
                  )[0]

                  if (credits?.metadata.autoRechargeInvoiceId === invoice.id!) {
                    await tx
                      .update(Credits)
                      .set({
                        credits: new Decimal(credits.credits)
                          .add(delta)
                          .toDecimalPlaces(10, Decimal.ROUND_FLOOR)
                          .toString(),
                        metadata: {
                          ...credits.metadata,
                          autoRechargeInvoiceId: undefined,
                        },
                      })
                      .where(eq(Credits.id, credits.id))
                  } else {
                    const entityType = order.type === 'organization' ? 'organization' : 'user'
                    const entityId =
                      order.type === 'organization' ? order.organizationId : order.userId
                    if (!credits) {
                      log.error(
                        `${entityType} credits not found for ${entityType} with id ${entityId}`,
                      )
                    } else {
                      log.error(
                        `autoRechargeInvoiceId mismatched for ${entityType} with id ${entityId}`,
                      )
                    }
                  }
                } else {
                  log.error(
                    `Invalid quantity for invoice with id ${invoice.id}: quantity=${quantity}, credits=${delta}`,
                    invoice,
                  )
                }
              }
            } else {
              log.error(`Order not found for invoice with id ${invoice.id}`)
            }
          })
        }
        break
      default:
        throw new Error(`Unhandled event: ${event.type}`)
    }
  } catch (error) {
    console.log(error)
    return c.json({ message: 'Webhook handler failed' }, 500)
  }

  // Return a response to acknowledge receipt of the event.
  return c.json({ message: 'Received' }, 200)
}
