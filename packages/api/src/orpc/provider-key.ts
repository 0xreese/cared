import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import type { OrganizationStatementsSubset } from '@cared/auth'
import type { SQL } from '@cared/db'
import type { ProviderId } from '@cared/providers'
import { and, desc, eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { ProviderKey, ProviderSettings } from '@cared/db/schema'
import { providerIdSchema, providerKeySchema } from '@cared/providers'

import type { BaseContext, UserOrAppUserContext } from '../orpc'
import { OrganizationScope } from '../auth'
import { env } from '../env'
import { decryptProviderKey, deleteProviderKeysStateCache, encryptProviderKey } from '../operation'
import { userOrAppUserProtectedProcedure } from '../orpc'

export const providerKeyRouter = {
  // List provider keys with optional filtering by user or organization
  list: userOrAppUserProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/provider-keys',
      tags: ['provider-key'],
      summary: 'List provider keys',
    })
    .input(
      z
        .object({
          isSystem: z.boolean().optional(),
          organizationId: z.string().optional(),
          providerId: providerIdSchema.optional(),
        })
        .default({}),
    )
    .handler(async ({ input, context }) => {
      const { isSystem, organizationId, providerId } = input

      if (
        !(await checkPermissions(context, {
          isSystem,
          organizationId,
        }))
      ) {
        throw new ORPCError('FORBIDDEN', {
          message: 'You do not have permission to list provider keys',
        })
      }

      const conditions: SQL<unknown>[] = [
        isSystem
          ? eq(ProviderKey.isSystem, true)
          : !organizationId
            ? eq(ProviderKey.userId, context.auth.userId)
            : eq(ProviderKey.organizationId, organizationId),
      ]

      if (providerId) {
        conditions.push(eq(ProviderKey.providerId, providerId))
      }

      const keys = await getDb().query.ProviderKey.findMany({
        where: and(...conditions),
        orderBy: desc(ProviderKey.id),
      })

      // Decrypt sensitive fields
      const decryptedKeys = await Promise.all(
        keys.map(async (key) => ({
          ...key,
          key: await decryptProviderKey(key.key),
        })),
      )

      return {
        providerKeys: decryptedKeys,
      }
    }),

  // Create a new provider key
  create: userOrAppUserProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/provider-keys',
      tags: ['provider-key'],
      summary: 'Create provider key',
    })
    .input(
      z.object({
        isSystem: z.boolean().optional(),
        organizationId: z.string().optional(),
        key: providerKeySchema, // Use the imported schema instead of manual validation
        disabled: z.boolean().default(false),
      }),
    )
    .handler(async ({ input, context }) => {
      const { isSystem, organizationId, key, disabled } = input

      if (
        !(await checkPermissions(
          context,
          {
            isSystem,
            organizationId,
          },
          { providerKey: ['create'] },
        ))
      ) {
        throw new ORPCError('FORBIDDEN', {
          message: 'You do not have permission to create provider keys',
        })
      }

      // Encrypt sensitive fields
      const encryptedKey = await encryptProviderKey(key)

      // Create the provider key
      const [newKey] = await getDb()
        .insert(ProviderKey)
        .values({
          isSystem,
          userId: !isSystem && !organizationId ? context.auth.userId : undefined,
          organizationId: !isSystem ? organizationId : undefined,
          providerId: key.providerId,
          key: encryptedKey,
          disabled,
        })
        .returning()
      if (!newKey) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to create provider key',
        })
      }

      if (isSystem) {
        await enableProvider(context, newKey.providerId)
      }

      // Clear provider key state cache after creating new key
      await deleteProviderKeysStateCache({
        providerId: newKey.providerId,
        isSystem: newKey.isSystem,
        userId: newKey.userId,
        organizationId: newKey.organizationId,
      })

      // Decrypt the key for response
      const decryptedKey = {
        ...newKey,
        key: await decryptProviderKey(newKey.key),
      }

      return {
        providerKey: decryptedKey,
      }
    }),

  // Update an existing provider key
  update: userOrAppUserProtectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/provider-keys/{id}',
      tags: ['provider-key'],
      summary: 'Update provider key',
    })
    .input(
      z.object({
        id: z.string(),
        key: providerKeySchema.optional(),
        disabled: z.boolean().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, key, disabled } = input

      // Find the existing provider key
      const existingKey = await getDb().query.ProviderKey.findFirst({
        where: eq(ProviderKey.id, id),
      })
      if (!existingKey) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Provider key not found',
        })
      }

      if (
        !(await checkPermissions(
          context,
          {
            isSystem: existingKey.isSystem,
            userId: existingKey.userId,
            organizationId: existingKey.organizationId,
          },
          { providerKey: ['update'] },
        ))
      ) {
        throw new ORPCError('FORBIDDEN', {
          message: 'You can only update your own provider keys',
        })
      }

      const updates = {
        // Encrypt sensitive fields
        ...(key ? { key: await encryptProviderKey(key) } : {}),
        ...(typeof disabled === 'boolean' ? { disabled } : {}),
      }

      // Update the provider key
      const [updatedKey] = await getDb()
        .update(ProviderKey)
        .set(updates)
        .where(eq(ProviderKey.id, id))
        .returning()
      if (!updatedKey) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to update provider key',
        })
      }

      if (updatedKey.isSystem) {
        await enableProvider(context, updatedKey.providerId)
      }

      // Clear provider key state cache after updating key
      await deleteProviderKeysStateCache({
        providerId: updatedKey.providerId,
        isSystem: updatedKey.isSystem,
        userId: updatedKey.userId,
        organizationId: updatedKey.organizationId,
      })

      // Decrypt the key for response
      const decryptedKey = {
        ...updatedKey,
        key: await decryptProviderKey(updatedKey.key),
      }

      return {
        providerKey: decryptedKey,
      }
    }),

  // Delete a provider key
  delete: userOrAppUserProtectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/provider-keys/{id}',
      tags: ['provider-key'],
      summary: 'Delete provider key',
    })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id } = input

      // Find the existing provider key
      const existingKey = await getDb().query.ProviderKey.findFirst({
        where: eq(ProviderKey.id, id),
      })
      if (!existingKey) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Provider key not found',
        })
      }

      if (
        !(await checkPermissions(
          context,
          {
            isSystem: existingKey.isSystem,
            userId: existingKey.userId,
            organizationId: existingKey.organizationId,
          },
          { providerKey: ['delete'] },
        ))
      ) {
        throw new ORPCError('FORBIDDEN', {
          message: 'You do not have permission to delete this provider key',
        })
      }

      // Clear provider key state cache before deleting key
      await deleteProviderKeysStateCache({
        providerId: existingKey.providerId,
        isSystem: existingKey.isSystem,
        userId: existingKey.userId,
        organizationId: existingKey.organizationId,
      })

      // Delete the provider key
      await getDb().delete(ProviderKey).where(eq(ProviderKey.id, id))

      if (existingKey.isSystem) {
        await enableProvider(context, existingKey.providerId)
      }

      // Decrypt the key for response
      const decryptedKey = {
        ...existingKey,
        key: await decryptProviderKey(existingKey.key),
      }

      return {
        providerKey: decryptedKey,
      }
    }),
}

// Check permissions for provider key operations
async function checkPermissions(
  context: UserOrAppUserContext,
  {
    isSystem,
    userId,
    organizationId,
  }: {
    isSystem?: boolean | null
    userId?: string | null
    organizationId?: string | null
  },
  permissions?: OrganizationStatementsSubset,
) {
  if (isSystem) {
    if (!context.auth.isAdmin) {
      // Only admin users can access system provider keys
      return false
    }
  } else if (organizationId) {
    if (context.auth.appId) {
      // App user cannot access organization provider keys
      return false
    }
    const scope = OrganizationScope.fromOrganization(
      { headers: context.headers, db: getDb() },
      organizationId,
    )
    await scope.checkPermissions(permissions)
  } else {
    if (userId && userId !== context.auth.userId) {
      // User trying to access another user's provider keys
      return false
    }
    if (context.auth.appId && !env.WHITELIST_CARED_APPS?.includes(context.auth.appId)) {
      // Users of non-whitelisted apps cannot access user provider keys
      return false
    }
  }

  return true
}

// Enable or disable a provider based on system provider keys
async function enableProvider(context: BaseContext, providerId: ProviderId) {
  const enabled = Boolean(
    await context.db.query.ProviderKey.findFirst({
      where: and(
        eq(ProviderKey.isSystem, true),
        eq(ProviderKey.providerId, providerId),
        eq(ProviderKey.disabled, false),
      ),
    }),
  )

  const providerSettings = await context.db.query.ProviderSettings.findFirst({
    where: eq(ProviderSettings.isSystem, true),
  })
  if (providerSettings) {
    const settings = providerSettings.settings
    settings.providers[providerId] = {
      enabled,
    }

    await context.db
      .update(ProviderSettings)
      .set({ settings })
      .where(eq(ProviderSettings.id, providerSettings.id))
  } else {
    await context.db.insert(ProviderSettings).values({
      isSystem: true,
      settings: {
        providers: {
          [providerId]: {
            enabled,
          },
        },
      },
    })
  }
}
