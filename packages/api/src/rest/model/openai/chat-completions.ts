import assert from 'assert'
import type { Context } from 'hono'
import type { OpenAI } from 'openai'
import { APICallError } from '@ai-sdk/provider'
import { z } from 'zod/v4'

import type { LanguageGenerationDetails } from '@cared/providers'
import log from '@cared/log'
import { createCustomJsonFetch, splitModelFullId } from '@cared/providers'
import { getModel } from '@cared/providers/providers'
import { generateId } from '@cared/shared'

import type { TelemetrySettings } from '../../../telemetry'
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2FinishReason,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
} from '@ai-sdk/provider'
import type { Span } from '@opentelemetry/api'
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
import { waitUntil } from '../../../utils'
import { authId, handleError, jsonSchema7Schema } from '../ai/language'
import {
  ChatCompletionContentPartTextSchema,
  ChatCompletionMessageSchema,
  convertToLanguageModelV2Messages,
} from './chat-prompt'

const ChatCompletionRequestArgsSchema = z.object({
  messages: z.array(ChatCompletionMessageSchema),
  model: z.string(),
  frequency_penalty: z.number().min(-2).max(2).nullish(),
  function_call: z
    .union([
      z.enum(['none', 'auto']),
      z.object({
        name: z.string(),
      }),
    ])
    .optional(),
  functions: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        parameters: jsonSchema7Schema.optional(),
      }),
    )
    .optional(),
  logit_bias: z.record(z.coerce.number<string>(), z.number()).optional(),
  logprobs: z.boolean().nullish(),
  max_completion_tokens: z.int().nullish(),
  max_tokens: z.int().nullish(),
  metadata: z.record(z.string().max(64), z.string().max(512)).optional(),
  modalities: z.array(z.string()).optional(),
  n: z.int().optional(),
  parallel_tool_calls: z.boolean().optional(),
  prediction: z
    .object({
      type: z.literal('content'),
      content: z.union([z.string(), ChatCompletionContentPartTextSchema]),
    })
    .optional(),
  presence_penalty: z.number().min(-2).max(2).nullish(),
  prompt_cache_key: z.string().optional(),
  reasoning_effort: z.enum(['low', 'medium', 'high']).nullish(),
  response_format: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal('text'),
      }),
      z.object({
        type: z.literal('json_schema'),
        json_schema: z.object({
          name: z.string(),
          description: z.string().optional(),
          schema: jsonSchema7Schema,
          strict: z.boolean().nullish(),
        }),
      }),
      z.object({
        type: z.literal('json_object'),
      }),
    ])
    .optional(),
  safety_identifier: z.string().optional(),
  seed: z.int().optional(),
  service_tier: z.enum(['auto', 'default', 'flex', 'priority']).nullish(),
  stop: z.union([z.string(), z.array(z.string())]).nullish(),
  stream: z.boolean().nullish(),
  stream_options: z
    .object({
      include_obfuscation: z.boolean().optional(),
      include_usage: z.boolean().optional(),
    })
    .nullish(),
  temperature: z.number().min(0).max(2).nullish(),
  tool_choice: z
    .union([
      z.enum(['none', 'auto', 'required']),
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('allowed_tools'),
          allowed_tools: z.object({
            mode: z.enum(['auto', 'required']),
            tools: z.array(
              z.object({
                type: z.literal('function'),
                function: z.object({
                  name: z.string(),
                }),
              }),
            ),
          }),
        }),
        z.object({
          type: z.literal('function'),
          function: z.object({
            name: z.string(),
          }),
        }),
      ]),
    ])
    .optional(),
  tools: z
    .array(
      z.object({
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          description: z.string().optional(),
          parameters: jsonSchema7Schema,
          strict: z.boolean().nullish(),
        }),
      }),
    )
    .optional(),
  top_logprobs: z.int().min(0).max(20).nullish(),
  top_p: z.number().min(0).max(1).nullish(),
  user: z.string().optional(),
  verbosity: z.enum(['low', 'medium', 'high']).optional(),
  web_search_options: z
    .object({
      search_context_size: z.enum(['low', 'medium', 'high']).optional(),
      user_location: z.object({
        type: z.literal('approximate'),
        approximate: z.object({
          city: z.string().optional(),
          country: z.string().optional(),
          region: z.string().optional(),
          timezone: z.string().optional(),
        }),
      }),
    })
    .optional(),

  payerOrganizationId: z.string().optional(),
})

export async function POST(c: Context): Promise<Response> {
  try {
    const validatedArgs = ChatCompletionRequestArgsSchema.safeParse(await c.req.json())
    if (!validatedArgs.success) {
      return new Response(z.prettifyError(validatedArgs.error), { status: 400 })
    }

    const { model: modelId, stream: isStream, payerOrganizationId, ...args } = validatedArgs.data

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
          'langfuse.trace.name': 'Chat Generate (OpenAI Compatible)',
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

    let responseStream,
      closeStream: (() => Promise<void>) | undefined,
      writeChunk: ((data: any, notJson?: boolean) => Promise<void>) | undefined

    if (isStream) {
      // Create a TransformStream to convert LanguageModelV2StreamPart to OpenAI streaming format
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
      writeChunk = async (data: any, notJson?: boolean) => {
        if (closed) {
          return
        }
        // SSE format
        await writer.write(`data: ${!notJson ? JSON.stringify(data) : data}\n\n`)
      }
    }

    async function process() {
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

          const callOptions = buildCallOptions({
            args,
            providerId,
            signal: c.req.raw.signal,
          })

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

            type: 'language',
            callOptions: {
              ...callOptions_,
              responseFormat: callOptions.responseFormat?.type,
            },
            stream: !!isStream,
            finishReason: 'stop',
            usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
            warnings: [],
          }

          const customFetch = createCustomJsonFetch({
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
                    providerId,
                    modelId,
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
                    providerId,
                    modelId,
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
          console.error(error)
          const errorChunk = {
            error: {
              message: APICallError.isInstance(error)
                ? error.message + '\n' + error.responseBody
                : error instanceof Error
                  ? error.message
                  : JSON.stringify(error),
            },
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
  } finally {
    c.executionCtx.waitUntil(langfuseSpanProcessor.forceFlush())
  }
}

function buildCallOptions({
  args,
  providerId,
  signal,
}: {
  args: Omit<z.infer<typeof ChatCompletionRequestArgsSchema>, 'model' | 'stream'>
  providerId: string
  signal: AbortSignal
}) {
  const callOptions: LanguageModelV2CallOptions = {
    prompt: convertToLanguageModelV2Messages(args.messages),
    maxOutputTokens: args.max_completion_tokens ?? args.max_tokens ?? undefined,
    temperature: args.temperature ?? undefined,
    stopSequences: args.stop ? (Array.isArray(args.stop) ? args.stop : [args.stop]) : undefined,
    topP: args.top_p ?? undefined,
    presencePenalty: args.presence_penalty ?? undefined,
    frequencyPenalty: args.frequency_penalty ?? undefined,
    responseFormat:
      !args.response_format || args.response_format.type === 'text'
        ? { type: 'text' }
        : {
            type: 'json',
            ...(args.response_format.type === 'json_schema' && {
              schema: args.response_format.json_schema.schema,
              name: args.response_format.json_schema.name,
              description: args.response_format.json_schema.description,
            }),
          },
    seed: args.seed ?? undefined,
    tools: args.tools?.map((tool) => ({
      type: 'function',
      name: tool.function.name,
      description: tool.function.description,
      inputSchema: tool.function.parameters,
    })),
    toolChoice: args.tool_choice
      ? args.tool_choice === 'none' ||
        args.tool_choice === 'auto' ||
        args.tool_choice === 'required'
        ? { type: args.tool_choice }
        : args.tool_choice.type === 'function'
          ? { type: 'tool', toolName: args.tool_choice.function.name }
          : {
              type: args.tool_choice.allowed_tools.mode,
            }
      : undefined,
    abortSignal: signal,
    providerOptions: {
      [providerId]: {
        ...(args.logit_bias && { logitBias: args.logit_bias }),
        ...((typeof args.top_logprobs === 'number' || args.logprobs) && {
          logprobs: typeof args.top_logprobs === 'number' ? args.top_logprobs : true,
        }),
        ...(args.user && { user: args.user }),
        ...(args.parallel_tool_calls && { parallelToolCalls: args.parallel_tool_calls }),
        ...(args.reasoning_effort && { reasoningEffort: args.reasoning_effort }),
        ...(args.response_format?.type === 'json_schema' && { structuredOutputs: true }),
        ...(args.service_tier && { serviceTier: args.service_tier }),
        ...(args.response_format?.type === 'json_schema' &&
          args.response_format.json_schema.strict && { strictJsonSchema: true }),
      },
    },
  }
  return callOptions
}

async function doGenerate({
  model,
  callOptions,
  providerId,
  modelId,
  details,
  telemetry,
  span,
}: {
  model: LanguageModelV2
  callOptions: LanguageModelV2CallOptions
  providerId: string
  modelId: string
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

  const content = gen.content.find((part) => part.type === 'text')?.text ?? null
  const toolCalls = gen.content
    .filter((part) => part.type === 'tool-call')
    .map((part) => ({
      type: 'function' as const,
      id: part.toolCallId,
      function: {
        name: part.toolName,
        arguments: part.input,
      },
    }))

  const textContent = extractTextContent(gen.content)
  const toolCalls_ = asToolCalls(gen.content)

  const rawResponse: any = gen.response?.body
  const logprobs =
    gen.providerMetadata?.[providerId]?.logprobs ?? rawResponse?.choices?.at(0)?.logprobs?.content

  const finishReason = chatCompletionsFinishReason(gen.finishReason)

  span.setAttributes(
    selectTelemetryAttributes({
      telemetry,
      attributes: {
        'gen_ai.response.finish_reasons': [gen.finishReason],
        'gen_ai.response.id': gen.response?.id,
        'gen_ai.response.model': responseMetadata.modelId,
        'gen_ai.usage.input_tokens': gen.usage.inputTokens,
        'gen_ai.usage.output_tokens': gen.usage.outputTokens,
        'langfuse.trace.output': { output: () => textContent },
        'langfuse.observation.output': {
          output: () =>
            textContent || (toolCalls_?.length ? JSON.stringify(toolCalls_) : undefined),
        },
        'langfuse.observation.completion_start_time': JSON.stringify(new Date().toISOString()),
      },
    }),
  )

  const response: OpenAI.ChatCompletion = {
    id: gen.response?.id ?? generateId('chatcmpl', '-'),
    created: Math.floor(+(gen.response?.timestamp ?? new Date()) / 1000),
    model: modelId,
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          tool_calls: toolCalls,
          refusal: null,
          annotations: [],
          audio: null,
        },
        logprobs: logprobs
          ? {
              content: logprobs,
              refusal: null,
            }
          : null,
        finish_reason: finishReason,
      },
    ],
    usage: chatCompletionsUsage(gen.usage, providerId, gen.providerMetadata, rawResponse?.usage),
    service_tier: rawResponse?.service_tier,
    system_fingerprint: rawResponse?.system_fingerprint,
  }

  return Response.json({
    ...response,
    warnings: gen.warnings,
  })
}

async function doStream({
  model,
  callOptions,
  providerId,
  modelId,
  writeChunk: writeChunk_,
  details,
  telemetry,
  span,
}: {
  model: LanguageModelV2
  callOptions: LanguageModelV2CallOptions
  providerId: string
  modelId: string
  writeChunk: (data: any, notJson?: boolean) => Promise<void>
  details: LanguageGenerationDetails
  telemetry: TelemetrySettings
  span: Span
}) {
  const startTime = performance.now()
  let latencyTime: number | undefined
  let latencyDate!: Date

  const { stream } = await model.doStream(callOptions)

  // Process the stream and convert to OpenAI format
  const reader = stream.getReader()

  // Track state for building the response
  let responseMeta: Pick<OpenAI.ChatCompletionChunk, 'id' | 'model' | 'created' | 'object'> =
    {} as any
  const toolCallIndices = new Map<string, number>()

  let hasWritten = false
  const writeChunk = async (data: any, notJson = false) => {
    hasWritten = true
    await writeChunk_(data, notJson)
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

      await writeChunk('[DONE]', true)
      break
    }

    // Process different types of stream parts
    switch (part.type) {
      case 'stream-start': {
        const chunk = {
          ...responseMeta,
          choices: [],
          warnings: part.warnings,
        }
        await writeChunk(chunk)

        details.warnings = part.warnings

        break
      }

      case 'response-metadata': {
        responseMeta = {
          id: part.id ?? generateId('chatcmpl', '-'),
          created: Math.floor(+(part.timestamp ?? new Date()) / 1000),
          model: modelId,
          object: 'chat.completion.chunk',
        }

        const { type: _, ...responseMetadata } = part
        details.responseMetadata = responseMetadata
        break
      }

      case 'text-start': {
        // Nothing
        break
      }

      case 'text-delta':
        if (part.delta) {
          const chunk: OpenAI.ChatCompletionChunk = {
            ...responseMeta,
            choices: [
              {
                index: 0,
                delta: { content: part.delta, role: 'assistant' },
                finish_reason: null,
              },
            ],
          }
          await writeChunk(chunk)

          activeText += part.delta
        }
        break

      case 'text-end':
        break

      case 'reasoning-start':
        break

      case 'reasoning-delta':
        break

      case 'reasoning-end':
        break

      case 'tool-input-start': {
        if (toolCallIndices.has(part.id)) {
          continue
        }
        const index = toolCallIndices.size
        toolCallIndices.set(part.id, index)

        const chunk: OpenAI.ChatCompletionChunk = {
          ...responseMeta,
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index,
                    id: part.id,
                    type: 'function',
                    function: {
                      name: part.toolName,
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        }
        await writeChunk(chunk)

        break
      }

      case 'tool-input-delta': {
        const index = toolCallIndices.get(part.id)
        if (index === undefined) {
          continue
        }

        const chunk: OpenAI.ChatCompletionChunk = {
          ...responseMeta,
          choices: [
            {
              index: 0,
              delta: {
                // Many of these fields are only set for the first delta of each tool call,
                // like id, function.name, and type.
                tool_calls: [
                  {
                    index,
                    id: undefined,
                    type: undefined,
                    function: {
                      name: undefined,
                      arguments: part.delta,
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        }
        await writeChunk(chunk)

        break
      }

      case 'tool-input-end':
        break

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

      case 'tool-result':
        break

      case 'file':
        break

      case 'source':
        break

      case 'raw':
        break

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
        break
      }

      case 'finish': {
        const chunk: OpenAI.ChatCompletionChunk = {
          ...responseMeta,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: chatCompletionsFinishReason(part.finishReason),
              logprobs: part.providerMetadata?.[providerId]?.logprobs as any,
            },
          ],
          usage: chatCompletionsUsage(part.usage, providerId, part.providerMetadata),
        }
        await writeChunk(chunk)

        details.finishReason = part.finishReason
        details.usage = part.usage
        details.providerMetadata = part.providerMetadata

        break
      }
    }
  }
}

function chatCompletionsFinishReason(finishReason: LanguageModelV2FinishReason) {
  switch (finishReason) {
    case 'stop':
      return 'stop'
    case 'length':
      return 'length'
    case 'content-filter':
      return 'content_filter'
    case 'tool-calls':
      return 'tool_calls'
  }
  return 'stop'
}

function chatCompletionsUsage(
  usage: LanguageModelV2Usage,
  providerId: string,
  providerMetadata?: SharedV2ProviderMetadata,
  rawUsage?: any,
): OpenAI.ChatCompletion['usage'] {
  return {
    prompt_tokens: usage.inputTokens ?? 0,
    completion_tokens: usage.outputTokens ?? 0,
    total_tokens: usage.totalTokens ?? 0,
    completion_tokens_details: {
      reasoning_tokens: usage.reasoningTokens ?? 0,
      accepted_prediction_tokens: (providerMetadata?.[providerId]?.acceptedPredictionTokens ??
        rawUsage?.completion_tokens_details?.accepted_prediction_tokens ??
        0) as number,
      rejected_prediction_tokens: (providerMetadata?.[providerId]?.rejectedPredictionTokens ??
        rawUsage?.completion_tokens_details?.rejected_prediction_tokens ??
        0) as number,
      audio_tokens: rawUsage?.completion_tokens_details?.audio_tokens ?? 0,
    },
    prompt_tokens_details: {
      cached_tokens: usage.cachedInputTokens ?? 0,
      audio_tokens: rawUsage?.prompt_tokens_details?.audio_tokens ?? 0,
    },
  }
}
