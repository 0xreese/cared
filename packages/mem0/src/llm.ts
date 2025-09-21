import type { LLM, LLMResponse, Message } from 'mem0ai/oss'
import { generateText } from 'ai'

import { getModel } from '@cared/providers/providers'

import type { LanguageModelV2 } from '@ai-sdk/provider'

export class CaredLLM implements LLM {
  private constructor(private model: LanguageModelV2) {}

  static create(fullModelId: string) {
    const model = getModel(fullModelId, 'language')
    return new CaredLLM(model)
  }

  async generateResponse(
    llmMessages: Message[],
    responseFormat?: { type: string },
    llmTools?: any[],
  ): Promise<string | LLMResponse> {
    const messages = llmMessages.map((msg) => {
      const role = msg.role as 'system' | 'user' | 'assistant'
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (role === 'user' && typeof msg.content === 'object' && msg.content.type === 'image_url') {
        return {
          role,
          content: [
            {
              type: 'image' as const,
              image: msg.content.image_url.url,
            },
          ],
        }
      }
      return {
        role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      }
    })

    const tools = llmTools?.length
      ? Object.fromEntries(
          llmTools.map((tool) => [
            tool.function.name,
            {
              description: tool.function.description,
              parameters: tool.function.parameters,
            },
          ]),
        )
      : undefined

    const response = await generateText({
      model: this.model,
      messages,
      tools,
      toolChoice: tools ? 'auto' : undefined,
    })

    if (response.toolCalls.length) {
      return {
        content: response.text,
        role: 'assistant',
        toolCalls: response.toolCalls.map((call) => ({
          name: call.toolName,
          arguments: typeof call.input === 'string' ? call.input : JSON.stringify(call.input),
        })),
      }
    } else {
      return response.text
    }
  }

  async generateChat(messages: Message[]): Promise<LLMResponse> {
    const response = await this.generateResponse(messages)
    return typeof response === 'string'
      ? {
          content: response,
          role: 'assistant',
        }
      : response
  }
}
