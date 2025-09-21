import type { Context } from 'hono'
import { z } from 'zod/v4'

import type { ImageGenerationDetails } from '@cared/providers'
import log from '@cared/log'
import { createCustomJsonFetch, extractImageRawResponse, splitModelFullId } from '@cared/providers'
import { getModel } from '@cared/providers/providers'
import { serializeError, sharedV2ProviderOptionsSchema } from '@cared/shared'

import type { TelemetrySettings } from '../../../telemetry'
import type { ImageModelV2CallOptions } from '@ai-sdk/provider'
import { authenticate } from '../../../auth'
import { ExpenseManager, findProvidersByModel, ProviderKeyManager } from '../../../operation'
import {
  getTracer,
  langfuseSpanProcessor,
  recordErrorOnSpan,
  recordSpan,
  selectTelemetryAttributes,
  stringifyForTelemetry,
} from '../../../telemetry'
import { waitUntil } from '../../../utils'
import { authId, handleError } from './language'

// Schema for ImageModelV2 call options
const imageModelV2CallOptionsSchema = z.object({
  prompt: z.string(),
  n: z.number(),
  size: z.templateLiteral([z.number(), 'x', z.number()], 'Invalid size').optional(),
  aspectRatio: z.templateLiteral([z.number(), ':', z.number()], 'Invalid aspect ratio').optional(),
  seed: z.number().optional(),
  providerOptions: sharedV2ProviderOptionsSchema.optional(),
  // headers: z.record(z.string(), z.string().or(z.undefined())).optional(),
})

// Request schema
const requestArgsSchema = z.object({
  modelId: z.string(),
  ...imageModelV2CallOptionsSchema.shape,

  payerOrganizationId: z.string().optional(),
})

export async function GET(c: Context): Promise<Response> {
  const modelId = c.req.query('modelId')
  if (!modelId) {
    return new Response('`modelId` is required', {
      status: 400,
    })
  }

  const model = getModel(modelId, 'image')

  const {
    // eslint-disable-next-line @typescript-eslint/unbound-method,@typescript-eslint/no-unused-vars
    doGenerate,
    maxImagesPerCall,
    ...modelConfig
  } = model

  return Response.json({
    ...modelConfig,
    maxImagesPerCall:
      typeof maxImagesPerCall === 'function'
        ? await maxImagesPerCall({ modelId })
        : maxImagesPerCall,
  })
}

export async function POST(c: Context): Promise<Response> {
  try {
    const validatedArgs = requestArgsSchema.safeParse(await c.req.json())
    if (!validatedArgs.success) {
      return Response.json(
        {
          error: z.prettifyError(validatedArgs.error),
        },
        {
          status: 400,
        },
      )
    }

    const { modelId, payerOrganizationId, ...imageModelV2CallOptions } = validatedArgs.data

    const auth = await authenticate(c.req.raw.headers)
    if (!auth.isAuthenticated()) {
      return new Response('Unauthorized', { status: 401 })
    }

    const telemetry: TelemetrySettings = {
      isEnabled: true,
    }
    const tracer = getTracer(telemetry)

    const expenseManager = ExpenseManager.from({
      auth: auth.auth!,
      payerOrganizationId,
      waitUntil: waitUntil(c),
    })

    // Allow modelId without provider prefix
    const models = await recordSpan({
      name: 'findProvidersByModel',
      attributes: selectTelemetryAttributes({
        telemetry,
        attributes: {
          'langfuse.trace.name': 'Image Generate',
          'langfuse.user.id': authId(auth.auth!),
        },
      }),
      tracer,
      fn: async () => await findProvidersByModel(auth.auth!, modelId, 'image'),
    })
    log.info(
      `Input model id: ${modelId}, resolved model ids: ${models.map((m) => m.id).join(', ')}`,
    )

    let lastError: Error | undefined

    for (const modelInfo of models) {
      const modelId = modelInfo.id
      const providerId = splitModelFullId(modelId).providerId

      const keyManager = await recordSpan({
        name: 'findAPIKeysByProvider',
        attributes: {},
        tracer,
        fn: async () => {
          return await ProviderKeyManager.from({
            auth: auth.auth!,
            modelId,
            onlyByok: !modelInfo.chargeable,
            waitUntil: waitUntil(c),
          })
        },
      })

      const keys = keyManager.selectKeys()

      for (const key of keys) {
        log.info(`Using provider key ${key.id} for model ${modelId}`)

        await recordSpan({
          name: 'canAfford',
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {},
          }),
          tracer,
          fn: async () => {
            await expenseManager.canAfford(
              {
                type: 'image',
                ...modelInfo,
              },
              {
                type: 'image',
                ...(imageModelV2CallOptions as ImageModelV2CallOptions),
              },
              key.byok,
            )
          },
        })

        const { prompt: _, ...callOptions_ } = imageModelV2CallOptions
        const details = {
          modelId,
          byok: key.byok,
          latency: 0,
          generationTime: 0,

          type: 'image',
          callOptions: callOptions_,
        } as ImageGenerationDetails

        const customFetch = createCustomJsonFetch({
          onSuccess: (response) => {
            details.rawResponse = extractImageRawResponse(providerId, response)
          },
          onLatency: (latency) => {
            details.latency = latency
          },
        })

        const model = getModel(modelId, 'image', key.key, customFetch)

        const input = stringifyForTelemetry([
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: imageModelV2CallOptions.prompt,
              },
            ],
          },
        ])

        const result = await recordSpan({
          name: 'ai.doGenerate',
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {
              'gen_ai.operation.name': 'generate_content',
              'gen_ai.provider.name': model.provider,
              'gen_ai.request.model': model.modelId,
              'gen_ai.request.n': imageModelV2CallOptions.n,
              'gen_ai.request.size': imageModelV2CallOptions.size,
              'gen_ai.request.aspectRatio': imageModelV2CallOptions.aspectRatio,
              'gen_ai.request.seed': imageModelV2CallOptions.seed,
              'langfuse.observation.type': 'generation',
              'langfuse.trace.input': {
                input: () => input,
              },
              'langfuse.observation.input': {
                input: () => input,
              },
            },
          }),
          tracer,
          fn: async (span) => {
            try {
              const startTime = performance.now()

              const result = await model.doGenerate({
                ...imageModelV2CallOptions,
                abortSignal: c.req.raw.signal,
              } as any)

              details.generationTime = Math.max(
                Math.floor(performance.now() - startTime - details.latency),
                0,
              )
              details.warnings = result.warnings
              details.providerMetadata = result.providerMetadata
              const { headers: _, ...responseMetadata } = result.response
              details.responseMetadata = responseMetadata

              expenseManager.billGeneration(
                {
                  type: 'image',
                  ...modelInfo,
                },
                details,
              )

              keyManager.updateState(key, {
                success: true,
                latency: details.latency,
              })

              keyManager.saveState()

              span.setAttributes(
                selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    'gen_ai.response.model': details.responseMetadata.modelId,
                    // TODO
                  },
                }),
              )

              return Response.json(result)
            } catch (error: any) {
              recordErrorOnSpan(span, error)
              lastError = error
              if (handleError(keyManager, key, error, details)) {
                return false
              } else {
                keyManager.saveState()
                throw error
              }
            }
          },
        })

        if (result === false) {
          // Try the next model/key if available
          continue
        }

        return result
      }

      keyManager.saveState()
    }

    if (lastError) {
      throw lastError
    }

    return new Response('Model not found', {
      status: 400,
    })
  } catch (error: any) {
    log.error('Call image model error', error)
    return Response.json(
      {
        error:
          error instanceof Error
            ? // Serialize error to ensure it can be properly transferred across the network
              serializeError(error)
            : error.message || 'An unknown error occurred',
        errorSerialized: error instanceof Error,
      },
      { status: 500 },
    )
  } finally {
    c.executionCtx.waitUntil(langfuseSpanProcessor.forceFlush())
  }
}
