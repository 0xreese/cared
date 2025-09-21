import type Stripe from 'stripe'
import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import type { SQL } from '@cared/db'
import type { OrderStatus } from '@cared/db/schema'
import { getWebUrl } from '@cared/auth/client'
import { and, desc, eq, inArray, lt, lte } from '@cared/db'
import { Credits, CreditsOrder, Member, orderKinds, Organization, User } from '@cared/db/schema'
import log from '@cared/log'

import type { UserContext } from '../orpc'
import { OrganizationScope } from '../auth'
import { getStripe } from '../client/stripe'
import { cfg } from '../config'
import { env } from '../env'
import {
  cancelCreditsOrder,
  cancelCreditsOrdersByKind,
  createAutoRechargeInvoice,
  triggerAutoRechargePaymentIntent,
} from '../operation'
import { userProtectedProcedure } from '../orpc'
import { stripIdPrefix } from '../utils'

export async function ensureCustomer(ctx: UserContext, stripe: Stripe, organizationId?: string) {
  return await ctx.db.transaction(async (tx) => {
    let credits = (
      await tx
        .select()
        .from(Credits)
        .where(
          organizationId
            ? eq(Credits.organizationId, organizationId)
            : eq(Credits.userId, ctx.auth.userId),
        )
        .for('update')
    ) // lock
      .at(0)
    if (credits?.metadata.customerId) {
      return {
        customerId: credits.metadata.customerId,
        credits,
      }
    }

    let customer

    if (!organizationId) {
      const user = (await tx.select().from(User).where(eq(User.id, ctx.auth.userId)).for('update')) // lock
        .at(0)
      if (!user) {
        throw new ORPCError('NOT_FOUND', {
          message: `User with id ${ctx.auth.userId} not found`,
        })
      }

      customer = await stripe.customers.create({
        name: user.name,
        email: user.email,
        metadata: {
          userId: user.id,
        },
      })
    } else {
      const { organization, owner } =
        (
          await tx
            .select({
              organization: Organization,
              owner: User,
            })
            .from(Organization)
            .innerJoin(
              Member,
              and(eq(Member.organizationId, Organization.id), eq(Member.role, 'owner')),
            )
            .innerJoin(User, eq(User.id, Member.userId))
            .where(eq(Organization.id, organizationId))
            .for('update')
        ) // lock
          .at(0) ?? {}
      if (!organization || !owner) {
        throw new ORPCError('NOT_FOUND', {
          message: `Organization with id ${organizationId} not found`,
        })
      }

      customer = await stripe.customers.create({
        name: organization.name,
        email: owner.email,
        metadata: {
          organizationId: organization.id,
        },
      })
    }

    if (!credits) {
      credits = (
        await tx
          .insert(Credits)
          .values({
            type: organizationId ? 'organization' : 'user',
            userId: organizationId ? undefined : ctx.auth.userId,
            organizationId: organizationId,
            credits: '0',
            metadata: {
              customerId: customer.id,
            },
          })
          .returning()
      ).at(0)!
    } else {
      credits = (
        await tx
          .update(Credits)
          .set({
            metadata: {
              ...credits.metadata,
              customerId: customer.id,
            },
          })
          .where(eq(Credits.id, credits.id))
          .returning()
      ).at(0)!
    }

    return {
      customerId: customer.id,
      credits,
    }
  })
}

async function getRechargePrice(stripe: Stripe) {
  if (!env.NEXT_PUBLIC_STRIPE_CREDITS_PRICE_ID) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Stripe top-up price ID is not configured',
    })
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

  return price
}

export const creditsRouter = {
  getCredits: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/credits',
      tags: ['credits'],
      summary: 'Get credits information for current user or organization',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      if (input?.organizationId) {
        const scope = OrganizationScope.fromOrganization(
          {
            headers: context.headers,
            db: context.db,
          },
          input.organizationId,
        )
        await scope.checkPermissions()
      }

      const stripe = getStripe()
      const { credits } = await ensureCustomer(context, stripe, input?.organizationId)

      return {
        credits,
      }
    }),

  listOrders: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/credits/orders',
      tags: ['credits'],
      summary: 'List credits orders for current user or organization',
    })
    .input(
      z.object({
        organizationId: z.string().optional(),
        orderKinds: z.array(z.enum(orderKinds)).optional(),
        statuses: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.organizationId) {
        const scope = OrganizationScope.fromOrganization(
          {
            headers: context.headers,
            db: context.db,
          },
          input.organizationId,
        )
        await scope.checkPermissions()
      }

      const conditions: SQL<unknown>[] = [
        input.organizationId
          ? eq(CreditsOrder.organizationId, input.organizationId)
          : eq(CreditsOrder.userId, context.auth.userId),
      ]
      if (input.orderKinds) {
        conditions.push(inArray(CreditsOrder.kind, input.orderKinds))
      }
      if (input.statuses) {
        conditions.push(inArray(CreditsOrder.status, input.statuses as OrderStatus[]))
      }
      if (input.cursor) {
        conditions.push(lt(CreditsOrder.id, input.cursor))
      }
      const query = and(...conditions)

      while (true) {
        const orders = await context.db
          .select()
          .from(CreditsOrder)
          .where(query)
          .orderBy(desc(CreditsOrder.id))
          .limit(input.limit + 1)

        const hasMore = orders.length > input.limit
        if (hasMore) {
          orders.pop()
        }
        const cursor = orders.at(-1)?.id

        const oneWeekAgo = new Date()
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
        if (
          orders.find(
            (order) =>
              ['expired', 'void', 'deleted'].includes(order.status) &&
              order.updatedAt <= oneWeekAgo,
          )
        ) {
          await context.db
            .delete(CreditsOrder)
            .where(
              and(
                input.organizationId
                  ? eq(CreditsOrder.organizationId, input.organizationId)
                  : eq(CreditsOrder.userId, context.auth.userId),
                inArray(CreditsOrder.status, ['expired', 'void', 'deleted']),
                lte(CreditsOrder.updatedAt, oneWeekAgo),
              ),
            )

          continue
        }

        return {
          orders: orders.map((order) => ({
            ...order,
            status: order.status as Stripe.Checkout.Session.Status | Stripe.Invoice.Status,
          })),
          hasMore,
          cursor,
        }
      }
    }),

  cancelOrder: userProtectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/credits/orders/{orderId}',
      tags: ['credits'],
      summary: 'Cancel a credits order',
    })
    .input(
      z.object({
        orderId: z.string(),
        organizationId: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.organizationId) {
        const scope = OrganizationScope.fromOrganization(
          {
            headers: context.headers,
            db: context.db,
          },
          input.organizationId,
        )
        await scope.checkPermissions({ credits: ['delete'] })
      }

      await cancelCreditsOrder(input.orderId, context.auth.userId, input.organizationId, true)
    }),

  createOnetimeCheckout: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/credits/checkout',
      tags: ['credits'],
      summary: 'Create a one-time checkout session for credits purchase',
    })
    .input(
      z.object({
        organizationId: z.string().optional(),
        credits: z.int().min(5).max(2500),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.organizationId) {
        const scope = OrganizationScope.fromOrganization(
          {
            headers: context.headers,
            db: context.db,
          },
          input.organizationId,
        )
        await scope.checkPermissions({ credits: ['create'] })
      }

      const stripe = getStripe()

      // Cancel any existing onetime recharge orders before creating a new one
      const cancelled = await cancelCreditsOrdersByKind(
        'stripe-payment',
        context.auth.userId,
        input.organizationId,
        false,
      )
      if (cancelled === false) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Cannot cancel existing onetime recharge order',
        })
      }

      const { customerId, credits } = await ensureCustomer(context, stripe, input.organizationId)

      const returnUrl =
        getCreditsBaseUrl(input.organizationId) + `?onetimeCheckoutSessionId={CHECKOUT_SESSION_ID}`

      const price = await getRechargePrice(stripe)

      const session = await stripe.checkout.sessions.create({
        ui_mode: 'embedded',
        line_items: [
          {
            price: price.id,
            quantity: Math.ceil(
              input.credits * 100 + Math.max(input.credits * 100 * cfg.platform.creditsFeeRate, 80),
            ),
          },
        ],
        mode: 'payment',
        return_url: returnUrl,
        // TODO: You must have a valid origin address to enable automatic tax calculation
        automatic_tax: { enabled: false },
        customer: customerId,
        payment_intent_data: {
          setup_future_usage: 'off_session',
        },
        payment_method_data: {
          allow_redisplay: 'always',
        },
        saved_payment_method_options: {
          // payment_method_save: 'enabled',
        },
        metadata: {
          credits: input.credits.toString(),
        },
      })

      try {
        await context.db.transaction(async (tx) => {
          await tx.insert(CreditsOrder).values({
            type: input.organizationId ? 'organization' : 'user',
            userId: input.organizationId ? undefined : context.auth.userId,
            organizationId: input.organizationId,
            kind: 'stripe-payment',
            status: session.status!,
            objectId: session.id,
            object: session,
          })

          // Get credits with select for update to ensure proper locking
          const lockedCredits = (
            await tx.select().from(Credits).where(eq(Credits.id, credits.id)).for('update')
          ).at(0)!
          if (lockedCredits.metadata.onetimeRechargeSessionId) {
            throw new ORPCError('BAD_REQUEST', {
              message: 'Onetime recharge session already exists',
            })
          }

          await tx
            .update(Credits)
            .set({
              metadata: {
                ...credits.metadata,
                onetimeRechargeSessionId: session.id,
              },
            })
            .where(eq(Credits.id, credits.id))
        })
      } catch (err) {
        // If the order creation fails, we need to expire the checkout session.
        await stripe.checkout.sessions.expire(session.id)

        throw err
      }

      return {
        sessionClientSecret: session.client_secret!,
        sessionId: session.id,
      }
    }),

  listSubscriptions: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/credits/subscriptions',
      tags: ['credits'],
      summary: 'List Stripe subscriptions for current user or organization',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      if (input?.organizationId) {
        const scope = OrganizationScope.fromOrganization(
          {
            headers: context.headers,
            db: context.db,
          },
          input.organizationId,
        )
        await scope.checkPermissions()
      }

      const stripe = getStripe()

      const { customerId } = await ensureCustomer(context, stripe, input?.organizationId)

      const result = await stripe.subscriptions.list({
        customer: customerId,
        // NOTE: There should not be many non-canceled subscriptions, so we can safely use a high limit and avoid pagination.
        limit: 100,
      })

      return {
        subscriptions: result.data,
      }
    }),

  createAutoRechargeInvoice: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/credits/auto-recharge/invoice',
      tags: ['credits'],
      summary: 'Create an auto-recharge invoice for credits',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      if (input?.organizationId) {
        const scope = OrganizationScope.fromOrganization(
          {
            headers: context.headers,
            db: context.db,
          },
          input.organizationId,
        )
        await scope.checkPermissions({ credits: ['create'] })
      }

      await createAutoRechargeInvoice(context, input?.organizationId, true)
    }),

  createAutoRechargePayment: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/credits/auto-recharge/payment',
      tags: ['credits'],
      summary: 'Create an auto-recharge payment intent for credits',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      if (input?.organizationId) {
        const scope = OrganizationScope.fromOrganization(
          {
            headers: context.headers,
            db: context.db,
          },
          input.organizationId,
        )
        await scope.checkPermissions({ credits: ['create'] })
      }

      const credits = await context.db.query.Credits.findFirst({
        where: input?.organizationId
          ? eq(Credits.organizationId, input.organizationId)
          : eq(Credits.userId, context.auth.userId),
      })
      if (!credits) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Credits record not found',
        })
      }

      await triggerAutoRechargePaymentIntent(credits, true)
    }),

  updateAutoRechargeSettings: userProtectedProcedure
    .route({
      method: 'PUT',
      path: '/v1/credits/auto-recharge/settings',
      tags: ['credits'],
      summary: 'Update auto-recharge settings for credits',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          enabled: z.boolean().optional(),
          threshold: z.int().min(5).max(2500).optional(),
          amount: z.int().min(5).max(2500).optional(),
        })
        .refine(
          (data) => {
            // If enabled, threshold and amount must be provided
            if (data.enabled) {
              return data.amount && data.threshold && data.amount >= data.threshold
            }
            return true
          },
          {
            message:
              'Auto-recharge amount must be greater than or equal to the threshold when enabled',
          },
        ),
    )
    .handler(async ({ context, input }) => {
      // Permission check: select permission based on operation type
      if (input.organizationId) {
        const scope = OrganizationScope.fromOrganization(
          {
            headers: context.headers,
            db: context.db,
          },
          input.organizationId,
        )
        await scope.checkPermissions({ credits: ['update'] })
      }

      const { credits } = await ensureCustomer(context, getStripe(), input.organizationId)

      await context.db.transaction(async (tx) => {
        // Get credits with select for update to ensure proper locking
        const _lockedCredits = (
          await tx.select().from(Credits).where(eq(Credits.id, credits.id)).for('update')
        ).at(0)!

        // Build update data
        const updateData = {
          ...credits.metadata,
        }

        if (!input.enabled) {
          updateData.autoRechargeEnabled = false
          updateData.autoRechargeThreshold = undefined
          updateData.autoRechargeAmount = undefined
        } else {
          updateData.autoRechargeEnabled = true
          updateData.autoRechargeThreshold = input.threshold
          updateData.autoRechargeAmount = input.amount
        }

        await tx.update(Credits).set({ metadata: updateData }).where(eq(Credits.id, credits.id))
      })
    }),
}

export function getCreditsBaseUrl(organizationId?: string) {
  const segment = organizationId ? `org/${stripIdPrefix(organizationId)}` : 'account'
  return `${getWebUrl()}/${segment}/credits`
}
