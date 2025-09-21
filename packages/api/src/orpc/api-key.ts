import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import { auth, headers } from '@cared/auth'
import { eq } from '@cared/db'
import { App, Workspace } from '@cared/db/schema'

import type { UserContext } from '../orpc'
import type { ApiKeyMetadata, ApiKeyScope } from '../types'
import { OrganizationScope } from '../auth'
import { cfg } from '../config'
import {
  apiKeyMetadataSchema,
  formatApiKey,
  listApiKeys,
  optionalApiKeyMetadataSchema,
} from '../operation'
import { userPlainProtectedProcedure } from '../orpc'

async function checkCreationPermission(ctx: UserContext, metadata: ApiKeyMetadata) {
  // User scoped API keys always allow creation
  if (metadata.scope === 'user') {
    return
  }

  // For non-user scoped API keys, check organization permissions
  let organizationScope: OrganizationScope

  switch (metadata.scope) {
    case 'organization':
      organizationScope = OrganizationScope.fromOrganization(
        { headers: ctx.headers, db: ctx.db },
        metadata.organizationId,
      )
      break
    case 'workspace': {
      organizationScope = await OrganizationScope.fromWorkspace(
        { headers: ctx.headers, db: ctx.db },
        metadata.workspaceId,
        metadata.organizationId,
      )
      break
    }
    case 'app': {
      organizationScope = await OrganizationScope.fromApp(
        { headers: ctx.headers, db: ctx.db },
        metadata.appId,
        metadata.workspaceId,
        metadata.organizationId,
      )
      break
    }
  }

  await organizationScope.checkPermissions()
}

function apiKeyPrefix(scope: ApiKeyScope) {
  switch (scope) {
    case 'user':
      return 'sk_u_'
    case 'organization':
      return 'sk_o_'
    case 'workspace':
      return 'sk_w_'
    case 'app':
      return 'sk_a_'
  }
}

export const apiKeyRouter = {
  /**
   * List API keys for all scopes or for a specific scope.
   * Only accessible by authenticated users with appropriate permissions.
   * @param input - Object containing optional scope and related IDs
   * @returns List of API keys
   * @throws {ORPCError} If user doesn't have permission for the requested scope
   */
  list: userPlainProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/api-keys',
      tags: ['keys'],
      summary: 'List all API keys for a scope',
    })
    .input(optionalApiKeyMetadataSchema)
    .handler(async ({ context, input }) => {
      const apiKeys = await listApiKeys(context, input)

      return {
        keys: apiKeys,
      }
    }),

  /**
   * Check if an entity has an API key.
   * Only accessible by users with appropriate permissions.
   * @param input - Object containing scope and entity ID
   * @returns Boolean indicating if the entity has an API key
   * @throws {ORPCError} If user doesn't have permission or entity not found
   */
  has: userPlainProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/api-keys/{id}/exists',
      tags: ['keys'],
      summary: 'Check if an entity has an API key',
    })
    .input(optionalApiKeyMetadataSchema)
    .handler(async ({ context, input }) => {
      const apiKeys = await listApiKeys(context, input)

      return { exists: apiKeys.length > 0 }
    }),

  /**
   * Get API key for an entity.
   * Only accessible by users with appropriate permissions.
   * @param input - Object containing scope and entity ID
   * @returns The API key if found
   * @throws {ORPCError} If user doesn't have permission or entity not found
   */
  get: userPlainProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/api-keys/{scope}/{id}',
      tags: ['keys'],
      summary: 'Get API key for an entity',
    })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const apiKey = await auth.api.getApiKey({
        headers: headers(context.headers),
        query: {
          id: input.id,
        },
      })

      return {
        key: formatApiKey(apiKey),
      }
    }),

  /**
   * Create a new API key for an entity.
   * Only accessible by users with appropriate permissions.
   * Note: Workspace and app scopes only allow one API key per entity.
   * User and organization scopes allow multiple API keys.
   * @param input - Object containing scope and entity details
   * @returns The created API key
   * @throws {ORPCError} If user doesn't have permission, entity not found, or if trying to create duplicate for workspace/app scope
   */
  create: userPlainProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/api-keys',
      tags: ['keys'],
      summary: 'Create a new API key for an entity',
    })
    .input(
      z
        .object({
          name: z.string().min(1),
        })
        .and(apiKeyMetadataSchema),
    )
    .handler(async ({ context, input }) => {
      const { name, ...others } = input
      const metadata = others as ApiKeyMetadata

      switch (metadata.scope) {
        case 'workspace': {
          const workspace = await context.db.query.Workspace.findFirst({
            where: eq(Workspace.id, metadata.workspaceId),
          })
          if (!workspace) {
            throw new ORPCError('NOT_FOUND', {
              message: 'Workspace not found',
            })
          }
          metadata.organizationId = workspace.organizationId
          break
        }
        case 'app': {
          const [result] = await context.db
            .select({
              workspaceId: Workspace.id,
              organizationId: Workspace.organizationId,
            })
            .from(App)
            .innerJoin(Workspace, eq(Workspace.id, App.workspaceId))
            .where(eq(App.id, metadata.appId))
            .limit(1)
          if (!result) {
            throw new ORPCError('NOT_FOUND', {
              message: 'App not found',
            })
          }
          metadata.workspaceId = result.workspaceId
          metadata.organizationId = result.organizationId
        }
      }

      const allApiKeys = await auth.api.listApiKeys({
        headers: headers(context.headers),
      })

      await checkCreationPermission(context, metadata)

      // Check API key count limits based on scope
      const existingKeys = allApiKeys.filter((key) => {
        if (key.metadata?.scope !== metadata.scope) return false

        switch (metadata.scope) {
          case 'user':
            return true // All user-scoped keys for the current user
          case 'organization':
            return key.metadata.organizationId === metadata.organizationId
          case 'workspace':
            return key.metadata.workspaceId === metadata.workspaceId
          case 'app':
            return key.metadata.appId === metadata.appId
          default:
            return false
        }
      })

      // Get the maximum allowed API keys for the scope
      let maxAllowed: number
      switch (metadata.scope) {
        case 'user':
          maxAllowed = cfg.perUser.maxApiKeys
          break
        case 'organization':
          maxAllowed = cfg.perOrganization.maxApiKeys
          break
        case 'workspace':
          maxAllowed = cfg.perWorkspace.maxApiKeys
          break
        case 'app':
          maxAllowed = cfg.perApp.maxApiKeys
          break
        default:
          throw new ORPCError('BAD_REQUEST', {
            message: 'Invalid scope',
          })
      }

      // Check if the limit would be exceeded
      if (existingKeys.length >= maxAllowed) {
        throw new ORPCError('FORBIDDEN', {
          message: `Maximum number of API keys (${maxAllowed}) for ${metadata.scope} scope has been reached`,
        })
      }

      const apiKey = await auth.api.createApiKey({
        headers: headers(context.headers),
        body: {
          name,
          prefix: apiKeyPrefix(metadata.scope),
          metadata,
        },
      })

      return {
        key: {
          ...formatApiKey(apiKey),
          key: apiKey.key,
        },
      }
    }),

  /**
   * Rotate (regenerate) the API key for an entity.
   * Only accessible by users with appropriate permissions.
   * @param input - Object containing scope and entity ID
   * @returns The new API key
   * @throws {ORPCError} If user doesn't have permission or entity not found
   */
  rotate: userPlainProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/api-keys/{scope}/{id}/rotate',
      tags: ['keys'],
      summary: 'Rotate (regenerate) API key for an entity',
    })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const existingApiKey = await auth.api.getApiKey({
        headers: headers(context.headers),
        query: {
          id: input.id,
        },
      })

      // Delete existing key
      await auth.api.deleteApiKey({
        headers: headers(context.headers),
        body: {
          keyId: existingApiKey.id,
        },
      })

      // Create new API key with same metadata
      const apiKey = await auth.api.createApiKey({
        headers: headers(context.headers),
        body: {
          name: existingApiKey.name!,
          prefix: apiKeyPrefix(existingApiKey.metadata?.scope),
          metadata: existingApiKey.metadata,
        },
      })

      return {
        key: {
          ...formatApiKey(apiKey),
          key: apiKey.key,
        },
      }
    }),

  /**
   * Verify an API key.
   * @param input - Object containing key to verify
   * @returns Boolean indicating if the key is valid
   */
  verify: userPlainProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/api-keys/verify',
      tags: ['keys'],
      summary: 'Verify an API key',
    })
    .input(
      z.object({
        key: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const result = await auth.api.verifyApiKey({
        headers: headers(context.headers),
        body: {
          key: input.key,
        },
      })

      return {
        isValid: result.valid,
      }
    }),

  /**
   * Delete the API key for an entity.
   * Only accessible by users with appropriate permissions.
   * @param input - Object containing scope and entity ID
   * @returns Success status
   * @throws {ORPCError} If user doesn't have permission or entity not found
   */
  delete: userPlainProtectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/api-keys/{scope}/{id}',
      tags: ['keys'],
      summary: 'Delete the API key for an entity',
    })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const apiKey = await auth.api.getApiKey({
        headers: headers(context.headers),
        query: {
          id: input.id,
        },
      })

      await auth.api.deleteApiKey({
        headers: headers(context.headers),
        body: {
          keyId: apiKey.id,
        },
      })
    }),
}
