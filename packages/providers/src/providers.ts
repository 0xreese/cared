import { bedrock, createAmazonBedrock } from '@ai-sdk/amazon-bedrock'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { azure, createAzure } from '@ai-sdk/azure'
import { cerebras, createCerebras } from '@ai-sdk/cerebras'
import { cohere, createCohere } from '@ai-sdk/cohere'
import { createDeepInfra, deepinfra } from '@ai-sdk/deepinfra'
import { createDeepSeek, deepseek } from '@ai-sdk/deepseek'
import { createElevenLabs, elevenlabs } from '@ai-sdk/elevenlabs'
import { createFal, fal } from '@ai-sdk/fal'
import { createFireworks, fireworks } from '@ai-sdk/fireworks'
import { createGoogleGenerativeAI, google } from '@ai-sdk/google'
import { createVertex, vertex } from '@ai-sdk/google-vertex/edge' // for Edge Runtime
import { createGroq, groq } from '@ai-sdk/groq'
import { createLMNT, lmnt } from '@ai-sdk/lmnt'
import { createLuma, luma } from '@ai-sdk/luma'
import { createMistral, mistral } from '@ai-sdk/mistral'
import { createOpenAI, openai } from '@ai-sdk/openai'
import { createPerplexity, perplexity } from '@ai-sdk/perplexity'
import { createReplicate, replicate } from '@ai-sdk/replicate'
import { createTogetherAI, togetherai } from '@ai-sdk/togetherai'
import { createVercel, vercel } from '@ai-sdk/vercel'
import { createXai, xai } from '@ai-sdk/xai'
import { createOpenRouter, openrouter } from '@openrouter/ai-sdk-provider'

import type { ModelType, Provider, ProviderId, ProviderKey } from './types'
import type {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider'
import { splitModelFullId } from './index'
import { googleServiceAccountSchema } from './types'

export const providers: Record<ProviderId, Provider> = {
  openai: openai,
  anthropic: anthropic,
  google: google,
  vertex: vertex,
  azure: azure,
  bedrock: bedrock,
  deepseek: deepseek,
  mistral: mistral,
  xai: xai,
  togetherai: togetherai,
  cohere: cohere,
  fireworks: fireworks,
  deepinfra: deepinfra,
  cerebras: cerebras,
  groq: groq,
  replicate: replicate,
  perplexity: perplexity,
  luma: luma,
  openrouter: openrouter,
  vercel: vercel,
  fal: fal,
  elevenlabs: elevenlabs,
  lmnt: lmnt,
}

export {
  createOpenAI,
  createAnthropic,
  createGoogleGenerativeAI,
  createVertex,
  createAzure,
  createAmazonBedrock,
  createDeepSeek,
  createMistral,
  createXai,
  createTogetherAI,
  createCohere,
  createFireworks,
  createDeepInfra,
  createCerebras,
  createGroq,
  createReplicate,
  createPerplexity,
  createLuma,
  createOpenRouter,
  createVercel,
  createFal,
  createElevenLabs,
  createLMNT,
}

const creators = {
  openai: createOpenAI,
  anthropic: createAnthropic,
  deepseek: createDeepSeek,
  azure: createAzure,
  bedrock: createAmazonBedrock,
  google: createGoogleGenerativeAI,
  vertex: createVertex,
  mistral: createMistral,
  xai: createXai,
  togetherai: createTogetherAI,
  cohere: createCohere,
  fireworks: createFireworks,
  deepinfra: createDeepInfra,
  cerebras: createCerebras,
  groq: createGroq,
  replicate: createReplicate,
  perplexity: createPerplexity,
  luma: createLuma,
  openrouter: createOpenRouter,
  vercel: createVercel,
  fal: createFal,
  elevenlabs: createElevenLabs,
  lmnt: createLMNT,
}

/**
 * Get model instance by model full ID and type
 * @param fullId Full model ID in format 'providerId:modelId'
 * @param modelType Type of model to get (language/text-embedding/image)
 * @returns Model instance of specified type, or undefined if not found
 */
export function getModel<T extends ModelType>(
  fullId: string,
  modelType: T,
  key?: ProviderKey,
  fetch?: typeof globalThis.fetch,
): T extends 'language'
  ? LanguageModelV2
  : T extends 'image'
    ? ImageModelV2
    : T extends 'speech'
      ? SpeechModelV2
      : T extends 'transcription'
        ? TranscriptionModelV2
        : T extends 'textEmbedding'
          ? EmbeddingModelV2<string>
          : never {
  const { providerId, modelId } = splitModelFullId(fullId)
  let provider = providers[providerId]
  if (key) {
    switch (key.providerId) {
      case 'azure':
        provider = createAzure({
          baseURL: key.baseUrl,
          apiKey: key.apiKey,
          apiVersion: key.apiVersion,
          fetch,
        })
        break
      case 'bedrock':
        provider = createAmazonBedrock({
          baseURL: key.baseUrl,
          region: key.region,
          accessKeyId: key.accessKeyId,
          secretAccessKey: key.secretAccessKey,
          fetch,
        })
        break
      case 'vertex': {
        const serviceAccount = JSON.parse(key.serviceAccountJson.replace(/\s+/g, ''))
        const sa = googleServiceAccountSchema.parse(serviceAccount)
        provider = createVertex({
          baseURL: key.baseUrl,
          location: key.location,
          project: sa.project_id,
          googleCredentials: {
            clientEmail: sa.client_email,
            privateKey: sa.private_key,
            privateKeyId: sa.private_key_id,
          },
          fetch,
        })
        break
      }
      case 'replicate':
        provider = createReplicate({
          baseURL: key.baseUrl,
          apiToken: key.apiToken,
          fetch,
        })
        break
      default: {
        const creator = creators[key.providerId]
        provider = creator({
          apiKey: key.apiKey,
          baseURL: key.baseUrl,
          fetch,
        })
        break
      }
    }
  }

  if (modelType === 'language') {
    return provider.languageModel?.(modelId) as any
  } else if (modelType === 'image') {
    return provider.imageModel?.(modelId) as any
  } else if (modelType === 'speech') {
    return provider.speechModel?.(modelId) as any
  } else if (modelType === 'transcription') {
    return provider.transcriptionModel?.(modelId) as any
  } else {
    return provider.textEmbeddingModel?.(modelId) as any
  }
}
