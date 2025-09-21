import { and, eq, ne } from '@cared/db'
import { getDb } from '@cared/db/client'
import { App, Chat, Workspace } from '@cared/db/schema'

import type { BaseContext } from '../orpc'
import { deleteApiKeys } from './api-key'

export class WorkspaceOperator {
  constructor(
    public ctx: BaseContext,
    public workspaceId: string,
  ) {}

  async isArchived() {
    const workspace = await getDb().query.Workspace.findFirst({
      where: eq(Workspace.id, this.workspaceId),
      columns: { archived: true },
    })
    return !!workspace?.archived
  }

  async archive() {
    await getDb().transaction(async (tx) => {
      const archivedAt = new Date()

      // Archive all associated apps
      await tx
        .update(App)
        .set({
          archived: true,
          archivedAt,
        })
        .where(and(eq(App.workspaceId, this.workspaceId), ne(App.archived, true)))

      await tx
        .update(Workspace)
        .set({
          archived: true,
          archivedAt,
        })
        .where(eq(Workspace.id, this.workspaceId))
    })
  }

  async unarchive() {
    await getDb()
      .update(Workspace)
      .set({
        archived: null,
        archivedAt: null,
      })
      .where(eq(Workspace.id, this.workspaceId))
  }

  async isDeletable() {
    const hasChat = !!(
      await getDb()
        .select({
          id: Chat.id,
        })
        .from(App)
        .innerJoin(Chat, eq(Chat.appId, App.id))
        .where(eq(App.workspaceId, this.workspaceId))
        .limit(1)
    ).at(0)
    return !hasChat
  }

  async isDeleted(soft = true) {
    const workspace = await getDb().query.App.findFirst({
      where: eq(App.id, this.workspaceId),
      columns: { deleted: true },
    })
    return !workspace || (soft && workspace.deleted)
  }

  async softDelete() {
    await getDb()
      .update(Workspace)
      .set({
        deleted: true,
        deletedAt: new Date(),
      })
      .where(eq(Workspace.id, this.workspaceId))
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
      scope: 'workspace',
      workspaceId: this.workspaceId,
    })

    // TODO: credits
    await getDb().transaction(async (tx) => {
      await tx.delete(Workspace).where(eq(Workspace.id, this.workspaceId))
    })
  }
}
