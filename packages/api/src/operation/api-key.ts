import { z } from 'zod/v4'

import { auth, headers } from '@cared/auth'
import { inArray } from '@cared/db'
import { getDb } from '@cared/db/client'
import { ApiKey } from '@cared/db/schema'

import type { BaseContext } from '../orpc'
import type { ApiKeyMetadata } from '../types'

export const apiKeyMetadataSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('user'),
  }),
  z.object({
    scope: z.literal('organization'),
    organizationId: z.string(),
  }),
  z.object({
    scope: z.literal('workspace'),
    workspaceId: z.string(),
  }),
  z.object({
    scope: z.literal('app'),
    appId: z.string(),
  }),
])

export type ApiKeyMetadataInput = z.infer<typeof apiKeyMetadataSchema>

export const optionalApiKeyMetadataSchema = z
  .discriminatedUnion('scope', [
    z.object({
      scope: z.literal('user'),
    }),
    z.object({
      scope: z.literal('organization'),
      organizationId: z.string().optional(),
    }),
    z.object({
      scope: z.literal('workspace'),
      workspaceId: z.string().optional(),
    }),
    z.object({
      scope: z.literal('app'),
      appId: z.string().optional(),
    }),
  ])
  .optional()

export type OptionalApiKeyMetadataInput = z.infer<typeof optionalApiKeyMetadataSchema>

export function formatApiKey(key: {
  id: string
  name: string | null
  metadata: Record<string, any> | null
  start: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: key.id,
    name: key.name ?? '',
    ...(key.metadata as ApiKeyMetadata),
    start: key.start ?? '',
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  }
}

export async function listApiKeys(
  ctx: BaseContext,
  input: z.infer<typeof optionalApiKeyMetadataSchema>,
) {
  const allApiKeys = await auth.api.listApiKeys({
    headers: headers(ctx.headers),
  })

  let filteredKeys = allApiKeys

  // Filter by scope if provided
  if (input?.scope) {
    filteredKeys = allApiKeys.filter((key) => key.metadata?.scope === input.scope)

    // Additional filtering based on scope
    switch (input.scope) {
      case 'organization':
        if (input.organizationId) {
          filteredKeys = filteredKeys.filter(
            (key) => key.metadata?.organizationId === input.organizationId,
          )
        } else {
          filteredKeys = []
        }
        break
      case 'workspace':
        if (input.workspaceId) {
          filteredKeys = filteredKeys.filter(
            (key) => key.metadata?.workspaceId === input.workspaceId,
          )
        } else {
          filteredKeys = []
        }
        break
      case 'app':
        if (input.appId) {
          filteredKeys = filteredKeys.filter((key) => key.metadata?.appId === input.appId)
        } else {
          filteredKeys = []
        }
        break
    }
  }

  return filteredKeys.sort((a, b) => b.id.localeCompare(a.id)).map(formatApiKey)
}

export async function deleteApiKeys(
  ctx: BaseContext,
  input: z.infer<typeof optionalApiKeyMetadataSchema>,
) {
  const apiKeys = await listApiKeys(ctx, input)
  if (apiKeys.length === 0) {
    return
  }

  await getDb().delete(ApiKey).where(
    inArray(
      ApiKey.id,
      apiKeys.map((key) => key.id),
    ),
  )

  // Call again to check
  await deleteApiKeys(ctx, input)
}
