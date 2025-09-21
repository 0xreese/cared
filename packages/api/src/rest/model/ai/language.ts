import assert from 'assert'
import type { Context } from 'hono'
import { APICallError } from '@ai-sdk/provider'
import Ajv from 'ajv'
import { z } from 'zod/v4'

import type { LanguageGenerationDetails } from '@cared/providers'
import log from '@cared/log'
import { createCustomFetch } from '@cared/providers'
import { getModel } from '@cared/providers/providers'
import { serializeError, sharedV2ProviderOptionsSchema } from '@cared/shared'

import type { AuthObject } from '../../../auth'
import type { ProviderKeyState } from '../../../operation'
import type { TelemetrySettings } from '../../../telemetry'
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider'
import type { Span, Tracer } from '@opentelemetry/api'
import { authenticate } from '../../../auth'
import { ExpenseManager, findProvidersByModel, ProviderKeyManager } from '../../../operation'
import {
  asToolCalls,
  extractTextContent,
  getTracer,
  langfuseSpanProcessor,
  recordErrorOnSpan,
  recordSpan,
  selectTelemetryAttributes,
  stringifyForTelemetry,
} from '../../../telemetry'
import { languageModelV2MessageSchema } from '../../../types'
import { waitUntil } from '../../../utils'

const ajv = new Ajv({ allErrors: true })

export const jsonSchema7Schema = z
  .record(z.string(), z.any())
  .refine((schema) => ajv.validateSchema(schema), 'Invalid JSON Schema')

const languageModelV2FunctionToolSchema = z.object({
  type: z.literal('function'),
  name: z.string(),
  description: z.string().optional(),
  inputSchema: jsonSchema7Schema,
  providerOptions: sharedV2ProviderOptionsSchema.optional(),
})

const languageModelV2ProviderDefinedToolSchema = z.object({
  type: z.literal('provider-defined'),
  id: z.templateLiteral([z.string(), '.', z.string()]),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
})

const languageModelV2ToolChoiceSchema = z.union([
  z.object({
    type: z.enum(['auto', 'none', 'required']),
  }),
  z.object({
    type: z.literal('tool'),
    toolName: z.string(),
  }),
])

const requestArgsSchema = z.object({
  modelId: z.string(),
  stream: z.boolean(),

  prompt: z.array(languageModelV2MessageSchema),

  maxOutputTokens: z.number().optional(),
  temperature: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  presencePenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  responseFormat: z
    .union([
      z.object({
        type: z.literal('text'),
      }),
      z.object({
        type: z.literal('json'),
        schema: jsonSchema7Schema.optional(),
        name: z.string().optional(),
        description: z.string().optional(),
      }),
    ])
    .optional(),
  seed: z.number().optional(),
  tools: z
    .array(
      z.union([
        languageModelV2FunctionToolSchema,
        languageModelV2ProviderDefinedToolSchema,
      ]),
    )
    .optional(),
  toolChoice: languageModelV2ToolChoiceSchema.optional(),
  includeRawChunks: z.boolean().optional(),

  headers: z.record(z.string(), z.string().or(z.undefined())).optional(),

  providerOptions: sharedV2ProviderOptionsSchema.optional(),

  payerOrganizationId: z.string().optional(),
})

export async function GET(c: Context): Promise<Response> {
  const modelId = c.req.query('modelId')
  if (!modelId) {
    return new Response('`modelId` is required', {
      status: 400,
    })
  }

  const model = getModel(modelId, 'language')

  const {
    // eslint-disable-next-line @typescript-eslint/unbound-method,@typescript-eslint/no-unused-vars
    doGenerate,
    // eslint-disable-next-line @typescript-eslint/unbound-method,@typescript-eslint/no-unused-vars
    doStream,
    supportedUrls,
    ...modelConfig
  } = model

  return Response.json({
    ...modelConfig,
    supportedUrls: Object.entries(await supportedUrls).map(([mediaType, regexArray]) => [
      mediaType,
      regexArray.map((regex) => regex.toString()),
    ]),
  })
}

export async function POST(c: Context): Promise<Response> {
  try {
    const validatedArgs = requestArgsSchema.safeParse(await c.req.json())
    if (!validatedArgs.success) {
      return new Response(z.prettifyError(validatedArgs.error), { status: 400 })
    }

    const {
      modelId,
      stream: isStream,
      payerOrganizationId,
      ...languageModelV2CallOptions
    } = validatedArgs.data

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
          'langfuse.trace.name': 'Chat Generate',
          'langfuse.user.id': authId(auth.auth!),
        },
      }),
      tracer,
      fn: async () => await findProvidersByModel(auth.auth!, modelId, 'language'),
    })
    log.info(
      `Input model id: ${modelId}, resolved model ids: ${models.map((m) => m.id).join(', ')}`,
    )
    if (!models.length) {
      return new Response('Model not found', {
        status: 400,
      })
    }

    // Process with model and key polling
    return await processWithPolling({
      models,
      languageModelV2CallOptions,
      expenseManager,
      auth: auth.auth!,
      isStream,
      c,
      telemetry,
      tracer,
    })
  } catch (error: any) {
    log.error('Call language model error', error)
    return Response.json(
      {
        error: error.message ?? 'An unknown error occurred',
      },
      { status: 500 },
    )
  } finally {
    c.executionCtx.waitUntil(langfuseSpanProcessor.forceFlush())
  }
}

async function processWithPolling({
  models,
  languageModelV2CallOptions,
  expenseManager,
  auth,
  isStream,
  c,
  telemetry,
  tracer,
}: {
  models: Awaited<ReturnType<typeof findProvidersByModel>>
  languageModelV2CallOptions: Omit<
    z.infer<typeof requestArgsSchema>,
    'modelId' | 'stream' | 'payerOrganizationId'
  >
  expenseManager: ExpenseManager
  auth: AuthObject
  isStream: boolean
  c: Context
  telemetry: TelemetrySettings
  tracer: Tracer
}): Promise<Response> {
  let responseStream: ReadableStream | undefined
  let closeStream: (() => Promise<void>) | undefined
  let writeChunk: ((data: any) => Promise<void>) | undefined

  if (isStream) {
    // Create a TransformStream to convert LanguageModelV2StreamPart to SSE format
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    responseStream = readable

    let closed = false
    closeStream = async () => {
      if (closed) {
        return
      }
      closed = true
      await writer.close()
    }

    // Helper function to write data to the stream
    writeChunk = async (data: any) => {
      if (closed) {
        return
      }
      // SSE format
      await writer.write(`data: ${JSON.stringify(data)}\n\n`)
    }
  }

  async function process() {
    let lastError: Error | undefined

    for (const modelInfo of models) {
      const modelId = modelInfo.id

      const keyManager = await recordSpan({
        name: 'findAPIKeysByProvider',
        attributes: {},
        tracer,
        fn: async () => {
          return await ProviderKeyManager.from({
            auth,
            modelId,
            onlyByok: !modelInfo.chargeable,
            waitUntil: waitUntil(c),
          })
        },
      })

      const keys = keyManager.selectKeys()

      for (const key of keys) {
        log.info(`Using provider key ${key.id} for model ${modelId}`)

        const callOptions = {
          ...languageModelV2CallOptions,
          abortSignal: c.req.raw.signal,
        }

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
                type: 'language',
                ...modelInfo,
              },
              {
                type: 'language',
                ...callOptions,
              },
              key.byok,
            )
          },
        })

        const {
          prompt: _a,
          responseFormat: _b,
          tools: _c,
          abortSignal: _d,
          headers: _e,
          responseFormat: _f,
          ...callOptions_
        } = callOptions
        const details: LanguageGenerationDetails = {
          modelId,
          byok: key.byok,
          latency: 0,
          generationTime: 0,

          type: 'language' as const,
          callOptions: {
            ...callOptions_,
            responseFormat: callOptions.responseFormat?.type,
          },
          stream: !!isStream,
          finishReason: 'stop',
          usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
          warnings: [],
        }

        const customFetch = createCustomFetch({
          onLatency: (latency) => {
            details.latency = latency
          },
        })

        const model = getModel(modelId, 'language', key.key, customFetch)

        const result = await recordSpan({
          name: !isStream ? 'ai.doGenerate' : 'ai.doStream',
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {
              'gen_ai.operation.name': 'chat',
              'gen_ai.provider.name': model.provider,
              'gen_ai.request.model': model.modelId,
              'gen_ai.request.seed': callOptions.seed,
              'gen_ai.request.frequency_penalty': callOptions.frequencyPenalty,
              'gen_ai.request.max_tokens': callOptions.maxOutputTokens,
              'gen_ai.request.presence_penalty': callOptions.presencePenalty,
              'gen_ai.request.stop_sequences': callOptions.stopSequences,
              'gen_ai.request.temperature': callOptions.temperature,
              'gen_ai.request.top_k': callOptions.topK,
              'gen_ai.request.top_p': callOptions.topP,
              'gen_ai.output.type': callOptions.responseFormat?.type === 'json' ? 'json' : 'text',
              'langfuse.observation.type': 'generation',
              'langfuse.trace.input': { input: () => stringifyForTelemetry(callOptions.prompt) },
              'langfuse.observation.input': {
                input: () => stringifyForTelemetry(callOptions.prompt),
              },
            },
          }),
          tracer,
          fn: async (span) => {
            if (!isStream) {
              try {
                return await doGenerate({
                  model,
                  callOptions,
                  details,
                  telemetry,
                  span,
                })
              } catch (error: unknown) {
                lastError = error instanceof Error ? error : new Error(String(error))
                recordErrorOnSpan(span, error)
                if (handleError(keyManager, key, error, details)) {
                  return false
                } else {
                  keyManager.saveState()
                  throw error
                }
              }
            } else {
              assert(writeChunk)
              assert(closeStream)

              try {
                await doStream({
                  model,
                  callOptions,
                  writeChunk,
                  details,
                  telemetry,
                  span,
                })
              } catch (error: unknown) {
                lastError = error instanceof Error ? error : new Error(String(error))
                recordErrorOnSpan(span, error)
                if (handleError(keyManager, key, error, details)) {
                  return false
                } else {
                  keyManager.saveState()
                  throw error
                }
              }

              await closeStream()
            }
          },
        })

        if (result === false) {
          // Try the next model/key if available
          continue
        }

        expenseManager.billGeneration(
          {
            type: 'language',
            ...modelInfo,
          },
          details,
        )

        keyManager.updateState(key, {
          success: true,
          latency: details.latency,
        })

        keyManager.saveState()

        return result
      }

      keyManager.saveState()
    }

    if (lastError) {
      throw lastError
    }

    if (!isStream) {
      return new Response('Model not found', {
        status: 400,
      })
    } else {
      assert(writeChunk)
      assert(closeStream)

      await writeChunk({
        error: {
          message: 'Model not found',
        },
      })
      await closeStream()
    }
  }

  if (!isStream) {
    return (await process())!
  } else {
    // Processing the stream asynchronously
    assert(writeChunk)
    assert(closeStream)
    void process()
      .catch(async (error) => {
        const errorChunk = {
          type: 'error',
          // Serialize error to ensure it can be properly transferred across the network
          error: error instanceof Error ? serializeError(error) : JSON.stringify(error),
          errorSerialized: error instanceof Error,
        }
        await writeChunk(errorChunk)
        await closeStream()
      })
      .finally(() => {
        c.executionCtx.waitUntil(langfuseSpanProcessor.forceFlush())
      })

    // Return the streaming response
    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }
}

async function doGenerate({
  model,
  callOptions,
  details,
  telemetry,
  span,
}: {
  model: LanguageModelV2
  callOptions: LanguageModelV2CallOptions
  details: LanguageGenerationDetails
  telemetry: TelemetrySettings
  span: Span
}): Promise<Response> {
  const startTime = performance.now()
  const gen = await model.doGenerate(callOptions)

  details.generationTime = Math.max(Math.floor(performance.now() - startTime - details.latency), 0)
  details.finishReason = gen.finishReason
  details.usage = gen.usage
  details.providerMetadata = gen.providerMetadata
  const { headers: _, body: __, ...responseMetadata } = gen.response ?? {}
  details.responseMetadata = gen.response ? responseMetadata : undefined
  details.warnings = gen.warnings

  const textContent = extractTextContent(gen.content)
  const toolCalls = asToolCalls(gen.content)

  span.setAttributes(
    selectTelemetryAttributes({
      telemetry,
      attributes: {
        'gen_ai.response.finish_reasons': [gen.finishReason],
        'gen_ai.response.id': responseMetadata.id,
        'gen_ai.response.model': responseMetadata.modelId,
        'gen_ai.usage.input_tokens': gen.usage.inputTokens,
        'gen_ai.usage.output_tokens': gen.usage.outputTokens,
        'langfuse.trace.output': { output: () => textContent },
        'langfuse.observation.output': {
          output: () => textContent || (toolCalls?.length ? JSON.stringify(toolCalls) : undefined),
        },
        'langfuse.observation.completion_start_time': JSON.stringify(new Date().toISOString()),
      },
    }),
  )

  return Response.json(gen)
}

async function doStream({
  model,
  callOptions,
  writeChunk: writeChunk_,
  details,
  telemetry,
  span,
}: {
  model: LanguageModelV2
  callOptions: LanguageModelV2CallOptions
  writeChunk: (data: any) => Promise<void>
  details: LanguageGenerationDetails
  telemetry: TelemetrySettings
  span: Span
}): Promise<void> {
  const startTime = performance.now()
  let latencyTime: number | undefined
  let latencyDate!: Date

  const { stream, ...metadata } = await model.doStream(callOptions)

  const reader = stream.getReader()

  let hasWritten = false
  const writeChunk = async (data: any) => {
    hasWritten = true
    await writeChunk_(data)
  }

  let firstChunk = true

  let activeText = ''
  const stepToolCalls: any[] = []

  while (true) {
    const { value: part, done } = await reader.read()

    if (firstChunk) {
      firstChunk = false

      latencyTime = performance.now() - startTime
      latencyDate = new Date()
      details.latency = Math.floor(latencyTime)

      if (part?.type !== 'error') {
        // @ts-expect-error: type 'metadata' must not be in LanguageModelV2StreamPart
        const _: LanguageModelV2StreamPart['type'] = 'metadata'

        // Only send metadata when we received the first chunk
        await writeChunk({
          type: 'metadata',
          ...metadata,
        })
      }
    }

    if (done) {
      details.generationTime = Math.max(
        Math.floor(performance.now() - startTime - (latencyTime ?? 0)),
        0,
      )

      span.setAttributes(
        selectTelemetryAttributes({
          telemetry,
          attributes: {
            'gen_ai.response.finish_reasons': [details.finishReason],
            'gen_ai.response.id': details.responseMetadata?.id,
            'gen_ai.response.model': details.responseMetadata?.modelId,
            'gen_ai.usage.input_tokens': details.usage.inputTokens,
            'gen_ai.usage.output_tokens': details.usage.outputTokens,
            'langfuse.trace.output': { output: () => activeText },
            'langfuse.observation.output': {
              output: () =>
                activeText ||
                (stepToolCalls.length > 0 ? JSON.stringify(stepToolCalls) : undefined),
            },
            'langfuse.observation.completion_start_time': JSON.stringify(latencyDate.toISOString()),
          },
        }),
      )

      break
    }

    // Process different types of stream parts
    switch (part.type) {
      case 'stream-start': {
        details.warnings = part.warnings
        break
      }
      case 'response-metadata': {
        const { type: _, ...responseMetadata } = part
        details.responseMetadata = responseMetadata
        break
      }
      case 'text-delta': {
        activeText += part.delta
        break
      }
      case 'tool-call': {
        const { toolCallId, toolName, input, providerExecuted } = part
        stepToolCalls.push({
          toolCallId,
          toolName,
          input,
          providerExecuted,
        })
        break
      }
      case 'error': {
        // Only throw error if we haven't written anything yet
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!hasWritten && APICallError.isInstance(part.error)) {
          const statusCode = part.error.statusCode
          if (
            // unauthorized
            statusCode === 401 ||
            // forbidden
            statusCode === 403 ||
            // request timeout
            statusCode === 408 ||
            // too many requests
            statusCode === 429 ||
            // server error
            (statusCode && statusCode >= 500)
          ) {
            throw part.error
          }
        }

        if (part.error instanceof Error) {
          // Serialize error to ensure it can be properly transferred across the network
          part.error = serializeError(part.error)
          ;(part as Record<string, unknown>).errorSerialized = true
        }

        break
      }
      case 'finish': {
        details.finishReason = part.finishReason
        details.usage = part.usage
        details.providerMetadata = part.providerMetadata
        break
      }
    }

    await writeChunk(part)
  }
}

export function handleError(
  keyManager: ProviderKeyManager,
  key: ProviderKeyState,
  error: unknown,
  details: {
    latency: number
  },
) {
  if (APICallError.isInstance(error)) {
    const statusCode = error.statusCode

    keyManager.updateState(key, {
      success: false,
      latency: details.latency,
      retryAfter:
        statusCode === 429
          ? (error.responseHeaders?.['Retry-After'] ?? error.responseHeaders?.['X-Retry-After'])
          : undefined,
    })

    if (
      // unauthorized
      statusCode === 401 ||
      // forbidden
      statusCode === 403 ||
      // request timeout
      statusCode === 408 ||
      // too many requests
      statusCode === 429 ||
      // server error
      (statusCode && statusCode >= 500)
    ) {
      return true
    }
  } else {
    keyManager.updateState(key, {
      success: false,
      latency: details.latency,
    })
  }

  return false
}

export function authId(auth: AuthObject) {
  switch (auth.type) {
    case 'user':
    case 'appUser':
      return auth.userId
    case 'apiKey':
      switch (auth.scope) {
        case 'user':
          return auth.userId
        case 'organization':
          return auth.organizationId
        case 'workspace':
          return auth.workspaceId
        case 'app':
          return auth.appId
      }
  }
}
