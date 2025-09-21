import { z } from 'zod/v4'

import type { SQL } from '@cared/db'
import type { BaseProviderInfo, ModelFullId, ModelInfos, ModelType } from '@cared/providers'
import { eq, inArray, or, sql } from '@cared/db'
import { getDb } from '@cared/db/client'
import { ProviderModels } from '@cared/db/schema'
import log from '@cared/log'
import {
  getBaseProviderInfos,
  getExtendedBaseProviderInfos,
  modelFullId,
  splitModelFullId,
} from '@cared/providers'

import type { AuthObject } from '../auth'

export type ReturnedProviderInfo = BaseProviderInfo & ReturnedModelInfos

export type ReturnedModelInfos = {
  [K in keyof ModelInfos]: ModelInfos[K] extends (infer T)[] | undefined
    ? (T & { isSystem?: boolean })[] | undefined
    : never
}

export const sourceSchema = z.enum(['system', 'custom'])
export type Source = z.infer<typeof sourceSchema>

// TODO: cache
export async function getProviderModelInfos(
  source?: Source,
  organizationId?: string,
  userId?: string,
) {
  const baseProviderInfos = getBaseProviderInfos()

  // Get provider models from database (system + user/organization)
  const providerModelsList = await getDb()
    .select()
    .from(ProviderModels)
    .where(
      source === 'system' // only system models
        ? eq(ProviderModels.isSystem, true)
        : source === 'custom' // only user/organization customized models
          ? organizationId
            ? eq(ProviderModels.organizationId, organizationId)
            : eq(ProviderModels.userId, userId!)
          : or(
              // both system models and user/organization customized models
              eq(ProviderModels.isSystem, true),
              organizationId
                ? eq(ProviderModels.organizationId, organizationId)
                : eq(ProviderModels.userId, userId!),
            ),
    )

  // Separate system and user/organization models
  const systemProviderModels = new Map<string, ProviderModels>()
  const userOrgProviderModels = new Map<string, ProviderModels>()
  for (const providerModels of providerModelsList) {
    const map = providerModels.isSystem ? systemProviderModels : userOrgProviderModels
    if (map.has(providerModels.providerId)) {
      log.error('Duplicate provider models found', {
        providerModels,
      })
    }
    map.set(providerModels.providerId, providerModels)
  }

  const providers: ReturnedProviderInfo[] = []

  const deleteIds: string[] = []
  const updateIds: string[] = []
  const updateSqlChunks: SQL[] = []

  updateSqlChunks.push(sql`(case`)

  for (const providerInfo of baseProviderInfos) {
    const system = systemProviderModels.get(providerInfo.id)
    const userOrg = userOrgProviderModels.get(providerInfo.id)
    const { shouldUpdateUserOrg, ...models } = mergeModels(
      system?.models,
      userOrg?.models, // may be updated in place if deduplicated
    )
    providers.push({
      ...providerInfo,
      ...models,
    })

    if (shouldUpdateUserOrg && userOrg) {
      const models = userOrg.models
      if (
        models.languageModels?.length ||
        models.imageModels?.length ||
        models.speechModels?.length ||
        models.transcriptionModels?.length ||
        models.textEmbeddingModels?.length
      ) {
        updateIds.push(userOrg.id)
        updateSqlChunks.push(sql`when
        ${ProviderModels.id}
        =
        ${userOrg.id}
        then
        ${userOrg.models}`)
      } else {
        // If all model arrays are empty, delete the record
        deleteIds.push(userOrg.id)
      }
    }
  }

  updateSqlChunks.push(sql`end
  )`)

  if (updateIds.length) {
    const finalSql: SQL = sql.join(updateSqlChunks, sql.raw(' '))
    await getDb()
      .update(ProviderModels)
      .set({ models: finalSql })
      .where(inArray(ProviderModels.id, updateIds))
  }

  if (deleteIds.length) {
    await getDb().delete(ProviderModels).where(inArray(ProviderModels.id, deleteIds))
  }

  return providers
}

// Merge system and user/organization models, ensuring no duplicates and system models override user models
function mergeModels(
  system?: ModelInfos,
  userOrg?: ModelInfos,
): ReturnedModelInfos & {
  shouldUpdateUserOrg: boolean
} {
  let shouldUpdateUserOrg = false

  function deduplicate<T extends { id: string; isSystem?: boolean }[]>(system?: T, userOrg?: T) {
    const newUserOrg = [] as unknown as T
    const seen = new Set<string>()
    const sep = system?.length ?? 0
    const deduplicated = [...(system ?? []), ...(userOrg ?? [])]
      // ensure system models override user models
      .filter((item, index) => {
        if (seen.has(item.id)) {
          return false
        }
        if (index < sep) {
          // Mark it as system if it's from system models
          item.isSystem = true
        } else {
          // None-duplicate userOrg models
          newUserOrg.push(item)
        }
        seen.add(item.id)
        return true
      })

    // Update userOrg in place if it has fewer models than before
    if (newUserOrg.length < (userOrg?.length ?? 0)) {
      shouldUpdateUserOrg = true
      userOrg?.splice(0, userOrg.length, ...newUserOrg)
    }

    return deduplicated
  }

  return {
    languageModels: deduplicate(system?.languageModels, userOrg?.languageModels),
    imageModels: deduplicate(system?.imageModels, userOrg?.imageModels),
    speechModels: deduplicate(system?.speechModels, userOrg?.speechModels),
    transcriptionModels: deduplicate(system?.transcriptionModels, userOrg?.transcriptionModels),
    textEmbeddingModels: deduplicate(system?.textEmbeddingModels, userOrg?.textEmbeddingModels),
    shouldUpdateUserOrg,
  }
}

export async function findProvidersByModel<T extends ModelType>(
  auth: AuthObject,
  queryModelId: string,
  modelType: T,
) {
  let userId, organizationId
  if (auth.type === 'user' || auth.type === 'appUser' || auth.scope === 'user') {
    userId = auth.userId
  } else {
    organizationId = auth.organizationId
  }

  const providers = new Map(getExtendedBaseProviderInfos().map((info) => [info.id, info]))

  const providerModelsArray = await getProviderModelInfos(undefined, organizationId, userId)

  const ids = splitModelFullId(queryModelId)
  const queryProviderId = ids.providerId
  queryModelId = ids.modelId

  // provide id => model
  const foundProviderModels = new Map<
    string,
    NonNullable<ReturnedModelInfos[`${typeof modelType}Models`]>[number] & {
      id: ModelFullId
    }
  >()

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (queryProviderId) {
    // TODO: optimize
    const providerModels = providerModelsArray.find((p) => p.id === queryProviderId)
    if (providerModels) {
      const modelsByType = providerModels[`${modelType}Models`]
      const model = modelsByType?.find((model) => model.id === queryModelId)
      if (model) {
        foundProviderModels.set(queryProviderId, {
          ...model,
          id: modelFullId(queryProviderId, model.id),
        })
      }
    }
  } else {
    // If no provider is specified, search all providers for those supporting this model
    providerModelsArray.forEach((providerModels) => {
      const providerId = providerModels.id
      const modelsByType = providerModels[`${modelType}Models`]

      return modelsByType?.forEach((model) => {
        if (model.id === queryModelId) {
          // If the model id matches exactly, always select it
          foundProviderModels.set(providerId, {
            ...model,
            id: modelFullId(providerId, model.id),
          })
        } else {
          const provider = providers.get(providerId)
          if (provider?.isGateway && provider.modelSeparator) {
            const { modelId: modelIdNoPrefix } = provider.modelSeparator(model.id)
            if (modelIdNoPrefix === queryModelId) {
              if (!foundProviderModels.has(providerId)) {
                foundProviderModels.set(providerId, {
                  ...model,
                  id: modelFullId(providerId, model.id),
                })
              }
            }
          }
        }
      })
    })
  }

  const result = Array.from(foundProviderModels.values())
  if (result.length > 0) {
    // Always move the provider with an exact match of the specified model id to the front.
    // This ensures that the provider whose model id exactly matches queryModelId is prioritized.
    const exactProviderIndex = result.findIndex(
      (m) => splitModelFullId(m.id).modelId === queryModelId,
    )
    if (exactProviderIndex >= 0) {
      // Move the exact match to the front
      const [exact] = result.splice(exactProviderIndex, 1)
      result.unshift(exact!)
    }
  }
  return result
}
