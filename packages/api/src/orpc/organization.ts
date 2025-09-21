import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import type { OrganizationRole } from '@cared/auth'
import type { Invitation } from '@cared/db/schema'
import { auth, headers } from '@cared/auth'
import { desc, eq } from '@cared/db'
import { Member, Organization, User } from '@cared/db/schema'

import { userProtectedProcedure } from '../orpc'

type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'canceled'

function formatOrganization(org: Pick<Organization, 'id' | 'name' | 'slug' | 'createdAt'>) {
  const { id, name, slug, createdAt } = org
  return {
    id,
    name,
    slug,
    createdAt,
  }
}

function formatInvitation(
  invitation: Omit<Invitation, 'status' | 'role' | 'teamId'> & {
    status: InvitationStatus
    role: OrganizationRole
    teamId?: string | null
  },
) {
  const { teamId, ...inv } = invitation
  return {
    ...inv,
    teamId: teamId ?? undefined,
  }
}

export const organizationRouter = {
  // ---- Organization ----
  create: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/organizations',
      tags: ['organization'],
      summary: 'Create a new organization',
    })
    .input(
      z.object({
        name: z.string().min(1).max(64),
        // logo: z.url().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const org = await auth.api.createOrganization({
        headers: headers(context.headers),
        body: {
          name: input.name,
          slug: '', // slug will be set in `organizationCreation.beforeCreate`
          // logo: input.logo,
          keepCurrentActiveOrganization: false,
        },
      })
      if (!org) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to create organization',
        })
      }

      return { organization: formatOrganization(org) }
    }),

  list: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/organizations',
      tags: ['organization'],
      summary: 'List all organizations for current user',
    })
    .handler(async ({ context }) => {
      const orgs = await context.db
        .select({
          org: Organization,
          role: Member.role,
        })
        .from(Organization)
        .innerJoin(Member, eq(Member.organizationId, Organization.id))
        .where(eq(Member.userId, context.auth.userId))
        .orderBy(desc(Organization.createdAt))

      return {
        organizations: orgs.map(({ org, role }) => ({
          ...formatOrganization(org),
          role: role as OrganizationRole,
        })),
      }
    }),

  setActive: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/organizations/set-active',
      tags: ['organization'],
      summary: 'Set active organization for current user',
    })
    .input(
      z.object({
        organizationId: z.string().min(1).nullable(),
      }),
    )
    .handler(async ({ context, input }) => {
      // NOTE: The method `auth.api.setActiveOrganization()` will set the session cookie.
      // However, since orpc cannot return headers here, the client must call `authClient.getSession()`
      // again with the parameter `{ disableCookieCache: true }` to refresh the session cookie.
      const org = await auth.api.setActiveOrganization({
        headers: headers(context.headers),
        body: {
          organizationId: input.organizationId,
        },
      })
      if (!org && input.organizationId) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to set active organization',
        })
      }
    }),

  get: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/organizations/{organizationId}',
      tags: ['organization'],
      summary: 'Get organization details by ID',
    })
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      const organization = await auth.api.getFullOrganization({
        headers: headers(context.headers),
        query: { organizationId: input.id },
      })
      if (!organization) {
        throw new ORPCError('NOT_FOUND', { message: 'Organization not found' })
      }
      const { members, invitations, teams, ...org } = organization
      return {
        organization: {
          ...formatOrganization(org),
          members,
          invitations: invitations.map(formatInvitation),
          teams,
        },
      }
    }),

  update: userProtectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/organizations/{organizationId}',
      tags: ['organization'],
      summary: 'Update organization details',
    })
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(128),
      }),
    )
    .handler(async ({ context, input }) => {
      const org = await auth.api.updateOrganization({
        headers: headers(context.headers),
        body: {
          organizationId: input.id,
          data: {
            name: input.name,
          },
        },
      })
      if (!org) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to update organization',
        })
      }
      return { organization: formatOrganization(org) }
    }),

  delete: userProtectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/organizations/{organizationId}',
      tags: ['organization'],
      summary: 'Delete organization',
    })
    .input(
      z.object({
        id: z.string().min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      await auth.api.deleteOrganization({
        headers: headers(context.headers),
        body: { organizationId: input.id },
      })
    }),

  // ---- Invitations ----
  createInvitation: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/organizations/{organizationId}/invitations',
      tags: ['organization'],
      summary: 'Create invitation for organization',
    })
    .input(
      z.object({
        organizationId: z.string().min(1),
        email: z.email(),
        teamId: z.string().min(1).optional(),
        resend: z.boolean().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const inv = await auth.api.createInvitation({
        headers: headers(context.headers),
        body: {
          organizationId: input.organizationId,
          email: input.email,
          role: 'member',
          resend: input.resend,
          teamId: input.teamId,
        },
      })
      return { invitation: formatInvitation(inv) }
    }),

  acceptInvitation: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/invitations/{invitationId}/accept',
      tags: ['organization'],
      summary: 'Accept invitation',
    })
    .input(z.object({ invitationId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const res = await auth.api.acceptInvitation({
        headers: headers(context.headers),
        body: { invitationId: input.invitationId },
      })
      if (!res) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to accept invitation',
        })
      }
      return { invitation: formatInvitation(res.invitation) }
    }),

  cancelInvitation: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/invitations/{invitationId}/cancel',
      tags: ['organization'],
      summary: 'Cancel invitation',
    })
    .input(z.object({ invitationId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const invitation = await auth.api.cancelInvitation({
        headers: headers(context.headers),
        body: { invitationId: input.invitationId },
      })
      if (!invitation) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to cancel invitation',
        })
      }
      return { invitation: formatInvitation(invitation) }
    }),

  rejectInvitation: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/invitations/{invitationId}/reject',
      tags: ['organization'],
      summary: 'Reject invitation',
    })
    .input(z.object({ invitationId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const res = await auth.api.rejectInvitation({
        headers: headers(context.headers),
        body: { invitationId: input.invitationId },
      })
      if (!res.invitation) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to reject invitation',
        })
      }
      return { invitation: formatInvitation(res.invitation) }
    }),

  getInvitation: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/invitations/{invitationId}',
      tags: ['organization'],
      summary: 'Get invitation details',
    })
    .input(z.object({ invitationId: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const invitation = await auth.api.getInvitation({
        headers: headers(context.headers),
        query: { id: input.invitationId },
      })
      const inviter = await context.db.query.User.findFirst({
        where: eq(User.email, invitation.inviterEmail),
      })
      if (!inviter) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Inviter not found',
        })
      }
      return {
        invitation: {
          ...formatInvitation(invitation),
          inviterName: inviter.name,
        } as ReturnType<typeof formatInvitation> & {
          organizationName: string
          inviterEmail: string
          inviterName: string
        },
      }
    }),

  listInvitations: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/organizations/{organizationId}/invitations',
      tags: ['organization'],
      summary: 'List organization invitations',
    })
    .input(z.object({ organizationId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const invitations = await auth.api.listInvitations({
        headers: headers(context.headers),
        query: { organizationId: input.organizationId },
      })
      return { invitations: invitations.map(formatInvitation) }
    }),

  listUserInvitations: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/me/invitations',
      tags: ['organization'],
      summary: 'List user invitations',
    })
    .handler(async ({ context }) => {
      const invitations = await auth.api.listUserInvitations({
        headers: headers(context.headers),
      })
      return { invitations: invitations.map(formatInvitation) }
    }),

  // ---- Members ----
  listMembers: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/organizations/{organizationId}/members',
      tags: ['organization'],
      summary: 'List organization members',
    })
    .input(z.object({ organizationId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const res = await auth.api.listMembers({
        headers: headers(context.headers),
        query: {
          organizationId: input.organizationId,
          sortBy: 'createdAt',
          sortDirection: 'desc',
        },
      })
      const owners = []
      const admins = []
      const members = []
      for (const member of res.members) {
        if (member.role === 'owner') {
          owners.push(member)
        } else if (member.role === 'admin') {
          admins.push(member)
        } else {
          members.push(member)
        }
      }
      return { members: [...owners, ...admins, ...members] }
    }),

  addMember: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/organizations/{organizationId}/members',
      tags: ['organization'],
      summary: 'Add member to organization',
    })
    .input(
      z.object({
        organizationId: z.string().min(1),
        userId: z.string().min(1),
        role: z.enum(['admin', 'member']).default('member'),
        teamId: z.string().min(1).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!context.auth.isAdmin) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Only organization admins can add members',
        })
      }

      const member = await auth.api.addMember({
        headers: headers(context.headers),
        body: {
          organizationId: input.organizationId,
          userId: input.userId,
          role: input.role,
          teamId: input.teamId,
        },
      })
      if (!member) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to add member to organization',
        })
      }
      return { member }
    }),

  removeMember: userProtectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/organizations/{organizationId}/members/{memberId}',
      tags: ['organization'],
      summary: 'Remove member from organization',
    })
    .input(
      z.object({
        organizationId: z.string().min(1),
        memberId: z.string().min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      const res = await auth.api.removeMember({
        headers: headers(context.headers),
        body: {
          organizationId: input.organizationId,
          memberIdOrEmail: input.memberId,
        },
      })
      if (!res) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to remove member from organization',
        })
      }
      return { member: res.member }
    }),

  updateMemberRole: userProtectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/organizations/{organizationId}/members/{memberId}',
      tags: ['organization'],
      summary: 'Update member role',
    })
    .input(
      z.object({
        organizationId: z.string().min(1),
        memberId: z.string().min(1),
        role: z.enum(['admin', 'member']),
      }),
    )
    .handler(async ({ context, input }) => {
      const member = await auth.api.updateMemberRole({
        headers: headers(context.headers),
        body: { organizationId: input.organizationId, memberId: input.memberId, role: input.role },
      })
      return { member }
    }),

  transferOwnership: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/organizations/{organizationId}/transfer-ownership',
      tags: ['organization'],
      summary: 'Transfer organization ownership',
    })
    .input(
      z.object({
        organizationId: z.string().min(1),
        memberId: z.string().min(1),
      }),
    )
    .handler(async ({ input, context }) => {
      const previousOwnerMember = await context.db.query.Member.findFirst({
        where: eq(Member.userId, context.auth.userId),
      })
      if (!previousOwnerMember) {
        throw new ORPCError('FORBIDDEN', {
          message: 'You must be a member of the organization to transfer ownership',
        })
      }

      // First, update the target member's role to owner
      const newOwner = await auth.api.updateMemberRole({
        headers: headers(context.headers),
        body: {
          organizationId: input.organizationId,
          memberId: input.memberId,
          role: 'owner',
        },
      })

      // Then, update the current user's role to member
      const previousOwner = await auth.api.updateMemberRole({
        headers: headers(context.headers),
        body: {
          organizationId: input.organizationId,
          memberId: previousOwnerMember.id,
          role: 'member',
        },
      })

      return {
        newOwner,
        previousOwner,
      }
    }),

  leaveOrganization: userProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/organizations/{organizationId}/members/leave',
      tags: ['organization'],
      summary: 'Leave organization',
    })
    .input(z.object({ organizationId: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const member = await auth.api.leaveOrganization({
        headers: headers(context.headers),
        body: { organizationId: input.organizationId },
      })
      return { member }
    }),
}
