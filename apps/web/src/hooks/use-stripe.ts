import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { orpc } from '@/lib/orpc'

/**
 * Hook to get customer information
 */
export function useCustomer(organizationId?: string) {
  const { data, refetch, isLoading } = useQuery({
    ...orpc.stripe.getCustomer.queryOptions({
      input: {
        organizationId,
      }
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: Infinity,
  })

  return {
    customer: data?.customer,
    refetchCustomer: refetch,
    isLoading,
  }
}

export function useDefaultPaymentMethodId(organizationId?: string) {
  const { customer } = useCustomer(organizationId)
  const defaultPaymentMethod = customer?.invoice_settings.default_payment_method
  return typeof defaultPaymentMethod === 'string' ? defaultPaymentMethod : defaultPaymentMethod?.id
}

/**
 * Hook to list payment methods for a customer
 */
export function useListPaymentMethods(organizationId?: string) {
  const { data, refetch, isLoading } = useQuery({
    ...orpc.stripe.listPaymentMethods.queryOptions({
      input: {
        organizationId,
      }
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: Infinity,
  })

  return {
    paymentMethods: data?.paymentMethods,
    refetchPaymentMethods: refetch,
    isLoading,
  }
}

/**
 * Hook to add a new payment method using SetupIntent
 */
export function useAddPaymentMethod(organizationId?: string) {
  const queryClient = useQueryClient()

  const addMutation = useMutation(
    orpc.stripe.addPaymentMethod.mutationOptions({
      onSuccess: () => {
        // Invalidate payment methods list to refresh the data
        void queryClient.invalidateQueries({
          queryKey: orpc.stripe.listPaymentMethods.queryKey({
            organizationId,
          }),
        })
      },
      onError: (_error) => {
        // toast.error(`Failed to setup payment method: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async () => {
      return await addMutation.mutateAsync({
        organizationId,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId],
  )
}

/**
 * Hook to remove a payment method
 */
export function useRemovePaymentMethod(organizationId?: string) {
  const queryClient = useQueryClient()

  const removeMutation = useMutation(
    orpc.stripe.removePaymentMethod.mutationOptions({
      onSuccess: () => {
        // Invalidate payment methods list to refresh the data
        void queryClient.invalidateQueries({
          queryKey: orpc.stripe.listPaymentMethods.queryKey({
            organizationId,
          }),
        })
      },
      onError: (error) => {
        toast.error(`Failed to remove payment method: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (paymentMethodId: string) => {
      return await removeMutation.mutateAsync({
        paymentMethodId,
        organizationId,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId],
  )
}

/**
 * Hook to update customer's default payment method
 */
export function useUpdateDefaultPaymentMethod(organizationId?: string) {
  const queryClient = useQueryClient()

  const updateMutation = useMutation(
    orpc.stripe.updateDefaultPaymentMethod.mutationOptions({
      onSuccess: () => {
        // Invalidate customer data to refresh the default payment method
        void queryClient.invalidateQueries({
          queryKey: orpc.stripe.getCustomer.queryKey({
            organizationId,
          }),
        })
      },
      onError: (error) => {
        toast.error(`Failed to update default payment method: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (paymentMethodId: string) => {
      return await updateMutation.mutateAsync({
        organizationId,
        paymentMethodId,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId],
  )
}
