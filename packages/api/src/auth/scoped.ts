import { ORPCError } from '@orpc/server'

import type { OrganizationStatementsSubset } from '@cared/auth'
import type { Database, Transaction } from '@cared/db/client'
import { auth, headers } from '@cared/auth'
import { eq } from '@cared/db'
import { App, Workspace } from '@cared/db/schema'

import type { Auth } from './auth'

interface Context {
  auth?: Auth
  headers: Headers
  db: Database | Transaction
}

export class OrganizationScope {
  private constructor(
    public ctx: Context,
    public organizationId: string,
  ) {}

  static fromOrganization(ctx: Context, organizationId: string) {
    if (ctx.auth && !ctx.auth.checkOrganization({ organizationId })) {
      throw new ORPCError('FORBIDDEN', {
        message: 'You do not have permission to access this organization',
      })
    }
    return new OrganizationScope(ctx, organizationId)
  }

  static async fromWorkspace(ctx: Context, workspaceId: string, organizationId?: string) {
    if (!organizationId) {
      const workspace = await ctx.db.query.Workspace.findFirst({
        where: eq(Workspace.id, workspaceId),
      })
      if (!workspace) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Workspace not found',
        })
      }
      organizationId = workspace.organizationId
    }

    if (ctx.auth && !ctx.auth.checkWorkspace({ workspaceId, organizationId })) {
      throw new ORPCError('FORBIDDEN', {
        message: 'You do not have permission to access this workspace',
      })
    }

    return new OrganizationScope(ctx, organizationId)
  }

  static async fromApp(
    ctx: Context,
    app: string | App,
    workspaceId?: string,
    organizationId?: string,
  ) {
    let appId
    if (typeof app !== 'string') {
      appId = app.id

      workspaceId ??= app.workspaceId

      if (!organizationId) {
        const workspace = await ctx.db.query.Workspace.findFirst({
          where: eq(Workspace.id, app.workspaceId),
        })
        if (!workspace) {
          throw new ORPCError('NOT_FOUND', {
            message: 'Workspace not found',
          })
        }
        organizationId = workspace.organizationId
      }
    } else {
      appId = app

      if (!workspaceId || !organizationId) {
        const [result] = await ctx.db
          .select({
            workspaceId: Workspace.id,
            organizationId: Workspace.organizationId,
          })
          .from(App)
          .innerJoin(Workspace, eq(Workspace.id, App.workspaceId))
          .where(eq(App.id, app))
          .limit(1)
        if (!result) {
          throw new ORPCError('NOT_FOUND', {
            message: 'App not found',
          })
        }

        workspaceId = result.workspaceId
        organizationId = result.organizationId
      }
    }

    if (ctx.auth && !ctx.auth.checkApp({ appId, workspaceId, organizationId })) {
      throw new ORPCError('FORBIDDEN', {
        message: 'You do not have permission to access this app',
      })
    }

    return new OrganizationScope(ctx, organizationId)
  }

  async checkPermissions(permissions: OrganizationStatementsSubset = { pseudo: [] }) {
    const { success } = await auth.api.hasPermission({
      headers: headers(this.ctx.headers),
      body: {
        organizationId: this.organizationId,
        permissions,
      },
    })
    if (!success) {
      // console.error('OrganizationScope.checkPermissions failed', {
      //   organizationId: this.organizationId,
      //   permissions,
      // })
      throw new ORPCError('FORBIDDEN', {
        message: 'You do not have permission to perform this action',
      })
    }
  }
}
