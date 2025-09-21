import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'

import { orpc } from '@/lib/orpc'

export function useExpenses({
  organizationId,
  appId,
  pageSize = 50,
}: {
  organizationId?: string
  appId?: string
  pageSize?: number
}) {
  const { data, isLoading, refetch, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(
      orpc.expense.list.infiniteOptions({
        input: (cursor?: string) => ({
          organizationId,
          appId,
          cursor,
          limit: pageSize,
        }),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => {
          if (!lastPage.hasMore) return undefined
          return lastPage.cursor
        },
        placeholderData: keepPreviousData,
      }),
    )

  return {
    expensesPages: data?.pages,
    isLoadingExpenses: isLoading,
    refetchExpenses: refetch,
    isFetchingExpenses: isFetching,
    fetchNextExpensesPage: fetchNextPage,
    hasNextExpensesPage: hasNextPage,
    isFetchingNextExpensesPage: isFetchingNextPage,
  }
}
