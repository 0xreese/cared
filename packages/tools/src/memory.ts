import { tool } from 'ai'
import { z } from 'zod/v4'

import { and, eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { Agent, AgentVersion, App, AppVersion, Chat, DRAFT_VERSION, Memory } from '@cared/db/schema'
import { getTextEmbeddingDimensions } from '@cared/providers'
import { embed } from '@cared/providers/embed'
import { CohereReranker } from '@cared/providers/rerank'
import { QdrantVector } from '@cared/vdb'

import type { Context } from './context'

/**
 * Get the embedding model based on scope priority:
 * - For 'app' scope: Agent > App
 * - For 'chat' scope: Chat > Agent > App
 */
async function getEmbeddingModel(ctx: Context, scope: 'chat' | 'app') {
  // Get chat info if needed for chat scope
  const chat =
    scope === 'chat'
      ? await getDb().query.Chat.findFirst({
          where: eq(Chat.id, ctx.chatId),
        })
      : null

  if (scope === 'chat' && chat?.metadata.embeddingModel) {
    return chat.metadata.embeddingModel
  }

  // Get agent info
  const agent = ctx.preview
    ? await getDb().query.AgentVersion.findFirst({
        where: and(eq(AgentVersion.agentId, ctx.agentId), eq(AgentVersion.version, DRAFT_VERSION)),
      })
    : await getDb().query.Agent.findFirst({
        where: eq(Agent.id, ctx.agentId),
      })

  if (agent?.metadata.embeddingModel) {
    return agent.metadata.embeddingModel
  }

  // Get app info
  const app = ctx.preview
    ? await getDb().query.AppVersion.findFirst({
        where: and(eq(AppVersion.appId, ctx.appId), eq(AppVersion.version, DRAFT_VERSION)),
      })
    : await getDb().query.App.findFirst({
        where: eq(App.id, ctx.appId),
      })

  return app?.metadata.embeddingModel
}

function storeMemory(ctx: Context) {
  return tool({
    description:
      'Store a new memory into the long-term memory database. This tool allows you to save important information or knowledge about the user, which can be retrieved later. If the user provides a random piece of knowledge unprompted, use this tool without asking for confirmation.',
    inputSchema: z.object({
      content: z.string().describe('The memory content to add to the long-term memory database'),
      scope: z
        .enum(['chat', 'app'])
        .describe(
          'The scope of the memory. Use "chat" for conversation-specific memories that are only relevant to the current chat. Use "app" for memories that should be accessible across all chats within the same app.',
        ),
    }),
    execute: async ({ content, scope }) => {
      const embeddingModel = await getEmbeddingModel(ctx, scope)
      if (!embeddingModel) {
        return
      }

      const dimensions = await getTextEmbeddingDimensions(embeddingModel)
      if (!dimensions) {
        return
      }

      const id = (
        await getDb()
          .insert(Memory)
          .values({
            userId: ctx.userId,
            appId: ctx.appId,
            chatId: scope === 'chat' ? ctx.chatId : undefined,
            content,
          })
          .returning()
      ).at(0)?.id
      if (!id) {
        return
      }

      const embedding = await embed(content, embeddingModel)

      const vdb = new QdrantVector(dimensions)
      await vdb.insertMemories({
        id,
        content,
        embedding,
        metadata: {
          userId: ctx.userId,
          appId: ctx.appId,
          chatId: scope === 'chat' ? ctx.chatId : undefined,
          scope,
        },
      })
    },
  })
}

function retrieveMemory(ctx: Context) {
  return tool({
    description:
      'Retrieve memories from the long-term memory database based on specified criteria. You can search for memories associated with the user. This tool helps you access previously stored information to maintain context and provide more relevant responses.',
    inputSchema: z.object({
      query: z.string().describe('The query to search for in the long-term memory database'),
      scope: z
        .enum(['chat', 'app'])
        .describe(
          'The scope of memories to search. Use "chat" to only search memories from current chat, "app" to search both app-scoped memories and chat-scoped memories.',
        ),
    }),
    execute: async ({ query, scope }) => {
      const embeddingModel = await getEmbeddingModel(ctx, scope)
      if (!embeddingModel) {
        return []
      }

      const dimensions = await getTextEmbeddingDimensions(embeddingModel)
      if (!dimensions) {
        return []
      }

      const embedding = await embed(query, embeddingModel)

      const vdb = new QdrantVector(dimensions)

      const filter = {
        userId: ctx.userId,
        appId: ctx.appId,
        chatId: scope === 'chat' ? ctx.chatId : undefined,
      }

      const memories = await vdb.searchMemoriesByEmbedding(embedding, filter)
      const reranker = new CohereReranker()
      const result = await reranker.rerank(
        query,
        memories.map((memory) => memory.content),
      )
      return result.documents
    },
  })
}

export const memoryTools = {
  storeMemory,
  retrieveMemory,
}
