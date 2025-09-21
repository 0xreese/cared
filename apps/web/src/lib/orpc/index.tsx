import { cache } from 'react'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { BatchLinkPlugin } from '@orpc/client/plugins'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { dehydrate, HydrationBoundary, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

import type { AppRouter } from '@cared/api'
import { getApiUrl } from '@cared/auth/client'

import type { RouterClient } from '@orpc/server'
import type { QueryOptionsBase } from '@orpc/tanstack-query'
import type {
  DefaultError,
  FetchQueryOptions,
  InferDataFromTag,
  QueryClient,
  QueryKey,
  SetDataOptions,
  Updater,
} from '@tanstack/react-query'
import { createQueryClient } from './query-client'

const link = new RPCLink({
  url: () => {
    return `${getApiUrl()}/api/rpc`
  },
  headers: async () => {
    let headers
    if (typeof window !== 'undefined') {
      headers = new Headers()
    } else {
      headers = new Headers(await (await import('next/headers')).headers())
    }

    headers.set('x-orpc-source', 'cared-web')
    return headers
  },
  fetch: (request, init) => {
    return globalThis.fetch(request, {
      ...init,
      credentials: 'include', // Include cookies for cross-origin requests
    })
  },
  plugins: [
    new BatchLinkPlugin({
      groups: [
        {
          condition: () => true,
          context: {},
        },
      ],
    }),
  ],
})

export const orpcClient: RouterClient<AppRouter> = createORPCClient(link)
export const orpc = createTanstackQueryUtils(orpcClient)

let clientQueryClientSingleton: QueryClient | undefined = undefined
const getQueryClient = () => {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return createQueryClient()
  } else {
    // Browser: use singleton pattern to keep the same query client
    return (clientQueryClientSingleton ??= createQueryClient())
  }
}

export function RPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      <ReactQueryDevtools initialIsOpen={false} />
      {children}
    </QueryClientProvider>
  )
}

export const getCachedQueryClient = cache(createQueryClient)

export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getCachedQueryClient()
  return <HydrationBoundary state={dehydrate(queryClient)}>{props.children}</HydrationBoundary>
}

export function prefetch<T extends QueryOptionsBase<any, any>>(queryOptions: T) {
  const queryClient = getCachedQueryClient()
  // @ts-ignore
  if (queryOptions.queryKey[1]?.type === 'infinite') {
    void queryClient.prefetchInfiniteQuery(queryOptions as any)
  } else {
    void queryClient.prefetchQuery(queryOptions)
  }
}

export function fetch<
  TQueryFnData,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = never,
>(
  queryOptions: FetchQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
): Promise<TData> {
  const queryClient = getCachedQueryClient()
  return queryClient.fetchQuery(queryOptions)
}

export function setData<
  TQueryFnData = unknown,
  TTaggedQueryKey extends QueryKey = QueryKey,
  TInferredQueryFnData = InferDataFromTag<TQueryFnData, TTaggedQueryKey>,
>(
  queryKey: TTaggedQueryKey,
  updater: Updater<
    NoInfer<TInferredQueryFnData> | undefined,
    NoInfer<TInferredQueryFnData> | undefined
  >,
  options?: SetDataOptions,
): NoInfer<TInferredQueryFnData> | undefined {
  const queryClient = getCachedQueryClient()
  return queryClient.setQueryData<TQueryFnData, TTaggedQueryKey, TInferredQueryFnData>(
    queryKey,
    updater,
    options,
  )
}
