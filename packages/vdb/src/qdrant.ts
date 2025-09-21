import { QdrantClient } from '@qdrant/js-client-rest'
import { Mutex } from 'async-mutex'

import type {
  Document,
  DocumentWithEmbedding,
  Memory,
  MemoryWithEmbedding,
  SearchOptions,
} from './base'
import type { Schemas } from '@qdrant/js-client-rest'
import { BaseVector } from './base'
import { env } from './env'

type CollectionType = 'knowledge' | 'memory'

export class QdrantVector extends BaseVector {
  private static singleton?: QdrantClient
  private static mutex = new Mutex()

  public client: QdrantClient
  private initialized = false

  private static getCollectionName(prefix: string, size: number) {
    return `${prefix}-${size}`
  }

  private static readonly KNOWLEDGE_PREFIX: CollectionType = 'knowledge'
  private static readonly MEMORY_PREFIX: CollectionType = 'memory'
  private collectionSizes = new Set<number>()

  constructor(private vectorSize?: number) {
    super()

    if (!QdrantVector.singleton) {
      QdrantVector.singleton = new QdrantClient({
        url: env.QDRANT_ENDPOINT,
        apiKey: env.QDRANT_API_KEY,
      })
    }
    this.client = QdrantVector.singleton
  }

  private async getAllCollections() {
    const collections = await this.client.getCollections()
    return collections.collections.map((c) => c.name)
  }

  private async createCollectionIfNotExists(prefix: CollectionType, size: number) {
    if (this.collectionSizes.has(size)) {
      return
    }

    await QdrantVector.mutex.runExclusive(async () => {
      const collectionName = QdrantVector.getCollectionName(prefix, size)
      const collections = await this.getAllCollections()

      if (!collections.includes(collectionName)) {
        await this.createCollection(collectionName, size, prefix)
      }
    })

    this.collectionSizes.add(size)
  }

  private async createCollection(collectionName: string, size: number, type: CollectionType) {
    await this.client.recreateCollection(collectionName, {
      vectors: {
        size,
        distance: 'Cosine',
      },
      hnsw_config: {
        m: 0,
        ef_construct: 100,
        full_scan_threshold: 10000,
        max_indexing_threads: 0,
        on_disk: false,
        payload_m: 16,
      },
      timeout: 20,
    })

    if (type === QdrantVector.KNOWLEDGE_PREFIX) {
      await this.client.createPayloadIndex(collectionName, {
        field_name: 'metadata.workspaceId',
        field_schema: {
          type: 'uuid',
          is_tenant: true,
        },
        wait: true,
      })

      await this.client.createPayloadIndex(collectionName, {
        field_name: 'metadata.datasetId',
        field_schema: 'uuid',
        wait: true,
      })

      await this.client.createPayloadIndex(collectionName, {
        field_name: 'metadata.documentId',
        field_schema: 'uuid',
        wait: true,
      })
    } else {
      await this.client.createPayloadIndex(collectionName, {
        field_name: 'metadata.userId',
        field_schema: {
          type: 'uuid',
          is_tenant: true,
        },
        wait: true,
      })

      await this.client.createPayloadIndex(collectionName, {
        field_name: 'metadata.appId',
        field_schema: 'uuid',
        wait: true,
      })

      await this.client.createPayloadIndex(collectionName, {
        field_name: 'metadata.chatId',
        field_schema: 'uuid',
        wait: true,
      })
    }

    await this.client.createPayloadIndex(collectionName, {
      field_name: 'content',
      field_schema: {
        type: 'text',
        tokenizer: 'multilingual',
        min_token_len: 2,
        max_token_len: 20,
        lowercase: true,
      },
      wait: true,
    })
  }

  private async init() {
    if (this.initialized) {
      return
    }

    await QdrantVector.mutex.runExclusive(async () => {
      const collections = await this.getAllCollections()

      for (const collection of collections) {
        const [prefix, sizeStr] = collection.split('-')
        if (
          (prefix === QdrantVector.KNOWLEDGE_PREFIX || prefix === QdrantVector.MEMORY_PREFIX) &&
          sizeStr
        ) {
          const size = parseInt(sizeStr)
          if (!isNaN(size)) {
            this.collectionSizes.add(size)
          }
        }
      }
    })

    if (this.vectorSize) {
      await this.createCollectionIfNotExists(QdrantVector.KNOWLEDGE_PREFIX, this.vectorSize)
      await this.createCollectionIfNotExists(QdrantVector.MEMORY_PREFIX, this.vectorSize)
    }

    this.initialized = true
  }

  async insertDocuments(documents: DocumentWithEmbedding | DocumentWithEmbedding[]) {
    await this.init()

    documents = Array.isArray(documents) ? documents : [documents]

    const docsBySize = new Map<number, DocumentWithEmbedding[]>()
    for (const doc of documents) {
      const size = doc.embedding.length
      const docs = docsBySize.get(size) ?? []
      docsBySize.set(size, [...docs, doc])
    }

    const results: string[] = []
    for (const [size, docs] of docsBySize) {
      await this.createCollectionIfNotExists(QdrantVector.KNOWLEDGE_PREFIX, size)

      const collectionName = QdrantVector.getCollectionName(QdrantVector.KNOWLEDGE_PREFIX, size)

      await this.client.upsert(collectionName, {
        wait: true,
        points: docs.map((doc) => ({
          id: doc.id,
          vector: doc.embedding,
          payload: {
            content: doc.content,
            metadata: doc.metadata,
          },
        })),
      })
      results.push(...docs.map((doc) => doc.id))
    }
    return results
  }

  async getDocument(id: string) {
    await this.init()

    if (this.vectorSize) {
      const collectionName = QdrantVector.getCollectionName(
        QdrantVector.KNOWLEDGE_PREFIX,
        this.vectorSize,
      )
      const response = (
        await this.client.retrieve(collectionName, {
          ids: [id],
          with_payload: true,
          with_vector: true,
        })
      ).at(0)
      if (response?.payload) {
        return {
          id: response.id,
          content: response.payload.content,
          embedding: response.vector,
          metadata: response.payload.metadata,
        } as DocumentWithEmbedding
      }
    } else {
      for (const size of this.collectionSizes) {
        const collectionName = QdrantVector.getCollectionName(QdrantVector.KNOWLEDGE_PREFIX, size)
        const response = (
          await this.client.retrieve(collectionName, {
            ids: [id],
            with_payload: true,
            with_vector: true,
          })
        ).at(0)
        if (response?.payload) {
          return {
            id: response.id,
            content: response.payload.content,
            embedding: response.vector,
            metadata: response.payload.metadata,
          } as DocumentWithEmbedding
        }
      }
    }
  }

  async hasDocument(id: string) {
    await this.init()

    if (this.vectorSize) {
      const collectionName = QdrantVector.getCollectionName(
        QdrantVector.KNOWLEDGE_PREFIX,
        this.vectorSize,
      )
      const response = await this.client.retrieve(collectionName, {
        ids: [id],
      })
      return response.length > 0
    } else {
      for (const size of this.collectionSizes) {
        const collectionName = QdrantVector.getCollectionName(QdrantVector.KNOWLEDGE_PREFIX, size)
        const response = await this.client.retrieve(collectionName, {
          ids: [id],
        })
        if (response.length > 0) {
          return true
        }
      }
      return false
    }
  }

  async searchDocumentsByEmbedding(
    embedding: number[],
    filter?: {
      workspaceId?: string
      datasetId?: string
      documentId?: string
    },
    opts?: SearchOptions,
  ) {
    await this.init()

    const must = []
    if (filter?.workspaceId) {
      must.push({
        key: 'metadata.workspaceId',
        match: {
          value: filter.workspaceId,
        },
      })
    }
    if (filter?.datasetId) {
      must.push({
        key: 'metadata.datasetId',
        match: {
          value: filter.datasetId,
        },
      })
    }
    if (filter?.documentId) {
      must.push({
        key: 'metadata.documentId',
        match: {
          value: filter.documentId,
        },
      })
    }

    const results: DocumentWithEmbedding[] = []
    const targetSizes = this.vectorSize ? [this.vectorSize] : Array.from(this.collectionSizes)

    for (const size of targetSizes) {
      if (embedding.length !== size) {
        continue
      }

      const collectionName = QdrantVector.getCollectionName(QdrantVector.KNOWLEDGE_PREFIX, size)
      const response = await this.client.search(collectionName, {
        vector: embedding,
        with_payload: true,
        with_vector: true,
        filter: {
          must,
        },
        limit: opts?.topK ?? 4,
        score_threshold: opts?.scoreThreshold ?? 0,
      })

      for (const item of response) {
        if (!item.payload) {
          continue
        }
        if (item.score < (opts?.scoreThreshold ?? 0)) {
          continue
        }
        results.push({
          id: item.id as string,
          content: item.payload.content as string,
          embedding: item.vector as number[],
          metadata: {
            ...(item.payload.metadata as Document['metadata']),
            score: item.score,
          },
        })
      }
    }
    return results
  }

  async searchDocumentsByFulltext(
    query: string,
    filter?: {
      workspaceId?: string
      datasetId?: string
      documentId?: string
    },
    opts?: SearchOptions,
  ) {
    await this.init()

    const must: Schemas['Filter']['must'] = [
      {
        key: 'content',
        match: {
          text: query,
        },
      },
    ]
    if (filter?.workspaceId) {
      must.push({
        key: 'metadata.workspaceId',
        match: {
          value: filter.workspaceId,
        },
      })
    }
    if (filter?.datasetId) {
      must.push({
        key: 'metadata.datasetId',
        match: {
          value: filter.datasetId,
        },
      })
    }
    if (filter?.documentId) {
      must.push({
        key: 'metadata.documentId',
        match: {
          value: filter.documentId,
        },
      })
    }

    const results: Document[] = []
    const targetSizes = this.vectorSize ? [this.vectorSize] : Array.from(this.collectionSizes)

    for (const size of targetSizes) {
      const collectionName = QdrantVector.getCollectionName(QdrantVector.KNOWLEDGE_PREFIX, size)
      const response = await this.client.scroll(collectionName, {
        with_payload: true,
        with_vector: false,
        filter: {
          must,
        },
        limit: opts?.topK ?? 2,
      })

      for (const item of response.points) {
        if (!item.payload) {
          continue
        }
        results.push({
          id: item.id as string,
          content: item.payload.content as string,
          metadata: item.payload.metadata as Document['metadata'],
        })
      }
    }
    return results
  }

  async deleteDocuments(ids: string[]) {
    await this.init()

    const targetSizes = this.vectorSize ? [this.vectorSize] : Array.from(this.collectionSizes)

    for (const size of targetSizes) {
      const collectionName = QdrantVector.getCollectionName(QdrantVector.KNOWLEDGE_PREFIX, size)
      await this.client.delete(collectionName, {
        wait: true,
        points: ids,
      })
    }
  }

  async deleteDocumentsByFilter(filter: {
    workspaceId?: string
    datasetId?: string
    documentId?: string
  }) {
    await this.init()

    const match: Record<string, unknown> = {}
    if (filter.workspaceId) {
      match['metadata.workspaceId'] = filter.workspaceId
    }
    if (filter.datasetId) {
      match['metadata.datasetId'] = filter.datasetId
    }
    if (filter.documentId) {
      match['metadata.documentId'] = filter.documentId
    }

    const targetSizes = this.vectorSize ? [this.vectorSize] : Array.from(this.collectionSizes)

    for (const size of targetSizes) {
      const collectionName = QdrantVector.getCollectionName(QdrantVector.KNOWLEDGE_PREFIX, size)
      await this.client.delete(collectionName, {
        wait: true,
        filter: {
          must: {
            match,
          },
        },
      })
    }
  }

  async insertMemories(memories: MemoryWithEmbedding | MemoryWithEmbedding[]) {
    await this.init()

    memories = Array.isArray(memories) ? memories : [memories]

    const memoriesBySize = new Map<number, MemoryWithEmbedding[]>()
    for (const memory of memories) {
      const size = memory.embedding.length
      const mems = memoriesBySize.get(size) ?? []
      memoriesBySize.set(size, [...mems, memory])
    }

    const results: string[] = []
    for (const [size, mems] of memoriesBySize) {
      await this.createCollectionIfNotExists(QdrantVector.MEMORY_PREFIX, size)

      const collectionName = QdrantVector.getCollectionName(QdrantVector.MEMORY_PREFIX, size)

      await this.client.upsert(collectionName, {
        wait: true,
        points: mems.map((memory) => ({
          id: memory.id,
          vector: memory.embedding,
          payload: {
            content: memory.content,
            metadata: memory.metadata,
          },
        })),
      })
      results.push(...mems.map((memory) => memory.id))
    }
    return results
  }

  async getMemory(id: string) {
    await this.init()

    if (this.vectorSize) {
      const collectionName = QdrantVector.getCollectionName(
        QdrantVector.MEMORY_PREFIX,
        this.vectorSize,
      )
      const response = (
        await this.client.retrieve(collectionName, {
          ids: [id],
          with_payload: true,
          with_vector: true,
        })
      ).at(0)
      if (response?.payload) {
        return {
          id: response.id,
          content: response.payload.content,
          embedding: response.vector,
          metadata: response.payload.metadata,
        } as MemoryWithEmbedding
      }
    } else {
      for (const size of this.collectionSizes) {
        const collectionName = QdrantVector.getCollectionName(QdrantVector.MEMORY_PREFIX, size)
        const response = (
          await this.client.retrieve(collectionName, {
            ids: [id],
            with_payload: true,
            with_vector: true,
          })
        ).at(0)
        if (response?.payload) {
          return {
            id: response.id,
            content: response.payload.content,
            embedding: response.vector,
            metadata: response.payload.metadata,
          } as MemoryWithEmbedding
        }
      }
    }
  }

  async hasMemory(id: string) {
    await this.init()

    if (this.vectorSize) {
      const collectionName = QdrantVector.getCollectionName(
        QdrantVector.MEMORY_PREFIX,
        this.vectorSize,
      )
      const response = await this.client.retrieve(collectionName, {
        ids: [id],
      })
      return response.length > 0
    } else {
      for (const size of this.collectionSizes) {
        const collectionName = QdrantVector.getCollectionName(QdrantVector.MEMORY_PREFIX, size)
        const response = await this.client.retrieve(collectionName, {
          ids: [id],
        })
        if (response.length > 0) {
          return true
        }
      }
      return false
    }
  }

  async searchMemoriesByEmbedding(
    embedding: number[],
    filter?: {
      userId?: string
      appId?: string
      chatId?: string
    },
    opts?: SearchOptions,
  ) {
    await this.init()

    const must = []
    if (filter?.userId) {
      must.push({
        key: 'metadata.userId',
        match: {
          value: filter.userId,
        },
      })
    }
    if (filter?.appId) {
      must.push({
        key: 'metadata.appId',
        match: {
          value: filter.appId,
        },
      })
    }
    if (filter?.chatId) {
      must.push({
        key: 'metadata.chatId',
        match: {
          value: filter.chatId,
        },
      })
    }

    const results: MemoryWithEmbedding[] = []
    const targetSizes = this.vectorSize ? [this.vectorSize] : Array.from(this.collectionSizes)

    for (const size of targetSizes) {
      if (embedding.length !== size) {
        continue
      }

      const collectionName = QdrantVector.getCollectionName(QdrantVector.MEMORY_PREFIX, size)
      const response = await this.client.search(collectionName, {
        vector: embedding,
        with_payload: true,
        with_vector: true,
        filter: {
          must,
        },
        limit: opts?.topK ?? 4,
        score_threshold: opts?.scoreThreshold ?? 0,
      })

      for (const item of response) {
        if (!item.payload) {
          continue
        }
        if (item.score < (opts?.scoreThreshold ?? 0)) {
          continue
        }
        results.push({
          id: item.id as string,
          content: item.payload.content as string,
          embedding: item.vector as number[],
          metadata: {
            ...(item.payload.metadata as MemoryWithEmbedding['metadata']),
            score: item.score,
          },
        })
      }
    }
    return results
  }

  async searchMemoriesByFulltext(
    query: string,
    filter?: {
      userId?: string
      appId?: string
      chatId?: string
    },
    opts?: SearchOptions,
  ) {
    await this.init()

    const must: Schemas['Filter']['must'] = [
      {
        key: 'content',
        match: {
          text: query,
        },
      },
    ]
    if (filter?.userId) {
      must.push({
        key: 'metadata.userId',
        match: {
          value: filter.userId,
        },
      })
    }
    if (filter?.appId) {
      must.push({
        key: 'metadata.appId',
        match: {
          value: filter.appId,
        },
      })
    }
    if (filter?.chatId) {
      must.push({
        key: 'metadata.chatId',
        match: {
          value: filter.chatId,
        },
      })
    }

    const results: Memory[] = []
    const targetSizes = this.vectorSize ? [this.vectorSize] : Array.from(this.collectionSizes)

    for (const size of targetSizes) {
      const collectionName = QdrantVector.getCollectionName(QdrantVector.MEMORY_PREFIX, size)
      const response = await this.client.scroll(collectionName, {
        with_payload: true,
        with_vector: false,
        filter: {
          must,
        },
        limit: opts?.topK ?? 2,
      })

      for (const item of response.points) {
        if (!item.payload) {
          continue
        }
        results.push({
          id: item.id as string,
          content: item.payload.content as string,
          metadata: item.payload.metadata as Memory['metadata'],
        })
      }
    }
    return results
  }

  async deleteMemories(ids: string[]) {
    await this.init()

    const targetSizes = this.vectorSize ? [this.vectorSize] : Array.from(this.collectionSizes)

    for (const size of targetSizes) {
      const collectionName = QdrantVector.getCollectionName(QdrantVector.MEMORY_PREFIX, size)
      await this.client.delete(collectionName, {
        wait: true,
        points: ids,
      })
    }
  }

  async deleteMemoriesByFilter(filter: { userId?: string; appId?: string; chatId?: string }) {
    await this.init()

    const match: Record<string, unknown> = {}
    if (filter.userId) {
      match['metadata.userId'] = filter.userId
    }
    if (filter.appId) {
      match['metadata.appId'] = filter.appId
    }
    if (filter.chatId) {
      match['metadata.chatId'] = filter.chatId
    }

    const targetSizes = this.vectorSize ? [this.vectorSize] : Array.from(this.collectionSizes)

    for (const size of targetSizes) {
      const collectionName = QdrantVector.getCollectionName(QdrantVector.MEMORY_PREFIX, size)
      await this.client.delete(collectionName, {
        wait: true,
        filter: {
          must: {
            match,
          },
        },
      })
    }
  }
}
