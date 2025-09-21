import { useCallback, useMemo } from 'react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'

import { showErrorToast, showSuccessToast } from '@/components/toast'
import { orpc } from '@/lib/orpc'

export function useTraces(input?: {
  userId?: string
  organizationId?: string
  workspaceId?: string
  appId?: string
  sessionId?: string
  fromTimestamp?: string
  toTimestamp?: string
  pageSize?: number
}) {
  const { data, isLoading, isFetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(
      orpc.telemetry.listTraces.infiniteOptions({
        input: (cursor?: number) => ({
          ...input,
          cursor,
          limit: input?.pageSize ?? 50,
        }),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => {
          if (!lastPage.hasMore) return undefined
          return lastPage.cursor
        },
      }),
    )

  const traces = useMemo(() => {
    return data?.pages.flatMap((page) => page.traces) ?? []
  }, [data])

  const total = data?.pages[0]?.total ?? 0

  return {
    traces,
    total,
    isLoading,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  }
}

export function useObservations(input?: {
  userId?: string
  organizationId?: string
  workspaceId?: string
  appId?: string
  traceId?: string
  type?: string
  level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR'
  parentObservationId?: string
  fromStartTime?: string
  toStartTime?: string
  pageSize?: number
}) {
  const {
    data,
    isSuccess,
    isLoading,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    orpc.telemetry.listObservations.infiniteOptions({
      input: (cursor?: number) => ({
        ...input,
        cursor,
        limit: input?.pageSize ?? 50,
      }),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasMore) return undefined
        return lastPage.cursor
      },
    }),
  )

  const observations = useMemo(() => {
    return data?.pages.flatMap((page) => page.observations) ?? []
  }, [data])

  const total = data?.pages[0]?.total ?? 0

  return {
    observations,
    total,
    isSuccess,
    isLoading,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  }
}

export function useDeleteTraces() {
  const deleteMutation = useMutation(
    orpc.telemetry.deleteTraces.mutationOptions({
      onSuccess: (_, input) => {
        showSuccessToast({
          title: `${input.traceIds.length > 1 ? 'traces' : 'trace'} deleted`,
          description: `Selected ${input.traceIds.length > 1 ? 'traces' : 'trace'} will be deleted. Traces are removed asynchronously and may continue to be visible for up to 15 minutes.`,
        })
      },
      onError: (error, input) => {
        showErrorToast(
          `Failed to delete ${input.traceIds.length > 1 ? 'traces' : 'trace'}`,
          error.message,
          'WARNING',
        )
      },
    }),
  )

  return useCallback(
    async (input: {
      traceIds: string[]
      userId?: string
      organizationId?: string
      workspaceId?: string
      appId?: string
    }) => {
      return await deleteMutation.mutateAsync(input)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
}
