import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'

// @ts-ignore
import type { ModelInfos, ProviderId } from '@cared/providers'
// @ts-ignore
import { and, eq } from '@cared/db'
// @ts-ignore
import { getDb } from '@cared/db/client'
// @ts-ignore
import { ProviderModels } from '@cared/db/schema'
import log from '@cared/log'

// @ts-ignore
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Define strategy types
type Strategy = 'skip' | 'override' | 'replace'

/**
 * Merge two arrays of models, overriding existing models with same ID
 * @param existingModels - Array of existing models
 * @param newModels - Array of new models
 * @returns Object containing merged array and information about overridden models
 */
function overrideExistingModels<T extends { id: string }>(
  existingModels?: T[],
  newModels?: T[],
): {
  mergedModels: T[]
  overriddenModels: T[]
} {
  const modelMap = new Map<string, T>()
  const overriddenModels: T[] = []

  // First, add all existing models to the map
  existingModels?.forEach((model) => {
    modelMap.set(model.id, model)
  })

  // Then, override with new models (new models take precedence)
  newModels?.forEach((model) => {
    if (modelMap.has(model.id)) {
      overriddenModels.push(model)
    }
    modelMap.set(model.id, model)
  })

  // Return merged array and overridden models info
  return {
    mergedModels: Array.from(modelMap.values()),
    overriddenModels,
  }
}

/**
 * Filter out models that already exist in the database.
 * @param existingModels - Array of existing models to filter.
 * @param newModels - Array of new models to add.
 * @returns Object containing filtered models and information about skipped models
 */
function filterExistingModels<T extends { id: string }>(
  existingModels?: T[],
  newModels?: T[],
): {
  filteredModels: T[]
  skippedModels: T[]
} {
  const existingIds = new Set(existingModels?.map((model) => model.id))
  const filteredModels: T[] = []
  const skippedModels: T[] = []

  newModels?.forEach((model) => {
    if (existingIds.has(model.id)) {
      skippedModels.push(model)
    } else {
      filteredModels.push(model)
    }
  })

  return {
    filteredModels,
    skippedModels,
  }
}

/**
 * Read provider info from file
 * @param providerId - The provider ID to read
 * @returns Provider info object
 */
async function readProviderInfo(providerId: ProviderId) {
  try {
    const providerFilePath = path.posix.resolve(
      __dirname,
      `../../providers/src/provider-info/${providerId}`,
    )
    log.info(`Reading provider info from: ${providerFilePath}`)
    return await import(providerFilePath)
  } catch (error) {
    throw new Error(`Failed to read provider info for ${providerId}: ${error}`)
  }
}

/**
 * Push provider models to database
 * @param providerId - The provider ID to push models for
 * @param strategy - The strategy to use when handling existing models
 */
async function pushProviderModels(providerId: ProviderId, strategy: Strategy) {
  log.info(`Starting to push models for provider: ${providerId} with strategy: ${strategy}`)

  // Get provider info by reading the file
  const providerModule = await readProviderInfo(providerId)
  const providerInfo = providerModule.default

  if (!providerInfo) {
    throw new Error(`Provider ${providerId} not found or invalid`)
  }

  // Extract models from provider info
  const newModels: ModelInfos = {
    languageModels: providerInfo.languageModels || [],
    imageModels: providerInfo.imageModels || [],
    speechModels: providerInfo.speechModels || [],
    transcriptionModels: providerInfo.transcriptionModels || [],
    textEmbeddingModels: providerInfo.textEmbeddingModels || [],
  }

  // Check if provider models already exist in database
  const existingRecord = await getDb().query.ProviderModels.findFirst({
    where: and(eq(ProviderModels.providerId, providerId), eq(ProviderModels.isSystem, true)),
  })

  if (existingRecord) {
    log.info(`Found existing provider models record: ${existingRecord.id}`)

    // Get existing models from the record
    const existingModels = existingRecord.models

    if (strategy === 'skip') {
      log.info(
        `Using skip strategy for provider ${providerId} - will skip models that already exist`,
      )

      // Skip strategy: Filter out models that already exist in the database
      const languageModelsResult = filterExistingModels(
        existingModels.languageModels,
        newModels.languageModels,
      )
      const imageModelsResult = filterExistingModels(
        existingModels.imageModels,
        newModels.imageModels,
      )
      const speechModelsResult = filterExistingModels(
        existingModels.speechModels,
        newModels.speechModels,
      )
      const transcriptionModelsResult = filterExistingModels(
        existingModels.transcriptionModels,
        newModels.transcriptionModels,
      )
      const textEmbeddingModelsResult = filterExistingModels(
        existingModels.textEmbeddingModels,
        newModels.textEmbeddingModels,
      )

      // Log skipped models (models that already exist)
      const allSkippedModels = [
        ...languageModelsResult.skippedModels,
        ...imageModelsResult.skippedModels,
        ...speechModelsResult.skippedModels,
        ...transcriptionModelsResult.skippedModels,
        ...textEmbeddingModelsResult.skippedModels,
      ]

      if (allSkippedModels.length > 0) {
        const skippedModelIds = allSkippedModels.map((model) => model.id).join(', ')
        log.info(`Skipped ${allSkippedModels.length} models (already exist): ${skippedModelIds}`)
      }

      // Merge existing models with filtered new models
      const mergedModels = {
        languageModels: [
          ...(existingModels.languageModels || []),
          ...languageModelsResult.filteredModels,
        ],
        imageModels: [
          ...(existingModels.imageModels || []),
          ...imageModelsResult.filteredModels,
        ],
        speechModels: [
          ...(existingModels.speechModels || []),
          ...speechModelsResult.filteredModels,
        ],
        transcriptionModels: [
          ...(existingModels.transcriptionModels || []),
          ...transcriptionModelsResult.filteredModels,
        ],
        textEmbeddingModels: [
          ...(existingModels.textEmbeddingModels || []),
          ...textEmbeddingModelsResult.filteredModels,
        ],
      }

      await getDb()
        .update(ProviderModels)
        .set({
          models: mergedModels,
        })
        .where(eq(ProviderModels.id, existingRecord.id))

      logModelInfos(providerId, mergedModels)
    } else if (strategy === 'override') {
      log.info(
        `Using override strategy for provider ${providerId} - will override existing models with new ones`,
      )

      // Override strategy: For each model type, merge existing and new models
      // If a model with same ID exists, override it; otherwise add new ones
      const languageModelsResult = overrideExistingModels(
        existingModels.languageModels,
        newModels.languageModels,
      )
      const imageModelsResult = overrideExistingModels(
        existingModels.imageModels,
        newModels.imageModels,
      )
      const speechModelsResult = overrideExistingModels(
        existingModels.speechModels,
        newModels.speechModels,
      )
      const transcriptionModelsResult = overrideExistingModels(
        existingModels.transcriptionModels,
        newModels.transcriptionModels,
      )
      const textEmbeddingModelsResult = overrideExistingModels(
        existingModels.textEmbeddingModels,
        newModels.textEmbeddingModels,
      )

      // Log overridden models (models that existed and are being replaced)
      const allOverriddenModels = [
        ...languageModelsResult.overriddenModels,
        ...imageModelsResult.overriddenModels,
        ...speechModelsResult.overriddenModels,
        ...transcriptionModelsResult.overriddenModels,
        ...textEmbeddingModelsResult.overriddenModels,
      ]

      if (allOverriddenModels.length > 0) {
        const overriddenModelIds = allOverriddenModels.map((model) => model.id).join(', ')
        log.info(`Overridden ${allOverriddenModels.length} models: ${overriddenModelIds}`)
      }

      const mergedModels = {
        languageModels: languageModelsResult.mergedModels,
        imageModels: imageModelsResult.mergedModels,
        speechModels: speechModelsResult.mergedModels,
        transcriptionModels: transcriptionModelsResult.mergedModels,
        textEmbeddingModels: textEmbeddingModelsResult.mergedModels,
      }

      await getDb()
        .update(ProviderModels)
        .set({
          models: mergedModels,
        })
        .where(eq(ProviderModels.id, existingRecord.id))

      logModelInfos(providerId, mergedModels)
    } else if (strategy === 'replace') {
      log.info(
        `Using replace strategy for provider ${providerId} - will completely replace all models`,
      )

      // Replace strategy: Completely replace all models with new ones
      await getDb()
        .update(ProviderModels)
        .set({
          models: newModels,
        })
        .where(eq(ProviderModels.id, existingRecord.id))

      logModelInfos(providerId, newModels)
    }
  } else {
    log.info(`Creating new provider models record for ${providerId}`)

    await getDb().insert(ProviderModels).values({
      isSystem: true,
      providerId,
      models: newModels,
    })

    logModelInfos(providerId, newModels)
  }
}

function logModelInfos(providerId: ProviderId, modelInfos: ModelInfos) {
  const totalModels = Object.values(modelInfos).reduce(
    (sum: number, modelArray: []) => sum + modelArray.length,
    0,
  )
  log.info(`Provider ${providerId} now has ${totalModels} total models`)

  Object.entries(modelInfos).forEach(
    ([
      type,
      modelArray,
    ]: [
      string,
      [],
    ]) => {
      if (modelArray.length > 0) {
        log.info(`  - ${type}: ${modelArray.length} models`)
      }
    },
  )
}

/**
 * Main function to run the script
 */
async function main() {
  const program = new Command()

  program
    .name('push-provider-models')
    .description('Push provider models to database')
    .version('1.0.0')
    .requiredOption('-p, --provider <providerId>', 'Provider ID to push models for')
    .option(
      '-s, --strategy <strategy>',
      'Strategy for handling existing models:\n  skip: Skip models that already exist, add only new ones\n  override: Replace existing models with new ones, keep unchanged ones\n  replace: Completely replace all models with new ones\n ',
      'skip',
    )
    .parse()

  const options = program.opts()
  const providerId = options.provider as ProviderId
  const strategy = options.strategy as Strategy

  // Validate strategy
  if (!['skip', 'override', 'replace'].includes(strategy)) {
    log.error(`Invalid strategy: ${strategy}. Must be one of: skip, override, replace`)
    process.exit(1)
    return
  }

  try {
    await pushProviderModels(providerId, strategy)
    log.info(`Pushing ${providerId} models succeeded with strategy: ${strategy}`)
    process.exit(0)
  } catch (error) {
    log.error(`Pushing ${providerId} models failed:`, error)
    process.exit(1)
  }
}

main()
