import hash from 'stable-hash'

import type { LiteLLMModelInfo } from '../litellm'
import type { OpenRouterModelInfo } from '../openrouter'
import type { ProviderInfo } from '../types'
import { getLiteLLMModels } from '../litellm'
import { getOpenRouterModels } from '../openrouter'
import { modelFullId } from '../types'
import anthropicProvider from './anthropic'
import azureProvider from './azure'
import bedrockProvider from './bedrock'
import cerebrasProvider from './cerebras'
import cohereProvider from './cohere'
import deepinfraProvider from './deepinfra'
import deepseekProvider from './deepseek'
import fireworksProvider from './fireworks'
import googleProvider from './google'
import groqProvider from './groq'
import lumaProvider from './luma'
import mistralProvider from './mistral'
import openaiProvider from './openai'
import perplexityProvider from './perplexity'
import replicateProvider from './replicate'
import togetheraiProvider from './togetherai'
import vertexProvider from './vertex'
import xaiProvider from './xai'

let openrouterModelsSingleton: OpenRouterModelInfo[] | undefined
let litellmModelsSingleton: Record<string, Record<string, LiteLLMModelInfo>> | undefined
let providerInfosSingleton: ProviderInfo[]

/**
 * Get all provider information including dynamically fetched OpenRouter models
 * TODO: deprecated
 * @returns Promise resolving to an array of provider information
 */
export async function getProviderInfos(): Promise<ProviderInfo[]> {
  const openrouterModels = await getOpenRouterModels()
  const litellmModels = await getLiteLLMModels()

  // Only rebuild the provider infos if models have changed
  if (
    hash(openrouterModels) !== hash(openrouterModelsSingleton) ||
    hash(litellmModels) !== hash(litellmModelsSingleton)
  ) {
    openrouterModelsSingleton = openrouterModels
    litellmModelsSingleton = litellmModels

    providerInfosSingleton = [
      openaiProvider,
      anthropicProvider,
      deepseekProvider,
      azureProvider,
      bedrockProvider,
      googleProvider,
      vertexProvider,
      mistralProvider,
      xaiProvider,
      togetheraiProvider,
      cohereProvider,
      fireworksProvider,
      deepinfraProvider,
      cerebrasProvider,
      groqProvider,
      replicateProvider,
      perplexityProvider,
      lumaProvider,
      {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: 'openrouter.svg',
        description: 'OpenRouter API gateway providing access to various AI models',
        languageModels: openrouterModels,
      },
    ]
  }

  return providerInfosSingleton
}

export async function getTextEmbeddingModelInfos() {
  const providerInfos = await getProviderInfos()
  return providerInfos.flatMap(
    (provider) =>
      provider.textEmbeddingModels?.map((model) => ({
        ...model,
        id: modelFullId(provider.id, model.id),
      })) ?? [],
  )
}

// TODO: deprecated
export async function getTextEmbeddingModelInfo(fullId: string) {
  const textEmbeddingModelInfos = await getTextEmbeddingModelInfos()
  return textEmbeddingModelInfos.find((model) => model.id === fullId)
}

export async function getTextEmbeddingDimensions(fullId: string) {
  const modelInfo = await getTextEmbeddingModelInfo(fullId)
  let dimensions = modelInfo?.dimensions
  if (Array.isArray(dimensions)) {
    dimensions = dimensions[0]
  }
  return dimensions
}
