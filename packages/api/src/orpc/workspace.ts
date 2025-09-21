import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import { count, desc, eq } from '@cared/db'
import { Member, Workspace } from '@cared/db/schema'

import { OrganizationScope } from '../auth'
import { cfg } from '../config'
import { WorkspaceOperator } from '../operation'
import { protectedProcedure } from '../orpc'
import { createWorkspaceSchema, updateWorkspaceSchema } from '../types'

export const workspaceRouter = {
  /**
   * List all workspaces for the current user.
   * Only accessible by authenticated users.
   * @param input - Pagination parameters
   * @returns List of workspaces
   */
  list: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/workspaces',
      tags: ['workspaces'],
      summary: 'List all workspaces for the current user',
    })
    .input(
      z
        .object({
          organizationId: z.string().min(1).optional(),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      let workspaces
      if (input?.organizationId) {
        const scope = OrganizationScope.fromOrganization(context, input.organizationId)
        await scope.checkPermissions()

        workspaces = await context.db
          .select()
          .from(Workspace)
          .where(eq(Workspace.organizationId, scope.organizationId))
          .orderBy(desc(Workspace.id))
      } else {
        const auth = context.auth.auth
        if (auth?.type !== 'user') {
          throw new ORPCError('UNAUTHORIZED', {
            message: 'You must be authenticated to access workspaces',
          })
        }

        workspaces = (
          await context.db
            .select({
              workspace: Workspace,
            })
            .from(Workspace)
            .innerJoin(Member, eq(Member.organizationId, Workspace.organizationId))
            .where(eq(Member.userId, auth.userId))
            .orderBy(desc(Workspace.id))
        ).map(({ workspace }) => ({
          ...workspace,
        }))
      }

      return {
        workspaces,
      }
    }),

  /**
   * Get a single workspace by ID.
   * Only accessible by authenticated users who are members of the workspace.
   * @param input - The workspace ID
   * @returns The workspace if found
   * @throws {ORPCError} If workspace not found or user is not a member
   */
  get: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/workspaces/{id}',
      tags: ['workspaces'],
      summary: 'Get a single workspace by ID',
    })
    .input(
      z.object({
        id: z.string().min(32),
      }),
    )
    .handler(async ({ input, context }) => {
      const workspace = await context.db.query.Workspace.findFirst({
        where: eq(Workspace.id, input.id),
      })

      if (!workspace) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Workspace not found',
        })
      }

      const scope = OrganizationScope.fromOrganization(context, workspace.organizationId)
      await scope.checkPermissions()

      return { workspace }
    }),

  create: protectedProcedure
    .route({
      method: 'POST',
      path: '/v1/workspaces',
      tags: ['workspaces'],
      summary: 'Create a new workspace',
    })
    .input(createWorkspaceSchema)
    .handler(async ({ input, context }) => {
      const scope = OrganizationScope.fromOrganization(context, input.organizationId)
      await scope.checkPermissions({ workspace: ['create'] })

      // Check if user has reached the maximum number of workspaces
      const userWorkspacesCount = await context.db
        .select({ count: count() })
        .from(Workspace)
        .where(eq(Workspace.organizationId, scope.organizationId))
        .then((r) => r[0]!.count)

      if (userWorkspacesCount >= cfg.perOrganization.maxWorkspaces) {
        throw new ORPCError('FORBIDDEN', {
          message: `You have reached the maximum limit of ${cfg.perOrganization.maxWorkspaces} workspaces`,
        })
      }

      const [workspace] = await context.db.insert(Workspace).values(input).returning()
      if (!workspace) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to create workspace',
        })
      }

      return {
        workspace,
      }
    }),

  update: protectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/workspaces/{id}',
      tags: ['workspaces'],
      summary: 'Update a workspace',
    })
    .input(updateWorkspaceSchema)
    .handler(async ({ input, context }) => {
      const scope = await OrganizationScope.fromWorkspace(context, input.id)
      await scope.checkPermissions({ workspace: ['update'] })

      const [workspace] = await context.db
        .update(Workspace)
        .set({ name: input.name })
        .where(eq(Workspace.id, input.id))
        .returning()

      if (!workspace) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to update workspace',
        })
      }

      return { workspace }
    }),

  /**
   * Delete a workspace.
   * Only accessible by users with delete permission.
   * @param input - The workspace ID
   * @throws {ORPCError} If user doesn't have delete permission
   */
  delete: protectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/workspaces/{id}',
      tags: ['workspaces'],
      summary: 'Delete a workspace',
    })
    .input(
      z.object({
        id: z.string().min(32),
      }),
    )
    .handler(async ({ input, context }) => {
      const scope = await OrganizationScope.fromWorkspace(context, input.id)
      await scope.checkPermissions({ workspace: ['delete'] })

      const workspace = await context.db.query.Workspace.findFirst({
        where: eq(Workspace.id, input.id),
      })
      if (!workspace) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Workspace not found',
        })
      }

      const operator = new WorkspaceOperator(context, workspace.id)

      await operator.delete()
    }),

  /**
   * Transfer workspace ownership to another user.
   * Only accessible by users with update permission.
   * @param input - Object containing workspaceId and userId
   * @throws {ORPCError} If user doesn't have update permission
   */
  transferOwnership: protectedProcedure
    .route({
      method: 'POST',
      path: '/v1/workspaces/{workspaceId}/transfer-ownership',
      tags: ['workspaces'],
      summary: 'Transfer workspace ownership to another organization',
    })
    .input(
      z.object({
        workspaceId: z.string().min(32),
        organizationId: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const scope = await OrganizationScope.fromWorkspace(context, input.workspaceId)
      await scope.checkPermissions({ workspace: ['transfer'] })

      // Ensure the target organization exists and user has permission to create workspaces there
      const targetScope = OrganizationScope.fromOrganization(context, input.organizationId)
      await targetScope.checkPermissions({ workspace: ['create'] })

      const [workspace] = await context.db
        .update(Workspace)
        .set({ organizationId: input.organizationId })
        .where(eq(Workspace.id, input.workspaceId))
        .returning()
      if (!workspace) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to transfer workspace',
        })
      }

      return { workspace }
    }),
}
