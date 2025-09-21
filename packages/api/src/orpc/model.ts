import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import type { BaseModelInfo, ModelInfos, ModelType } from '@cared/providers'
import { and, eq, or } from '@cared/db'
import { ProviderModels, ProviderSettings } from '@cared/db/schema'
import {
  defaultModels,
  getBaseProviderInfos,
  modelFullId,
  modelFullIdSchema,
  modelTypes,
  providerIdSchema,
  splitModelFullId,
} from '@cared/providers'

import type { ReturnedProviderInfo } from '../operation'
import type { Context } from '../orpc'
import { OrganizationScope } from '../auth'
import { getProviderModelInfos, sourceSchema } from '../operation'
import { protectedProcedure, publicProcedure } from '../orpc'
import { updateModelArgsSchema, updateModelsArgsSchema } from '../types'

export const modelRouter = {
  /**
   * List default models used by the platform.
   * Accessible by anyone.
   * @returns Default models
   */
  listDefaultModels: publicProcedure
    .route({
      method: 'GET',
      path: '/v1/default-models',
      tags: ['models'],
      summary: 'Get default models used by the platform',
    })
    .handler(() => {
      return { defaultModels }
    }),

  /**
   * List all available model providers.
   * Accessible by anyone.
   * @returns List of providers with their basic information
   */
  listProviders: publicProcedure
    .route({
      method: 'GET',
      path: '/v1/providers',
      tags: ['models'],
      summary: 'List all available model providers',
    })
    .handler(async ({ context }) => {
      const providers = getBaseProviderInfos()

      const providerSettings = (
        await context.db.query.ProviderSettings.findFirst({
          where: eq(ProviderSettings.isSystem, true),
        })
      )?.settings

      return {
        providers: providers.map((provider) => ({
          ...provider,
          enabled: Boolean(providerSettings?.providers[provider.id]?.enabled),
        })),
      }
    }),

  /**
   * List all providers with their models, grouped by model type.
   * Accessible by authenticated users.
   * @param input - Object containing optional model type filter and organizationId
   * @returns Models organized by type, each containing providers with their models
   */
  listProvidersModels: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/providers-models',
      tags: ['models'],
      summary: 'List all providers with their models, grouped by model type',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          type: z.enum(modelTypes).optional(),
          source: sourceSchema.optional(),
        })
        .default({}),
    )
    .handler(async ({ input, context }) => {
      const userId = await checkPermissions(context, input.organizationId)
      const providerInfos = await getProviderModelInfos(input.source, input.organizationId, userId)

      function format<M extends BaseModelInfo>(provider: ReturnedProviderInfo, models?: M[]) {
        return {
          id: provider.id,
          name: provider.name,
          description: provider.description,
          icon: provider.icon,
          isGateway: provider.isGateway,
          models:
            models?.map((model) => ({
              ...model,
              id: modelFullId(provider.id, model.id),
            })) ?? [],
        }
      }

      const language = []
      const image = []
      const speech = []
      const transcription = []
      const textEmbedding = []

      for (const provider of providerInfos) {
        language.push(format(provider, provider.languageModels))
        image.push(format(provider, provider.imageModels))
        speech.push(format(provider, provider.speechModels))
        transcription.push(format(provider, provider.transcriptionModels))
        textEmbedding.push(format(provider, provider.textEmbeddingModels))
      }

      return {
        models: {
          language: !input.type || input.type === 'language' ? language : undefined,
          image: !input.type || input.type === 'image' ? image : undefined,
          speech: !input.type || input.type === 'speech' ? speech : undefined,
          transcription: !input.type || input.type === 'transcription' ? transcription : undefined,
          textEmbedding: !input.type || input.type === 'textEmbedding' ? textEmbedding : undefined,
        },
      }
    }),

  /**
   * List all available models across all providers.
   * Accessible by authenticated users.
   * @param input - Object containing model type filter and organizationId
   * @returns List of models matching the type
   */
  listModels: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/models',
      tags: ['models'],
      summary: 'List all available models across all providers',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          type: z.enum(modelTypes).optional(),
          source: sourceSchema.optional(),
        })
        .default({}),
    )
    .handler(async ({ input, context }) => {
      const userId = await checkPermissions(context, input.organizationId)
      const providerInfos = await getProviderModelInfos(input.source, input.organizationId, userId)

      function format<M extends { id: string }>(provider: ReturnedProviderInfo, models?: M[]) {
        return (
          models?.map((model) => ({
            ...model,
            id: modelFullId(provider.id, model.id),
          })) ?? []
        )
      }

      const language = []
      const image = []
      const speech = []
      const transcription = []
      const textEmbedding = []

      for (const provider of providerInfos) {
        language.push(...format(provider, provider.languageModels))
        image.push(...format(provider, provider.imageModels))
        speech.push(...format(provider, provider.speechModels))
        transcription.push(...format(provider, provider.transcriptionModels))
        textEmbedding.push(...format(provider, provider.textEmbeddingModels))
      }

      return {
        models: {
          language: !input.type || input.type === 'language' ? language : undefined,
          image: !input.type || input.type === 'image' ? image : undefined,
          speech: !input.type || input.type === 'speech' ? speech : undefined,
          transcription: !input.type || input.type === 'transcription' ? transcription : undefined,
          textEmbedding: !input.type || input.type === 'textEmbedding' ? textEmbedding : undefined,
        },
      }
    }),

  /**
   * Get detailed information about a specific model.
   * Accessible by authenticated users.
   * @param input - Object containing model full ID, type, and organizationId
   * @returns The model information if found
   */
  getModel: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/models/{id}',
      tags: ['models'],
      summary: 'Get detailed information about a specific model',
    })
    .input(
      z.object({
        organizationId: z.string().optional(),
        id: modelFullIdSchema,
        type: z.enum(modelTypes),
        source: sourceSchema.optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = await checkPermissions(context, input.organizationId)

      const { providerId, modelId } = splitModelFullId(input.id)

      // Get provider models from database (system + user/organization)
      const providerModels = await context.db
        .select()
        .from(ProviderModels)
        .where(
          and(
            or(
              eq(ProviderModels.isSystem, true),
              input.organizationId
                ? eq(ProviderModels.organizationId, input.organizationId)
                : eq(ProviderModels.userId, userId!),
            ),
            eq(ProviderModels.providerId, providerId),
          ),
        )

      function findModel(models: ModelInfos | undefined, type: ModelType) {
        return models?.[`${type}Models` as const]?.find((m) => m.id === modelId)
      }

      const systemModel = findModel(providerModels.find((pm) => pm.isSystem)?.models, input.type)
      const userOrgModel = findModel(providerModels.find((pm) => !pm.isSystem)?.models, input.type)

      let model
      switch (input.source) {
        case 'system':
          model = systemModel
          break
        case 'custom':
          model = userOrgModel
          break
        default:
          model = systemModel ?? userOrgModel // if both exist, prefer system models
          break
      }

      if (!model) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Model not found',
        })
      }

      return {
        model: {
          ...model,
          id: input.id,
          isSystem: model === systemModel,
        },
      }
    }),

  /**
   * Add a new model to a provider for an organization.
   * Accessible by authenticated users with organization permissions.
   * @param input - Object containing organizationId, providerId, and model information
   * @returns Success message
   */
  updateModel: protectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/models',
      tags: ['models'],
      summary: 'Add or update a model to a provider',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          providerId: providerIdSchema,
          isSystem: z.boolean().optional(),
        })
        .and(updateModelArgsSchema)
        .refine((data) => !(data.organizationId && data.isSystem), {
          message: 'organizationId and isSystem cannot both be present',
        }),
    )
    .handler(async ({ input, context }) => {
      const userId = await checkPermissions(context, input.organizationId, input.isSystem)

      let providerModels = await context.db.query.ProviderModels.findFirst({
        where: and(
          input.isSystem
            ? eq(ProviderModels.isSystem, true)
            : input.organizationId
              ? eq(ProviderModels.organizationId, input.organizationId)
              : eq(ProviderModels.userId, userId!),
          eq(ProviderModels.providerId, input.providerId),
        ),
      })

      if (!providerModels) {
        providerModels = (
          await context.db
            .insert(ProviderModels)
            .values({
              isSystem: input.isSystem ?? false,
              userId: !input.isSystem && !input.organizationId ? userId! : undefined,
              organizationId: !input.isSystem ? input.organizationId : undefined,
              providerId: input.providerId,
              models: {},
            })
            .returning()
        )[0]
        if (!providerModels) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'Failed to create provider models record',
          })
        }
      }

      const type = input.type
      const model = input.model

      // Validate that the model id matches the provider
      const { providerId, modelId } = splitModelFullId(model.id)
      if (providerId !== input.providerId) {
        throw new ORPCError('BAD_REQUEST', {
          message: `Model id ${model.id} has providerId ${providerId}, but expected ${input.providerId}`,
        })
      }

      let models = providerModels.models[`${type}Models` as const]
      if (!models) {
        models = []
        providerModels.models[`${type}Models` as const] = models
      }
      const index = models.findIndex((m) => m.id === modelId)
      if (index >= 0) {
        // Update existing model
        models[index] = { ...model, id: modelId }
      } else {
        // Add new model
        models.push({ ...model, id: modelId })
      }

      // Update the existing record
      await context.db
        .update(ProviderModels)
        .set({ models: providerModels.models })
        .where(eq(ProviderModels.id, providerModels.id))

      return {
        model: {
          ...model,
          isSystem: providerModels.isSystem,
        },
      }
    }),

  /**
   * Add or update multiple models to a provider.
   * Accessible by authenticated users.
   * @returns Success message with updated models
   */
  updateModels: protectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/models/batch',
      tags: ['models'],
      summary: 'Add or update multiple models to a provider',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          providerId: providerIdSchema,
          isSystem: z.boolean().optional(),
        })
        .and(updateModelsArgsSchema)
        .refine((data) => !(data.organizationId && data.isSystem), {
          message: 'organizationId and isSystem cannot both be present',
        }),
    )
    .handler(async ({ input, context }) => {
      const userId = await checkPermissions(context, input.organizationId, input.isSystem)

      let providerModels = await context.db.query.ProviderModels.findFirst({
        where: and(
          input.isSystem
            ? eq(ProviderModels.isSystem, true)
            : input.organizationId
              ? eq(ProviderModels.organizationId, input.organizationId)
              : eq(ProviderModels.userId, userId!),
          eq(ProviderModels.providerId, input.providerId),
        ),
      })

      if (!providerModels) {
        providerModels = (
          await context.db
            .insert(ProviderModels)
            .values({
              isSystem: input.isSystem ?? false,
              userId: !input.isSystem && !input.organizationId ? userId! : undefined,
              organizationId: !input.isSystem ? input.organizationId : undefined,
              providerId: input.providerId,
              models: {},
            })
            .returning()
        )[0]
        if (!providerModels) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'Failed to create provider models record',
          })
        }
      }

      const type = input.type
      const models = input.models

      // Validate that all model ids match the provider
      const validatedModels = models.map((model) => {
        const { providerId, modelId } = splitModelFullId(model.id)
        if (providerId !== input.providerId) {
          throw new ORPCError('BAD_REQUEST', {
            message: `Model id ${model.id} has providerId ${providerId}, but expected ${input.providerId}`,
          })
        }
        return { ...model, id: modelId }
      })

      let existingModels = providerModels.models[`${type}Models` as const]
      if (!existingModels) {
        existingModels = []
        providerModels.models[`${type}Models` as const] = existingModels
      }

      // Process each model in the input array
      for (const model of validatedModels) {
        const index = existingModels.findIndex((m) => m.id === model.id)
        if (index >= 0) {
          // Update existing model
          existingModels[index] = model
        } else {
          // Add new model
          existingModels.push(model)
        }
      }

      // Update the existing record
      await context.db
        .update(ProviderModels)
        .set({ models: providerModels.models })
        .where(eq(ProviderModels.id, providerModels.id))

      return {
        models: validatedModels.map((model) => ({
          ...model,
          id: modelFullId(input.providerId, model.id),
          isSystem: providerModels.isSystem,
        })),
      }
    }),

  /**
   * Sort models for a specific provider and type.
   * Accessible by authenticated users.
   * @returns Success message with sorted models
   */
  sortModels: protectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/models/sort',
      tags: ['models'],
      summary: 'Sort models for a specific provider and type',
    })
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          providerId: providerIdSchema,
          isSystem: z.boolean().optional(),
          type: z.enum(modelTypes),
          ids: z.array(modelFullIdSchema),
        })
        .refine((data) => !(data.organizationId && data.isSystem), {
          message: 'organizationId and isSystem cannot both be present',
        }),
    )
    .handler(async ({ input, context }) => {
      const userId = await checkPermissions(context, input.organizationId, input.isSystem)

      const providerModels = await context.db.query.ProviderModels.findFirst({
        where: and(
          input.isSystem
            ? eq(ProviderModels.isSystem, true)
            : input.organizationId
              ? eq(ProviderModels.organizationId, input.organizationId)
              : eq(ProviderModels.userId, userId!),
          eq(ProviderModels.providerId, input.providerId),
        ),
      })

      if (!providerModels) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Provider models not found',
        })
      }

      const type = input.type
      const modelsKey = `${type}Models` as const
      const existingModels = providerModels.models[modelsKey]

      if (!existingModels?.length) {
        throw new ORPCError('NOT_FOUND', {
          message: `No models found for type ${type}`,
        })
      }

      // Validate that all model ids match the provider
      const validatedModelIds = input.ids.map((id) => {
        const { providerId, modelId } = splitModelFullId(id)
        if (providerId !== input.providerId) {
          throw new ORPCError('BAD_REQUEST', {
            message: `Model id ${id} has providerId ${providerId}, but expected ${input.providerId}`,
          })
        }
        return modelId
      })

      // Check if all existing models are included in the ids array
      const existingModelIds = existingModels.map((model) => model.id)
      const missingModels = existingModelIds.filter((id) => !validatedModelIds.includes(id))
      if (missingModels.length > 0) {
        throw new ORPCError('BAD_REQUEST', {
          message: `Missing models in ids array: ${missingModels.join(', ')}`,
        })
      }

      // Check if all ids in the array exist in the existing models
      const extraModels = validatedModelIds.filter((id) => !existingModelIds.includes(id))
      if (extraModels.length > 0) {
        throw new ORPCError('BAD_REQUEST', {
          message: `Extra models in ids array that do not exist: ${extraModels.join(', ')}`,
        })
      }

      // Create a map for quick lookup of existing models
      const modelMap = new Map(existingModels.map((model) => [model.id, model]))

      // Reorder models according to the ids array
      const sortedModels = validatedModelIds.map((modelId) => {
        const model = modelMap.get(modelId)
        if (!model) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: `Model ${modelId} not found in existing models`,
          })
        }
        return model
      })

      // Update the models array with the new order
      providerModels.models[modelsKey] = sortedModels

      // Update the database record
      await context.db
        .update(ProviderModels)
        .set({ models: providerModels.models })
        .where(eq(ProviderModels.id, providerModels.id))

      return {
        models: sortedModels.map((model) => ({
          ...model,
          id: modelFullId(input.providerId, model.id),
          isSystem: providerModels.isSystem,
        })),
      }
    }),

  /**
   * Delete a single model from a provider.
   * Accessible by authenticated users.
   * @returns Success message
   */
  deleteModel: protectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/models',
      tags: ['models'],
      summary: 'Delete a model from a provider',
    })
    .input(
      z.object({
        organizationId: z.string().optional(),
        id: modelFullIdSchema,
        type: z.enum(modelTypes),
        isSystem: z.boolean().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = await checkPermissions(context, input.organizationId, input.isSystem)

      const { providerId, modelId } = splitModelFullId(input.id)

      const providerModels = await context.db.query.ProviderModels.findFirst({
        where: and(
          input.isSystem
            ? eq(ProviderModels.isSystem, true)
            : input.organizationId
              ? eq(ProviderModels.organizationId, input.organizationId)
              : eq(ProviderModels.userId, userId!),
          eq(ProviderModels.providerId, providerId),
        ),
      })

      if (!providerModels) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Provider models not found',
        })
      }

      const modelsKey = `${input.type}Models` as const
      const existingModels = providerModels.models[modelsKey]

      if (!existingModels?.length) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Model not found',
        })
      }

      // Find and remove the model by id
      const deletedModel = existingModels.find((model) => model.id === modelId)
      if (!deletedModel) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Model not found',
        })
      }

      // Update the models array
      providerModels.models[modelsKey] = existingModels.filter((model) => model.id !== modelId)

      // Update the database record
      await context.db
        .update(ProviderModels)
        .set({ models: providerModels.models })
        .where(eq(ProviderModels.id, providerModels.id))

      return {
        model: {
          ...deletedModel,
          id: input.id,
          isSystem: providerModels.isSystem,
        },
      }
    }),

  /**
   * Delete multiple models from a provider.
   * Accessible by authenticated users.
   * @returns Success message with deleted model ids
   */
  deleteModels: protectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/models/batch',
      tags: ['models'],
      summary: 'Delete multiple models from a provider',
    })
    .input(
      z.object({
        organizationId: z.string().optional(),
        providerId: providerIdSchema,
        ids: z.array(modelFullIdSchema),
        type: z.enum(modelTypes),
        isSystem: z.boolean().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = await checkPermissions(context, input.organizationId, input.isSystem)

      // Extract modelIds from the full model ids
      const modelIds = input.ids.map((id) => {
        const { providerId, modelId } = splitModelFullId(id)
        if (providerId !== input.providerId) {
          throw new ORPCError('BAD_REQUEST', {
            message: `Model id ${id} has providerId ${providerId}, but expected ${input.providerId}`,
          })
        }
        return modelId
      })

      const providerModels = await context.db.query.ProviderModels.findFirst({
        where: and(
          input.isSystem
            ? eq(ProviderModels.isSystem, true)
            : input.organizationId
              ? eq(ProviderModels.organizationId, input.organizationId)
              : eq(ProviderModels.userId, userId!),
          eq(ProviderModels.providerId, input.providerId),
        ),
      })

      if (!providerModels) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Provider models not found',
        })
      }

      const modelsKey = `${input.type}Models` as const
      const existingModels = providerModels.models[modelsKey]

      if (!existingModels?.length) {
        throw new ORPCError('NOT_FOUND', {
          message: `No models found to delete`,
        })
      }

      // Find and remove models by modelIds
      const deletedModels = existingModels.filter((model) => modelIds.includes(model.id))
      if (deletedModels.length !== modelIds.length) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Not all models found for deletion',
        })
      }

      // Update the models array
      providerModels.models[modelsKey] = existingModels.filter(
        (model) => !modelIds.includes(model.id),
      )

      // Update the database record
      await context.db
        .update(ProviderModels)
        .set({ models: providerModels.models })
        .where(eq(ProviderModels.id, providerModels.id))

      return {
        models: deletedModels.map((model) => ({
          ...model,
          id: modelFullId(input.providerId, model.id),
          isSystem: providerModels.isSystem,
        })),
      }
    }),
}

async function checkPermissions(context: Context, organizationId?: string, isSystem?: boolean) {
  const auth = context.auth.auth
  switch (auth?.type) {
    case 'user':
    case 'appUser':
      if (organizationId) {
        const scope = OrganizationScope.fromOrganization({ headers: context.headers, db: context.db }, organizationId)
        await scope.checkPermissions()
      } else {
        if (isSystem && auth.type === 'user' && !auth.isAdmin) {
          throw new ORPCError('FORBIDDEN')
        }
        return auth.userId
      }
      break
    case 'apiKey':
      switch (auth.scope) {
        case 'user':
          if (organizationId) {
            const scope = OrganizationScope.fromOrganization({ headers: context.headers, db: context.db }, organizationId)
            await scope.checkPermissions()
          } else {
            if (isSystem && !auth.isAdmin) {
              throw new ORPCError('FORBIDDEN')
            }
            return auth.userId
          }
          break
        default:
          if (organizationId) {
            let scope
            switch (auth.scope) {
              case 'organization':
                scope = OrganizationScope.fromOrganization(context, auth.organizationId)
                break
              case 'workspace':
                scope = await OrganizationScope.fromWorkspace(context, auth.workspaceId)
                break
              case 'app':
                scope = await OrganizationScope.fromApp(context, auth.appId)
                break
            }

            await scope.checkPermissions()

            if (organizationId !== scope.organizationId) {
              throw new ORPCError('FORBIDDEN', {
                message: 'You have no permission to access this organization',
              })
            }
          } else {
            throw new ORPCError('FORBIDDEN', {
              message: `API key with '${auth.scope}' scope cannot access models owned by user`,
            })
          }
      }
  }
}
