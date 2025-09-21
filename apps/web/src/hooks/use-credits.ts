import { useCallback, useEffect } from 'react'
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { atom, useAtom } from 'jotai'
import { toast } from 'sonner'

import { orpc } from '@/lib/orpc'

const PAGE_SIZE = 100

export function useCredits(organizationId?: string) {
  const {
    data: { credits },
    refetch: refetchCredits,
  } = useSuspenseQuery(
    orpc.credits.getCredits.queryOptions({
      input: {
        organizationId,
      },
    }),
  )
  return {
    credits,
    refetchCredits,
  }
}

const hasAttemptedFetchAtom = atom(false)

export function useListCreditsOrders(organizationId?: string) {
  const { data, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(
    orpc.credits.listOrders.infiniteOptions({
      input: (cursor?: string) => ({
        organizationId,
        // statuses: ['open', 'complete', 'draft', 'paid'],
        cursor,
        limit: PAGE_SIZE,
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasMore) return undefined
        return lastPage.cursor
      },
      placeholderData: keepPreviousData,
    }),
  )

  const [hasAttemptedFetch, setHasAttemptedFetch] = useAtom(hasAttemptedFetchAtom)

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !hasAttemptedFetch) {
      console.log('Fetching credits orders...')
      setHasAttemptedFetch(true)
      void fetchNextPage().finally(() => setHasAttemptedFetch(false))
    }
  }, [fetchNextPage, hasAttemptedFetch, hasNextPage, isFetchingNextPage, setHasAttemptedFetch])

  return {
    creditsOrdersPages: data?.pages,
    refetchCreditsOrders: refetch,
  }
}

export function useCreateCreditsOnetimeCheckout(organizationId?: string) {
  const { refetchCredits } = useCredits(organizationId)
  const { refetchCreditsOrders } = useListCreditsOrders(organizationId)

  const createMutation = useMutation(
    orpc.credits.createOnetimeCheckout.mutationOptions({
      onSuccess: () => {
        void refetchCredits()
        void refetchCreditsOrders()
      },
    }),
  )

  return useCallback(
    async (credits: number) => {
      return await createMutation.mutateAsync({
        organizationId,
        credits,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId],
  )
}

export function useListCreditsSubscriptions(organizationId?: string) {
  const { data, refetch } = useQuery({
    ...orpc.credits.listSubscriptions.queryOptions({
      input: {
        organizationId,
      },
    }),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  return {
    creditsSubscriptions: data?.subscriptions,
    refetchCreditsSubscriptions: refetch,
  }
}

export function useUpdateAutoRechargeCreditsSettings(organizationId?: string) {
  const { refetchCredits } = useCredits(organizationId)

  const updateMutation = useMutation(
    orpc.credits.updateAutoRechargeSettings.mutationOptions({
      onSuccess: () => {
        void refetchCredits()
      },
      onError: (error) => {
        toast.error(`Failed to update auto top-up settings: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (enabled: boolean, threshold?: number, amount?: number) => {
      return await updateMutation.mutateAsync({
        organizationId,
        enabled,
        threshold,
        amount,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId],
  )
}

/**
 * Hook to cancel a credits order
 */
export function useCancelCreditsOrder(organizationId?: string) {
  const { refetchCredits } = useCredits(organizationId)
  const { refetchCreditsOrders } = useListCreditsOrders(organizationId)

  const cancelMutation = useMutation(
    orpc.credits.cancelOrder.mutationOptions({
      onSuccess: () => {
        void refetchCredits()
        void refetchCreditsOrders()
      },
      onError: (error) => {
        toast.error(`Failed to cancel order: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (orderId: string) => {
      return await cancelMutation.mutateAsync({
        orderId,
        organizationId,
      })
    },
    [cancelMutation, organizationId],
  )
}
