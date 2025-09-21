import { serve } from '@upstash/workflow/hono'
import { generateObject } from 'ai'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

import type { CreateDocumentChunkSchema } from '@cared/db/schema'
import { getDb } from '@cared/db/client'
import { Dataset, Document, DocumentChunk, DocumentSegment } from '@cared/db/schema'
import { loadFile } from '@cared/etl'
import { log } from '@cared/log'
import { getTextEmbeddingDimensions } from '@cared/providers'
import { embedMany } from '@cared/providers/embed'
import { getModel } from '@cared/providers/providers'
import { QdrantVector } from '@cared/vdb'

import { getWorkflowClient } from './client'

// Maximum length for a text segment (32K)
const MAX_SEGMENT_LENGTH = 32768

// Maximum total text length for each embedding batch (32K)
const MAX_BATCH_EMBEDDING_TEXT_LENGTH = 32768

// Define schema for document splitting
const documentSplitSchema = z.array(
  z.object({
    parent: z.string(),
    children: z.array(z.string()),
  }),
)

/**
 * Split array into batches based on total text length
 * @param texts Array of texts to split into batches
 * @param maxBatchLength Maximum total text length for each batch
 * @returns Array of text batches
 */
function splitIntoBatches(texts: string[], maxBatchLength: number): string[][] {
  const batches: string[][] = []
  let currentBatch: string[] = []
  let currentBatchLength = 0

  for (const text of texts) {
    if (currentBatchLength + text.length > maxBatchLength && currentBatch.length > 0) {
      batches.push(currentBatch)
      currentBatch = []
      currentBatchLength = 0
    }
    currentBatch.push(text)
    currentBatchLength += text.length
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

export function isDocumentNeedsProcessing(document: Document) {
  return document.metadata.url && !document.metadata.processed && !document.metadata.taskId
}

export const POST = serve<string>(
  async (context) => {
    const docId = context.requestPayload

    const doc = await getDb().query.Document.findFirst({
      where: eq(Document.id, docId),
    })

    if (!doc) {
      log.error('Document not found', {
        documentId: docId,
      })
      await context.cancel()
      return
    }
    if (!isDocumentNeedsProcessing(doc)) {
      log.error('Document needs no processing', {
        documentId: doc.id,
      })
      await context.cancel()
      return
    }

    const dataset = await getDb().query.Dataset.findFirst({
      where: eq(Dataset.id, doc.datasetId),
    })

    if (!dataset) {
      log.error('Dataset not found', {
        datasetId: doc.datasetId,
        documentId: doc.id,
      })
      await context.cancel()
      return
    }

    const languageModel = getModel(dataset.metadata.languageModel, 'language')

    const dimensions = await getTextEmbeddingDimensions(dataset.metadata.embeddingModel)
    if (!dimensions) {
      throw new Error('Embedding model configuration lacks dimensions')
    }

    const { body: data } = await context.call<Uint8Array>('get-s3-object', {
      url: doc.metadata.url!,
    })

    const chunks = await context.run('extract-content', async () => {
      // Extract chunks from document
      const chunks = (await loadFile(data, doc.name)).map((chunk) => chunk.content)

      // Split into chunks respecting MAX_SEGMENT_LENGTH
      const newChunks: string[] = []
      let currentChunk = ''

      for (const segment of chunks) {
        if (currentChunk.length + segment.length + 1 <= MAX_SEGMENT_LENGTH) {
          currentChunk += (currentChunk ? '\n' : '') + segment
        } else {
          if (currentChunk) {
            newChunks.push(currentChunk)
          }
          currentChunk = segment
        }
      }
      if (currentChunk) {
        newChunks.push(currentChunk)
      }

      return newChunks
    })

    // Split each chunk into parent-child structure in parallel
    const parentsAndChildren = await Promise.all(
      chunks.map(async (chunk, index) => {
        return await context.run(`split-content-chunk-${index}`, async () => {
          const { object } = await generateObject({
            model: languageModel,
            schema: documentSplitSchema,
            system: `Split the input text into a parent-child structure for embedding and RAG (Retrieval Augmented Generation):
- Parent blocks provide broader context, with max 500 tokens each
- Child blocks are optimized for vector search and retrieval, with max 200 tokens each

Clean up the text by:
- Removing consecutive whitespace, newlines and tabs 
- Removing text or symbols with little semantic value
- Preserving the key information and meaning`,
            prompt: chunk,
          })
          return object
        })
      }),
    ).then((results) => results.flat())

    // Collect all children chunks
    const allChildren = parentsAndChildren.flatMap((item) => item.children)

    // Split into smaller batches
    const childrenBatchesForEmbedding = splitIntoBatches(
      allChildren,
      MAX_BATCH_EMBEDDING_TEXT_LENGTH,
    )

    // Generate embeddings for all children chunks
    // Process each embedding batch in parallel with separate context.run() tasks
    const embeddings = await Promise.all(
      childrenBatchesForEmbedding.map(async (batch, batchIndex) => {
        return await context.run(`generate-embeddings-${batchIndex}-${batch.length}`, async () => {
          return await embedMany(batch, dataset.metadata.embeddingModel)
        })
      }),
    ).then((results) => results.flat())

    await context.run('store-embeddings', async () => {
      await getDb().transaction(async (tx) => {
        const vdb = new QdrantVector(dimensions)

        // Prepare batch arrays for segments and chunks
        const segmentValues = parentsAndChildren.map((item, index) => ({
          workspaceId: doc.workspaceId,
          datasetId: doc.datasetId,
          documentId: doc.id,
          index,
          content: item.parent,
        }))

        // Batch insert segments
        const segments = await tx.insert(DocumentSegment).values(segmentValues).returning()

        // Prepare array for batch chunk insertion
        const chunkValues: z.infer<typeof CreateDocumentChunkSchema>[] = []

        // Track embedding indices for each chunk
        const embeddingIndices: number[] = []

        segments.forEach((segment: (typeof segments)[0], segmentIndex: number) => {
          const children = parentsAndChildren[segmentIndex]?.children ?? []
          children.forEach((childContent: string, childIndex: number) => {
            // Add to chunks batch
            chunkValues.push({
              workspaceId: doc.workspaceId,
              datasetId: doc.datasetId,
              documentId: doc.id,
              segmentId: segment.id,
              index: childIndex,
              content: childContent,
              metadata: {},
            })

            // Track corresponding embedding index
            embeddingIndices.push(segmentIndex * children.length + childIndex)
          })
        })

        // Batch insert chunks
        const chunks = await tx.insert(DocumentChunk).values(chunkValues).returning()

        // Prepare vector documents with actual chunk IDs
        const vectorDocuments = chunks.map((chunk, index) => ({
          id: chunk.id,
          content: chunk.content,
          embedding: embeddings[embeddingIndices[index]!]!,
          metadata: {
            workspaceId: doc.workspaceId,
            datasetId: doc.datasetId,
            documentId: doc.id,
          },
        }))

        await tx
          .update(Document)
          .set({
            metadata: {
              ...doc.metadata,
              processed: true,
            },
          })
          .where(eq(Document.id, doc.id))

        // Batch insert into vector database
        await vdb.insertDocuments(vectorDocuments)
      })
    })
  },
  {
    retries: 2,
    verbose: true,
    disableTelemetry: true,
  },
)

export const name = 'process-document'

export async function trigger(document: Document) {
  if (!isDocumentNeedsProcessing(document)) {
    return
  }

  const { workflowRunId } = await getWorkflowClient().trigger({
    url: name,
    body: document.id,
  })

  await getDb()
    .update(Document)
    .set({
      metadata: {
        ...document.metadata,
        taskId: workflowRunId,
      },
    })
    .where(eq(Document.id, document.id))

  return workflowRunId
}
