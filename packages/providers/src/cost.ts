import assert from 'assert'
import { Decimal } from 'decimal.js'

import { SuperJSON } from '@cared/shared'

import type {
  BaseModelInfo,
  EmbeddingModelInfo,
  GenerationDetails,
  ImageGenerationDetails,
  ImageModelInfo,
  LanguageGenerationDetails,
  LanguageModelInfo,
  ModelFullId,
  SpeechGenerationDetails,
  SpeechModelInfo,
  TextEmbeddingGenerationDetails,
  TranscriptionGenerationDetails,
  TranscriptionModelInfo,
  TypedModelInfo,
} from './types'
import type {
  EmbeddingModelV2,
  ImageModelV2CallOptions,
  LanguageModelV2CallOptions,
  SpeechModelV2CallOptions,
  TranscriptionModelV2CallOptions,
} from '@ai-sdk/provider'
import { modelPriceSchema, qualitySizePricePerImageSchema, splitModelFullId } from './types'

export function isChargeable(model: BaseModelInfo) {
  return model.chargeable
}

export function isByokChargeable(model: TypedModelInfo) {
  if (isChargeable(model)) {
    return true
  }
  switch (model.type) {
    case 'language':
      return Boolean(model.inputTokenPrice || model.outputTokenPrice)
    case 'image':
      return Boolean(model.imageInputTokenPrice)
    case 'speech':
      return false
    case 'transcription':
      return false
    case 'textEmbedding':
      return false
  }
}

export function estimateGenerationCost(
  model: TypedModelInfo,
  callOptions: ModelCallOptions,
): Decimal | undefined {
  const estimateCost = () => {
    // TODO
    switch (model.type) {
      case 'language':
        assert(callOptions.type === 'language')
        return estimateLanguageCost(model, callOptions)
      case 'image':
        assert(callOptions.type === 'image')
        return estimateImageCost(model, callOptions)
      case 'speech':
        assert(callOptions.type === 'speech')
        return undefined
      case 'transcription':
        assert(callOptions.type === 'transcription')
        return undefined
      case 'textEmbedding':
        assert(callOptions.type === 'textEmbedding')
        return undefined
    }
  }

  return (
    estimateCost()
      // divided by M
      ?.div(Decimal.pow(10, 6))
      // rounded up to 10 decimal places
      .toDecimalPlaces(10, Decimal.ROUND_CEIL)
  )
}

export function computeGenerationCost(
  model: TypedModelInfo,
  details: GenerationDetails,
): Decimal | undefined {
  const computeCost = () => {
    switch (model.type) {
      case 'language':
        assert(details.type === 'language')
        return computeLanguageCost(model, details)
      case 'image':
        assert(details.type === 'image')
        return computeImageCost(model, details)
      case 'speech':
        assert(details.type === 'speech')
        return computeSpeechCost(model, details)
      case 'transcription':
        assert(details.type === 'transcription')
        return computeTranscriptionCost(model, details)
      case 'textEmbedding':
        assert(details.type === 'textEmbedding')
        return computeTextEmbeddingCost(model, details)
    }
  }

  return (
    computeCost()
      // divided by M
      ?.div(Decimal.pow(10, 6))
      // rounded up to 10 decimal places
      .toDecimalPlaces(10, Decimal.ROUND_CEIL)
  )
}

export type EmbeddingModelV2CallOptions = Parameters<EmbeddingModelV2<string>['doEmbed']>[0]

export type ModelCallOptions =
  | ({
      type: 'language'
    } & LanguageModelV2CallOptions)
  | ({
      type: 'image'
    } & ImageModelV2CallOptions)
  | ({
      type: 'speech'
    } & SpeechModelV2CallOptions)
  | ({
      type: 'transcription'
    } & TranscriptionModelV2CallOptions)
  | ({
      type: 'textEmbedding'
    } & EmbeddingModelV2CallOptions)

function estimateLanguageCost(model: LanguageModelInfo, callOptions: LanguageModelV2CallOptions) {
  // TODO: count tokens properly
  const inputTokens = SuperJSON.stringify(callOptions.prompt).length * 2 + 100
  return new Decimal(model.inputTokenPrice ?? 0).times(inputTokens)
}

function computeLanguageCost(
  model: LanguageModelInfo,
  details: LanguageGenerationDetails,
): Decimal | undefined {
  const usage = details.usage

  const inputCost = new Decimal(model.inputTokenPrice ?? 0)
    .times((usage.inputTokens ?? 0) - (usage.cachedInputTokens ?? 0))
    .clamp(0, Infinity)
  const outputCost = new Decimal(model.outputTokenPrice ?? 0).times(usage.outputTokens ?? 0)
  const cachedInputCost = new Decimal(model.cachedInputTokenPrice ?? 0).times(
    usage.cachedInputTokens ?? 0,
  )
  let cacheInputCost = new Decimal(0)
  for (const [key, value] of Object.entries(Object.values(details.providerMetadata ?? {}))) {
    // For anthropic
    if (key === 'cacheCreationInputTokens' && typeof value === 'number') {
      let price: string | number = 0
      if (typeof model.cachedInputTokenPrice === 'string') {
        price = model.cachedInputTokenPrice
      } else if (Array.isArray(model.cacheInputTokenPrice)) {
        // TODO
        price = Decimal.max(...model.cacheInputTokenPrice.map(([, price]) => price)).toString()
      }

      cacheInputCost = new Decimal(price).times(value)
      break
    }
  }

  return inputCost.plus(outputCost).plus(cachedInputCost).plus(cacheInputCost)
}

function estimateImageCost(
  model: ImageModelInfo & {
    id: ModelFullId
  },
  callOptions: ImageModelV2CallOptions,
) {
  const { providerId } = splitModelFullId(model.id)
  switch (providerId) {
    case 'openai':
      if (model.pricePerImage) {
        qualitySizePricePerImageSchema.parse(model.pricePerImage)
      }
      break
    case 'google':
    case 'vertex':
      if (model.pricePerImage) {
        modelPriceSchema.parse(model.pricePerImage)
      }
      break
    case 'fal':
      if (model.pricePerImage) {
        modelPriceSchema.parse(model.pricePerImage)
      }
      break
  }

  return new Decimal(0.04).times(callOptions.n)
}

function computeImageCost(
  model: ImageModelInfo,
  details: ImageGenerationDetails,
): Decimal | undefined {
  const rawResponse = details.rawResponse
  switch (rawResponse?.providerId) {
    case 'openai': {
      const usage = rawResponse.usage
      if (
        usage &&
        model.imageInputTokenPrice &&
        model.textInputTokenPrice &&
        model.imageOutputTokenPrice
      ) {
        const imageInputCost = new Decimal(model.imageInputTokenPrice).times(
          usage.input_tokens_details.image_tokens,
        )
        const textInputCost = new Decimal(model.textInputTokenPrice).times(
          usage.input_tokens_details.text_tokens,
        )
        const imageOutputCost = new Decimal(model.imageOutputTokenPrice).times(usage.output_tokens)
        return imageInputCost.plus(textInputCost).plus(imageOutputCost)
      }

      if (model.pricePerImage) {
        const pricePerImage = model.pricePerImage as [string, [string, string][]][]

        const qualities = {
          low: 'Low',
          medium: 'Medium',
          high: 'High',
          standard: 'Standard',
          hd: 'HD',
        }
        // @ts-ignore
        const quality = qualities[rawResponse.quality]

        const sizePrices = (pricePerImage.find(([q]) => q === quality) ?? pricePerImage.at(-1)!).at(
          1,
        )! as [string, string][]
        const price = (sizePrices.find(([s]) => s === rawResponse.size) ?? sizePrices.at(-1)!).at(
          1,
        )!

        return new Decimal(price).times(details.callOptions.n).times(Decimal.pow(10, 6))
      }
      break
    }
    case 'google':
    case 'vertex': {
      if (model.pricePerImage) {
        return new Decimal(model.pricePerImage as string)
          .times(rawResponse.predictions.length)
          .times(Decimal.pow(10, 6))
      }
      break
    }
    case 'fal': {
      const images = details.providerMetadata?.fal?.images as
        | {
            width?: number
            height?: number
          }[]
        | undefined
      if (images) {
        if (model.imageOutputTokenPrice) {
          let cost = new Decimal(0)
          for (const image of images) {
            if (image.width && image.height) {
              cost = cost.plus(
                new Decimal(image.width).times(image.height).times(model.imageOutputTokenPrice),
              )
            }
          }
          return cost
        }

        if (model.pricePerImage) {
          return new Decimal(model.pricePerImage as string)
            .times(images.length)
            .times(Decimal.pow(10, 6))
        }
      }
    }
  }
  return
}

function computeSpeechCost(
  _model: SpeechModelInfo,
  _details: SpeechGenerationDetails,
): Decimal | undefined {
  return
}

function computeTranscriptionCost(
  _model: TranscriptionModelInfo,
  _details: TranscriptionGenerationDetails,
): Decimal | undefined {
  return
}

function computeTextEmbeddingCost(
  _model: EmbeddingModelInfo,
  _details: TextEmbeddingGenerationDetails,
): Decimal | undefined {
  return
}
