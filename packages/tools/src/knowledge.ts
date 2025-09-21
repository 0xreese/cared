import assert from 'assert'
import { tool } from 'ai'
import { z } from 'zod/v4'

import type { AgentMetadata, AppMetadata } from '@cared/db/schema'
import type { Document } from '@cared/vdb'
import { and, desc, eq, inArray, not } from '@cared/db'
import { getDb } from '@cared/db/client'
import {
  Agent,
  AgentVersion,
  App,
  AppVersion,
  Dataset,
  DocumentChunk,
  DocumentSegment,
  DRAFT_VERSION,
} from '@cared/db/schema'
import { getTextEmbeddingDimensions } from '@cared/providers'
import { embed } from '@cared/providers/embed'
import { CohereReranker } from '@cared/providers/rerank'
import { QdrantVector } from '@cared/vdb'

import type { Context } from './context'

async function updateMetadataBindings(
  scope: 'app' | 'agent',
  ctx: Context,
  metadata: AppMetadata | AgentMetadata,
) {
  if (scope === 'app') {
    if (!ctx.preview) {
      // In non-preview mode, update both main record and latest published version
      await getDb()
        .update(App)
        .set({ metadata: metadata as AppMetadata })
        .where(eq(App.id, ctx.appId))

      const latestVersion = await getDb().query.AppVersion.findFirst({
        where: and(eq(AppVersion.appId, ctx.appId), not(eq(AppVersion.version, DRAFT_VERSION))),
        orderBy: desc(AppVersion.version),
      })
      assert(latestVersion, 'No published version found for app')
      await getDb()
        .update(AppVersion)
        .set({ metadata: metadata as AppMetadata })
        .where(and(eq(AppVersion.appId, ctx.appId), eq(AppVersion.version, latestVersion.version)))
    } else {
      // In preview mode, update draft version
      await getDb()
        .update(AppVersion)
        .set({ metadata: metadata as AppMetadata })
        .where(and(eq(AppVersion.appId, ctx.appId), eq(AppVersion.version, DRAFT_VERSION)))

      // If no published version exists, also update main record
      const hasPublishedVersion = await getDb().query.AppVersion.findFirst({
        where: and(eq(AppVersion.appId, ctx.appId), not(eq(AppVersion.version, DRAFT_VERSION))),
      })
      if (!hasPublishedVersion) {
        await getDb()
          .update(App)
          .set({ metadata: metadata as AppMetadata })
          .where(eq(App.id, ctx.appId))
      }
    }
  } else {
    if (!ctx.preview) {
      // In non-preview mode, update both main record and latest published version
      await getDb()
        .update(Agent)
        .set({ metadata: metadata as AgentMetadata })
        .where(eq(Agent.id, ctx.agentId))

      const latestVersion = await getDb().query.AgentVersion.findFirst({
        where: and(
          eq(AgentVersion.agentId, ctx.agentId),
          not(eq(AgentVersion.version, DRAFT_VERSION)),
        ),
        orderBy: desc(AgentVersion.version),
      })
      assert(latestVersion, 'No published version found for agent')
      await getDb()
        .update(AgentVersion)
        .set({ metadata: metadata as AgentMetadata })
        .where(
          and(
            eq(AgentVersion.agentId, ctx.agentId),
            eq(AgentVersion.version, latestVersion.version),
          ),
        )
    } else {
      // In preview mode, update draft version
      await getDb()
        .update(AgentVersion)
        .set({ metadata: metadata as AgentMetadata })
        .where(and(eq(AgentVersion.agentId, ctx.agentId), eq(AgentVersion.version, DRAFT_VERSION)))

      // If no published version exists, also update main record
      const hasPublishedVersion = await getDb().query.AgentVersion.findFirst({
        where: and(
          eq(AgentVersion.agentId, ctx.agentId),
          not(eq(AgentVersion.version, DRAFT_VERSION)),
        ),
      })
      if (!hasPublishedVersion) {
        await getDb()
          .update(Agent)
          .set({ metadata: metadata as AgentMetadata })
          .where(eq(Agent.id, ctx.agentId))
      }
    }
  }
}

function listKnowledgeBases(ctx: Context) {
  return tool({
    description:
      'Lists available knowledge bases with their IDs, names and descriptions. Each knowledge base contains specific domain knowledge. Use this tool to discover which knowledge base is most relevant for your current information need, then use the searchKnowledge tool with the appropriate knowledge base ID to retrieve information.',
    inputSchema: z.object({
      scope: z
        .enum(['app', 'agent'])
        .describe(
          'The scope of knowledge bases to list. Use "app" to list knowledge bases bound to the current app (for general app-wide knowledge), "agent" to list knowledge bases bound to the current agent (for agent-specific knowledge and capabilities).',
        ),
    }),
    execute: async ({ scope }) => {
      let metadata: AppMetadata | AgentMetadata | undefined

      if (scope === 'app') {
        // Get app metadata
        const app = ctx.preview
          ? await getDb().query.AppVersion.findFirst({
              where: and(eq(AppVersion.appId, ctx.appId), eq(AppVersion.version, DRAFT_VERSION)),
            })
          : await getDb().query.App.findFirst({
              where: eq(App.id, ctx.appId),
            })
        metadata = app?.metadata
      } else {
        // Get agent metadata
        const agent = ctx.preview
          ? await getDb().query.AgentVersion.findFirst({
              where: and(
                eq(AgentVersion.agentId, ctx.agentId),
                eq(AgentVersion.version, DRAFT_VERSION),
              ),
            })
          : await getDb().query.Agent.findFirst({
              where: eq(Agent.id, ctx.agentId),
            })
        metadata = agent?.metadata
      }

      const datasetIds = metadata?.datasetBindings ?? []

      if (datasetIds.length === 0) {
        return []
      }

      // Get all existing datasets
      const datasets = await getDb().query.Dataset.findMany({
        where: inArray(Dataset.id, datasetIds),
      })

      // Filter out non-existent datasets from metadata
      const existingDatasetIds = new Set(datasets.map((d) => d.id))
      const nonExistentIds = datasetIds.filter((id) => !existingDatasetIds.has(id))

      if (nonExistentIds.length > 0) {
        // Update metadata to remove non-existent dataset bindings
        const updatedBindings = datasetIds.filter((id) => existingDatasetIds.has(id))
        const updatedMetadata = {
          ...metadata,
          datasetBindings: updatedBindings,
        }
        await updateMetadataBindings(scope, ctx, updatedMetadata as AppMetadata | AgentMetadata)
      }

      return datasets.map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        description: dataset.metadata.description,
      }))
    },
  })
}

function searchKnowledge(_ctx: Context) {
  return tool({
    description:
      'Search within a specific knowledge base using natural language queries or keywords. This tool allows you to retrieve relevant information from the selected knowledge base to help answer questions and provide accurate responses.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'Natural language query or space-separated keywords to search for information. Be specific and concise to get the most relevant results',
        ),
      knowledgeBaseId: z
        .string()
        .describe(
          'ID of the knowledge base to search in. Use the listKnowledgeBases tool first to find the appropriate knowledge base ID',
        ),
    }),
    execute: async ({ query, knowledgeBaseId }) => {
      const dataset = await getDb().query.Dataset.findFirst({
        where: eq(Dataset.id, knowledgeBaseId),
      })
      if (!dataset) {
        return []
      }

      // Get embeddings for the query
      const embedding = await embed(query, dataset.metadata.embeddingModel)

      // Initialize vector database with correct dimensions
      const dimensions = await getTextEmbeddingDimensions(dataset.metadata.embeddingModel)
      if (!dimensions) {
        return []
      }
      const vdb = new QdrantVector(dimensions)

      // Search for relevant documents
      const filter = {
        workspaceId: dataset.workspaceId,
        datasetId: dataset.id,
      }

      const retrievalMode = dataset.metadata.retrievalMode
      const topK = dataset.metadata.topK
      const scoreThreshold = dataset.metadata.scoreThreshold

      const results: Document[] = []

      if (retrievalMode === 'vector-search' || retrievalMode === 'hybrid-search') {
        const vectorResults = await vdb.searchDocumentsByEmbedding(embedding, filter, {
          topK,
          scoreThreshold,
        })
        results.push(...vectorResults)
      }

      if (retrievalMode === 'full-text-search' || retrievalMode === 'hybrid-search') {
        const textResults = await vdb.searchDocumentsByFulltext(query, filter, {
          topK,
          scoreThreshold,
        })
        results.push(...textResults)
      }

      if (results.length <= 0) {
        return []
      }

      // Rerank results
      const reranker = new CohereReranker()
      const rerankedResults = await reranker.rerank(
        query,
        results.map((r) => r.content),
        dataset.metadata.rerankModel,
      )

      // Get original documents based on reranked indices
      const rerankedDocuments = rerankedResults.documents.map(({ index }) => results[index]!)

      // Get DocumentSegments for the chunks
      const documentSegments = await getDb()
        .select({
          content: DocumentSegment.content,
        })
        .from(DocumentChunk)
        .innerJoin(DocumentSegment, eq(DocumentSegment.id, DocumentChunk.segmentId))
        .where(
          inArray(
            DocumentChunk.id,
            rerankedDocuments.map((doc) => doc.id),
          ),
        )

      return documentSegments.map((segment) => segment.content)
    },
  })
}

export const knowledgeTools = {
  listKnowledgeBases,
  searchKnowledge,
}
