import { eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { App, Chat } from '@cared/db/schema'

import type { BaseContext } from '../orpc'
import { deleteApiKeys } from './api-key'

export class AppOperator {
  constructor(
    public ctx: BaseContext,
    public appId: string,
  ) {}

  async isArchived() {
    const app = await getDb().query.App.findFirst({
      where: eq(App.id, this.appId),
      columns: { archived: true },
    })
    return !!app?.archived
  }

  async archive() {
    await getDb()
      .update(App)
      .set({
        archived: true,
        archivedAt: new Date(),
      })
      .where(eq(App.id, this.appId))
  }

  async unarchive() {
    await getDb()
      .update(App)
      .set({
        archived: null,
        archivedAt: null,
      })
      .where(eq(App.id, this.appId))
  }

  async isDeletable() {
    const hasChat = !!(await getDb().query.Chat.findFirst({
      where: eq(Chat.appId, this.appId),
      columns: { id: true },
    }))
    return !hasChat
  }

  async isDeleted(soft = true) {
    const app = await getDb().query.App.findFirst({
      where: eq(App.id, this.appId),
      columns: { deleted: true },
    })
    return !app || (soft && app.deleted)
  }

  async softDelete() {
    await getDb()
      .update(App)
      .set({
        deleted: true,
        deletedAt: new Date(),
      })
      .where(eq(App.id, this.appId))
  }

  async delete() {
    // Ensure no associated resources to be created before deletion
    if (!(await this.isArchived())) {
      await this.archive()
    }

    if (!(await this.isDeletable())) {
      throw new Error('App cannot be deleted because it has associated resources')
    }

    await this.softDelete()

    await deleteApiKeys(this.ctx, {
      scope: 'app',
      appId: this.appId,
    })

    await getDb().transaction(async (tx) => {
      await tx.delete(App).where(eq(App.id, this.appId))
    })
  }
}
