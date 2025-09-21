import { useCallback } from 'react'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'

import { orpc } from '@/lib/orpc'

// Query hooks
export function useMembers(organizationId = '') {
  const {
    data: { members },
  } = useSuspenseQuery(
    orpc.organization.listMembers.queryOptions({
      input: {
        organizationId,
      }
    }),
  )

  return members
}

export function useInvitations(organizationId: string) {
  const {
    data: { invitations },
  } = useSuspenseQuery(
    orpc.organization.listInvitations.queryOptions({
      input: {
        organizationId,
      }
    }),
  )

  return invitations
}

// Mutation hooks
export function useAddMember() {
  const queryClient = useQueryClient()

  const mutation = useMutation(
    orpc.organization.addMember.mutationOptions({
      onSuccess: (_, variables) => {
        // Invalidate members list for the specific organization
        void queryClient.invalidateQueries({
          queryKey: orpc.organization.listMembers.queryOptions({
            input: {
              organizationId: variables.organizationId,
            }
          }).queryKey,
        })
      },
    }),
  )

  return useCallback(async (organizationId: string, userId: string, role: 'admin' | 'member') => {
    return await mutation.mutateAsync({
      organizationId,
      userId,
      role,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function useRemoveMember() {
  const queryClient = useQueryClient()

  const mutation = useMutation(
    orpc.organization.removeMember.mutationOptions({
      onSuccess: (_, variables) => {
        // Invalidate members list for the specific organization
        void queryClient.invalidateQueries({
          queryKey: orpc.organization.listMembers.queryOptions({
            input: {
              organizationId: variables.organizationId,
            }
          }).queryKey,
        })
      },
    }),
  )

  return useCallback(async (organizationId: string, memberId: string) => {
    return await mutation.mutateAsync({
      organizationId,
      memberId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient()

  const mutation = useMutation(
    orpc.organization.updateMemberRole.mutationOptions({
      onSuccess: (_, variables) => {
        // Invalidate members list for the specific organization
        void queryClient.invalidateQueries({
          queryKey: orpc.organization.listMembers.queryOptions({
            input: {
              organizationId: variables.organizationId,
            }
          }).queryKey,
        })
      },
    }),
  )

  return useCallback(async (organizationId: string, memberId: string, role: 'admin' | 'member') => {
    return await mutation.mutateAsync({
      organizationId,
      memberId,
      role,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function useCreateInvitation() {
  const queryClient = useQueryClient()

  const mutation = useMutation(
    orpc.organization.createInvitation.mutationOptions({
      onSuccess: (_, variables) => {
        // Invalidate invitations list for the specific organization
        void queryClient.invalidateQueries({
          queryKey: orpc.organization.listInvitations.queryOptions({
            input: {
              organizationId: variables.organizationId,
            }
          }).queryKey,
        })
      },
    }),
  )

  return useCallback(async (organizationId: string, email: string) => {
    return await mutation.mutateAsync({
      organizationId,
      email,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

export function useCancelInvitation() {
  const queryClient = useQueryClient()

  const mutation = useMutation(
    orpc.organization.cancelInvitation.mutationOptions({
      onSuccess: (data) => {
        // Invalidate invitations list for the specific organization
        void queryClient.invalidateQueries({
          queryKey: orpc.organization.listInvitations.queryOptions({
            input: {
              organizationId: data.invitation.organizationId,
            }
          }).queryKey,
        })
      },
    }),
  )

  return useCallback(async (organizationId: string, invitationId: string) => {
    return await mutation.mutateAsync({
      invitationId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
