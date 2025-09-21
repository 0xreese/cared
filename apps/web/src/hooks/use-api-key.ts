import { useCallback, useMemo } from 'react'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { ApiKeyMetadataInput } from '@cared/api'

import { orpc } from '@/lib/orpc'

export function useApiKeys() {
  const {
    data: { keys },
    refetch: refetchApiKeys,
  } = useSuspenseQuery(orpc.apiKey.list.queryOptions())

  return {
    apiKeys: keys,
    refetchApiKeys,
  }
}

export function useUserApiKeys() {
  const { apiKeys, refetchApiKeys } = useApiKeys()

  const filteredApiKeys = useMemo(() => {
    return apiKeys.filter((key) => key.scope === 'user')
  }, [apiKeys])

  return {
    apiKeys: filteredApiKeys,
    refetchApiKeys,
  }
}

export function useOrganizationApiKeys(organizationId?: string) {
  const { apiKeys, refetchApiKeys } = useApiKeys()

  const filteredApiKeys = useMemo(() => {
    if (!organizationId) {
      return []
    }
    return apiKeys.filter(
      (key) => key.scope === 'organization' && key.organizationId === organizationId,
    )
  }, [apiKeys, organizationId])

  return {
    apiKeys: filteredApiKeys,
    refetchApiKeys,
  }
}

export function useWorkspaceApiKeys(workspaceId?: string) {
  const { apiKeys, refetchApiKeys } = useApiKeys()

  const filteredApiKeys = useMemo(() => {
    if (!workspaceId) {
      return []
    }
    return apiKeys.filter((key) => key.scope === 'workspace' && key.workspaceId === workspaceId)
  }, [apiKeys, workspaceId])

  return {
    apiKeys: filteredApiKeys,
    refetchApiKeys,
  }
}

export function useAppApiKeys(appId?: string) {
  const { apiKeys, refetchApiKeys } = useApiKeys()

  const filteredApiKeys = useMemo(() => {
    if (!appId) {
      return []
    }
    return apiKeys.filter((key) => key.scope === 'app' && key.appId === appId)
  }, [apiKeys, appId])

  return {
    apiKeys: filteredApiKeys,
    refetchApiKeys,
  }
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()

  const createMutation = useMutation(
    orpc.apiKey.create.mutationOptions({
      onSuccess: () => {
        // Invalidate all API key queries since we're doing full query now
        void queryClient.invalidateQueries({
          queryKey: orpc.apiKey.list.queryOptions().queryKey,
        })
      },
      onError: (error) => {
        console.error('Failed to create API key:', error)
        toast.error(`Failed to create API key: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (
      input: {
        name: string
      } & ApiKeyMetadataInput,
    ) => {
      return await createMutation.mutateAsync(input)
    },
    [createMutation],
  )
}

export function useRotateApiKey() {
  const queryClient = useQueryClient()

  const rotateMutation = useMutation(
    orpc.apiKey.rotate.mutationOptions({
      onSuccess: () => {
        // Invalidate all API key queries since we're doing full query now
        void queryClient.invalidateQueries({
          queryKey: orpc.apiKey.list.queryOptions().queryKey,
        })
      },
      onError: (error) => {
        console.error('Failed to rotate API key:', error)
        toast.error(`Failed to rotate API key: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (id: string) => {
      return await rotateMutation.mutateAsync({ id })
    },
    [rotateMutation],
  )
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation(
    orpc.apiKey.delete.mutationOptions({
      onSuccess: () => {
        // Invalidate all API key queries since we're doing full query now
        void queryClient.invalidateQueries({
          queryKey: orpc.apiKey.list.queryOptions().queryKey,
        })
      },
      onError: (error) => {
        console.error('Failed to delete API key:', error)
        toast.error(`Failed to delete API key: ${error.message}`)
      },
    }),
  )

  return useCallback(
    async (id: string) => {
      return await deleteMutation.mutateAsync({ id })
    },
    [deleteMutation],
  )
}
