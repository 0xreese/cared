import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import { auth, headers } from '@cared/auth'
import { and, desc, eq, inArray } from '@cared/db'
import {
  Account,
  App,
  Member,
  OAuthAccessToken,
  OAuthApplication,
  OAuthConsent,
  Organization,
  User,
  Workspace,
} from '@cared/db/schema'

import { publicProcedure, userProtectedProcedure } from '../orpc'
import { formatOAuthApp } from './oauth-app'

export const userRouter = {
  session: publicProcedure
    .route({
      method: 'GET',
      path: '/v1/me/session',
      tags: ['me'],
      summary: 'Get current session of current user',
    })
    .input(
      z
        .object({
          auth: z.boolean(),
        })
        .default({
          auth: true,
        }),
    )
    .handler(async ({ context, input }) => {
      if (input.auth) {
        const auth = context.auth.auth
        if (!(auth?.type === 'user' || auth?.type === 'appUser')) {
          throw new ORPCError('UNAUTHORIZED')
        }
      }

      const session = await auth.api.getSession({
        headers: headers(context.headers),
      })

      if (input.auth && !session) {
        throw new ORPCError('UNAUTHORIZED')
      }

      return session
    }),

  accounts: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/me/accounts',
      tags: ['me'],
      summary: 'Get linked accounts of current user',
    })
    .handler(async ({ context }) => {
      if (!context.auth.userId) {
        throw new ORPCError('FORBIDDEN', {
          message: 'This api is only available for authenticated users',
        })
      }

      const accounts = await context.db.query.Account.findMany({
        where: eq(Account.userId, context.auth.userId),
      })

      return { accounts }
    }),

  sessions: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/me/sessions',
      tags: ['me'],
      summary: 'Get sessions of current user',
    })
    .handler(async ({ context }) => {
      if (!context.auth.userId) {
        throw new ORPCError('FORBIDDEN', {
          message: 'This api is only available for authenticated users',
        })
      }

      const sessions = (await auth.api.customListSessions({
        headers: headers(context.headers),
      })) as (typeof auth.$Infer.Session)['session'][]

      return {
        sessions: sessions.map((session) => ({
          ...session,
          geolocation: session.geolocation
            ? (JSON.parse(session.geolocation) as {
                city?: string
                region?: string
                country?: string
              })
            : undefined,
        })),
      }
    }),

  oauthApps: userProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/me/oauth-apps',
      tags: ['me'],
      summary: 'Get authorized OAuth apps for current user',
    })
    .handler(async ({ context }) => {
      const sqlClientIds = context.db
        .selectDistinct({
          clientId: OAuthAccessToken.clientId,
          createdAt: OAuthAccessToken.createdAt,
          updatedAt: OAuthAccessToken.updatedAt,
        })
        .from(OAuthAccessToken)
        .where(eq(OAuthAccessToken.userId, context.auth.userId))
        .orderBy(desc(OAuthAccessToken.updatedAt), desc(OAuthAccessToken.createdAt))
        .as('sqlClientIds')

      const oauthApps = (
        await context.db
          .select({
            oauthApp: OAuthApplication,
            createdAt: sqlClientIds.createdAt,
            updatedAt: sqlClientIds.updatedAt,
          })
          .from(sqlClientIds)
          .innerJoin(OAuthApplication, eq(OAuthApplication.clientId, sqlClientIds.clientId))
      ).map((a) => formatOAuthApp(a.oauthApp))

      const apps = await context.db
        .select({
          app: App,
          workspace: Workspace,
          organization: Organization,
          owner: User,
        })
        .from(App)
        .innerJoin(Workspace, eq(Workspace.id, App.workspaceId))
        .innerJoin(Organization, eq(Organization.id, Workspace.organizationId))
        .innerJoin(Member, eq(Member.organizationId, Workspace.organizationId))
        .innerJoin(User, eq(User.id, Member.userId))
        .where(
          and(
            inArray(
              App.id,
              oauthApps.map((a) => a.metadata.appId),
            ),
            eq(Member.role, 'owner'),
          ),
        )

      return {
        apps: apps.map(({ app, workspace, organization, owner }) => ({
          clientId: app.metadata.clientId!,
          access: {
            createdAt: oauthApps.find((a) => a.metadata.appId === app.id)?.createdAt,
            updatedAt: oauthApps.find((a) => a.metadata.appId === app.id)?.updatedAt,
          },
          appId: app.id,
          name: app.name,
          imageUrl: app.metadata.imageUrl,
          workspace: {
            id: workspace.id,
            name: workspace.name,
          },
          organization: {
            id: organization.id,
            name: organization.name,
          },
          owner: {
            id: owner.id,
            name: owner.name,
          },
        })),
      }
    }),

  revokeOauthApp: userProtectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/me/oauth-apps/{clientId}',
      tags: ['me'],
      summary: 'Revoke access token for a specific OAuth app',
    })
    .input(
      z.object({
        clientId: z.string().min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      await context.db.transaction(async (tx) => {
        await tx
          .delete(OAuthConsent)
          .where(
            and(
              eq(OAuthConsent.userId, context.auth.userId),
              eq(OAuthConsent.clientId, input.clientId),
            ),
          )

        await tx
          .delete(OAuthAccessToken)
          .where(
            and(
              eq(OAuthAccessToken.userId, context.auth.userId),
              eq(OAuthAccessToken.clientId, input.clientId),
            ),
          )
      })
    }),
}
