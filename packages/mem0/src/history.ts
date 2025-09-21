import type { HistoryManagerFactory } from 'mem0ai/oss'

import { desc, eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { Mem0History } from '@cared/db/schema'

type HistoryManager = ReturnType<(typeof HistoryManagerFactory)['create']>

export class CaredHistoryManager implements HistoryManager {
  async addHistory(
    memoryId: string,
    previousValue: string | null,
    newValue: string | null,
    action: string,
    createdAt?: string,
    updatedAt?: string,
    isDeleted?: number,
  ): Promise<void> {
    await getDb().insert(Mem0History).values({
      memoryId,
      previousValue,
      newValue,
      action,
      createdAt: createdAt ? new Date(createdAt) : undefined,
      updatedAt: updatedAt ? new Date(updatedAt) : undefined,
      isDeleted: isDeleted,
    })
  }

  async getHistory(memoryId: string): Promise<any[]> {
    return await getDb()
      .select()
      .from(Mem0History)
      .where(eq(Mem0History.memoryId, memoryId))
      .orderBy(desc(Mem0History.id))
  }

  async reset(): Promise<void> {
    await getDb().delete(Mem0History)
  }

  close() {
    return
  }
}
