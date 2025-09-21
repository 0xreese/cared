import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { authClient } from '@cared/auth/client'

import { orpc } from '@/lib/orpc'

export type User = (typeof authClient.$Infer.Session)['user']
export type Session = (typeof authClient.$Infer.Session)['session']

function useRefetchSession() {
  const queryClient = useQueryClient()

  return useCallback(async () => {
    const session = (
      await authClient.getSession({
        query: {
          disableCookieCache: true,
        },
      })
    ).data

    // queryClient.setQueryData(orpc.user.session.queryKey(), session)
    queryClient.setQueryData(
      orpc.user.session.queryKey({
        input: {
          auth: false,
        },
      }),
      session,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function useSessionPublic() {
  const refetchSession = useRefetchSession()

  const { data, isSuccess } = useQuery(
    orpc.user.session.queryOptions({
      input: {
        auth: false,
      }
    }),
  )
  return {
    session: data?.session,
    user: data?.user,
    isSuccess,
    refetchSession,
  }
}

export function useCheckSession() {
  const { user, isSuccess } = useSessionPublic()

  useEffect(() => {
    if (isSuccess && !user) {
      window.location.href = '/auth/sign-in'
    }
  }, [user, isSuccess])
}

export function useSession() {
  const refetchSession = useRefetchSession()

  const { data } = useSuspenseQuery(orpc.user.session.queryOptions())
  // Since this query throws an error when the return value is null, using non-null assertion is safe here
  return {
    session: data!.session,
    user: data!.user,
    refetchSession,
  }
}

export function useAccounts() {
  const {
    data: { accounts },
    refetch: refetchAccounts,
  } = useSuspenseQuery(orpc.user.accounts.queryOptions())
  return {
    accounts,
    refetchAccounts,
  }
}
