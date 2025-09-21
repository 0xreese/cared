import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import { OrganizationScope } from '../auth'
import { getStripe } from '../client/stripe'
import { userProtectedProcedure } from '../orpc'
import { ensureCustomer } from './credits'

export const stripeRouter = {
  // Get customer information
  getCustomer: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/stripe/customer',
      tags: ['stripe'],
      summary: 'Get customer information from Stripe',
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
        const scope = OrganizationScope.fromOrganization({ headers: context.headers, db: context.db }, input.organizationId)
        await scope.checkPermissions()
      }

      const stripe = getStripe()
      const { customerId } = await ensureCustomer(context, stripe, input?.organizationId)

      const customer = await stripe.customers.retrieve(customerId)
      if (customer.deleted) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Customer not found',
        })
      }

      return {
        customer,
      }
    }),

  // List payment methods for a customer
  listPaymentMethods: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/stripe/payment-methods',
      tags: ['stripe'],
      summary: 'List payment methods for a customer',
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
        const scope = OrganizationScope.fromOrganization({ headers: context.headers, db: context.db }, input.organizationId)
        await scope.checkPermissions()
      }

      const stripe = getStripe()
      const { customerId } = await ensureCustomer(context, stripe, input?.organizationId)

      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        // Limit should be sufficient for most use cases
        limit: 100,
      })

      return {
        paymentMethods: paymentMethods.data,
      }
    }),

  // Add a new payment method using SetupIntent
  addPaymentMethod: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/stripe/payment-methods',
      tags: ['stripe'],
      summary: 'Add a new payment method using SetupIntent',
    })
    .input(
      z.object({
        organizationId: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.organizationId) {
        const scope = OrganizationScope.fromOrganization({ headers: context.headers, db: context.db }, input.organizationId)
        await scope.checkPermissions({ credits: ['create'] })
      }

      const stripe = getStripe()
      const { customerId } = await ensureCustomer(context, stripe, input.organizationId)

      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        usage: 'off_session',
        // Enable automatic payment methods to support multiple payment types
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          ...(!input.organizationId && { userId: context.auth.userId }),
          ...(input.organizationId && { organizationId: input.organizationId }),
        },
      })

      return {
        setupIntentClientSecret: setupIntent.client_secret!,
        setupIntentId: setupIntent.id,
      }
    }),

  // Remove a payment method
  removePaymentMethod: userProtectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/stripe/payment-methods/{paymentMethodId}',
      tags: ['stripe'],
      summary: 'Remove a payment method',
    })
    .input(
      z.object({
        organizationId: z.string().optional(),
        paymentMethodId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.organizationId) {
        const scope = OrganizationScope.fromOrganization({ headers: context.headers, db: context.db }, input.organizationId)
        await scope.checkPermissions({ credits: ['delete'] })
      }

      const stripe = getStripe()
      const { customerId } = await ensureCustomer(context, stripe, input.organizationId)

      // Verify the payment method belongs to the customer
      const paymentMethod = await stripe.paymentMethods.retrieve(input.paymentMethodId)
      if (paymentMethod.customer !== customerId) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Payment method not found',
        })
      }

      await stripe.paymentMethods.detach(input.paymentMethodId)
    }),

  // Update customer's default payment method
  updateDefaultPaymentMethod: userProtectedProcedure
    .route({
      method: 'PUT',
      path: '/v1/stripe/payment-methods/{paymentMethodId}/default',
      tags: ['stripe'],
      summary: 'Update customer default payment method',
    })
    .input(
      z.object({
        organizationId: z.string().optional(),
        paymentMethodId: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.organizationId) {
        const scope = OrganizationScope.fromOrganization({ headers: context.headers, db: context.db }, input.organizationId)
        await scope.checkPermissions({ credits: ['update'] })
      }

      const stripe = getStripe()
      const { customerId } = await ensureCustomer(context, stripe, input.organizationId)

      // Verify the payment method belongs to the customer
      const paymentMethod = await stripe.paymentMethods.retrieve(input.paymentMethodId)
      if (paymentMethod.customer !== customerId) {
        throw new ORPCError('BAD_REQUEST', {
          message: 'Payment method not found',
        })
      }

      // Update customer's default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: input.paymentMethodId,
        },
      })
    }),

  // Create customer session for pricing table
  createCustomerSession: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/stripe/customer-session',
      tags: ['stripe'],
      summary: 'Create customer session for pricing table',
    })
    .input(
      z.object({
        organizationId: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      if (input.organizationId) {
        const scope = OrganizationScope.fromOrganization({ headers: context.headers, db: context.db }, input.organizationId)
        await scope.checkPermissions({ credits: ['create'] })
      }

      const stripe = getStripe()
      const { customerId } = await ensureCustomer(context, stripe, input.organizationId)

      const customerSession = await stripe.customerSessions.create({
        customer: customerId,
        components: {
          pricing_table: {
            enabled: true,
          },
        },
      })

      return {
        customerSession,
      }
    }),
}
