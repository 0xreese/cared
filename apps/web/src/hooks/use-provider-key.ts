import { useCallback, useMemo } from 'react'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { ProviderId, ProviderKey } from '@cared/providers'

import { orpc } from '@/lib/orpc'

export function useProviderKeys(input?: { isSystem?: boolean; organizationId?: string }) {
  const {
    data: { providerKeys },
    refetch: refetchProviderKeys,
  } = useSuspenseQuery(
    orpc.providerKey.list.queryOptions({
      input: {
        isSystem: input?.isSystem,
        organizationId: input?.organizationId,
      }
    }),
  )

  return {
    providerKeys,
    refetchProviderKeys,
  }
}

export function useProviderKeysByProvider({
  isSystem,
  organizationId,
  providerId,
}: {
  isSystem?: boolean
  organizationId?: string
  providerId?: ProviderId
}) {
  const { providerKeys, refetchProviderKeys } = useProviderKeys({
    isSystem,
    organizationId,
  })

  const filteredProviderKeys = useMemo(() => {
    if (!providerId) {
      return []
    }

    return providerKeys.filter((key) => key.providerId === providerId)
  }, [providerId, providerKeys])

  return {
    providerKeys: filteredProviderKeys,
    refetchProviderKeys,
  }
}

export function useCreateProviderKey({
  isSystem,
  organizationId,
}: {
  isSystem?: boolean
  organizationId?: string
}) {
  const queryClient = useQueryClient()

  const createMutation = useMutation(
    orpc.providerKey.create.mutationOptions({
      onSuccess: (_, variables) => {
        void queryClient.invalidateQueries({
          queryKey: orpc.providerKey.list.queryOptions({
            input: {
              isSystem: variables.isSystem,
              organizationId: variables.organizationId,
            }
          }).queryKey,
        })
      },
      onError: (error) => {
        console.error('Failed to create provider key:', error)
        toast.error(`Failed to create provider key: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (input: { key: ProviderKey; disabled?: boolean }) => {
      return await createMutation.mutateAsync({
        isSystem,
        organizationId,
        ...input,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
}

export function useUpdateProviderKey() {
  const queryClient = useQueryClient()

  const updateMutation = useMutation(
    orpc.providerKey.update.mutationOptions({
      onSuccess: ({ providerKey }) => {
        void queryClient.invalidateQueries({
          queryKey: orpc.providerKey.list.queryOptions({
            input: {
              isSystem: providerKey.isSystem ?? undefined,
              organizationId: providerKey.organizationId ?? undefined,
            }
          }).queryKey,
        })
      },
      onError: (error) => {
        console.error('Failed to update provider key:', error)
        toast.error(`Failed to update provider key: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (input: { id: string; key?: ProviderKey; disabled?: boolean }) => {
      return await updateMutation.mutateAsync(input)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
}

export function useDeleteProviderKey() {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation(
    orpc.providerKey.delete.mutationOptions({
      onSuccess: ({ providerKey }) => {
        void queryClient.invalidateQueries({
          queryKey: orpc.providerKey.list.queryOptions({
            input: {
              isSystem: providerKey.isSystem ?? undefined,
              organizationId: providerKey.organizationId ?? undefined,
            }
          }).queryKey,
        })
      },
      onError: (error) => {
        console.error('Failed to delete provider key:', error)
        toast.error(`Failed to delete provider key: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (id: string) => {
      return await deleteMutation.mutateAsync({ id })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
}

// Utility hooks for common operations
export function useToggleProviderKey() {
  const updateProviderKey = useUpdateProviderKey()

  return useCallback(
    async (id: string, disabled: boolean) => {
      return await updateProviderKey({ id, disabled })
    },
    [updateProviderKey],
  )
}

export function useEnableProviderKey() {
  const toggleProviderKey = useToggleProviderKey()

  return useCallback(
    async (id: string) => {
      return await toggleProviderKey(id, false)
    },
    [toggleProviderKey],
  )
}

export function useDisableProviderKey() {
  const toggleProviderKey = useToggleProviderKey()

  return useCallback(
    async (id: string) => {
      return await toggleProviderKey(id, true)
    },
    [toggleProviderKey],
  )
}
