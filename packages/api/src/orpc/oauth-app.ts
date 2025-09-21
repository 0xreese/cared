import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import { auth, generateRandomString, headers } from '@cared/auth'
import { desc, eq } from '@cared/db'
import { App, OAuthAccessToken, OAuthApplication, OAuthConsent } from '@cared/db/schema'

import { OrganizationScope } from '../auth'
import { protectedProcedure, publicProcedure } from '../orpc'
import { getAppById } from './app'

/**
 * Helper function to format OAuth application data for API responses
 * @param app - The OAuth application from database
 * @param includeSecret - Whether to include the full client secret (default: false)
 * @returns Formatted OAuth application object
 */
export function formatOAuthApp(app: OAuthApplication, includeSecret = false) {
  return {
    clientId: app.clientId,
    ...(includeSecret && { clientSecret: app.clientSecret }),
    ...(!includeSecret && {
      clientSecretStart: app.clientSecret!.substring(0, 6),
    }),
    redirectUris: app.redirectURLs?.split(',').filter(Boolean) ?? [],
    disabled: app.disabled,
    metadata: app.metadata ? JSON.parse(app.metadata) : {},
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  }
}

/**
 * OAuth Application Router - Handles all OAuth application related operations
 * Includes CRUD operations for OAuth apps, secret rotation, and public info endpoints
 */
export const oauthAppRouter = {
  /**
   * List OAuth applications
   * Can list apps for a specific workspace or a specific app
   * Requires either workspaceId or appId parameter
   */
  list: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/oauth-apps',
      tags: ['oauth-apps'],
      summary: 'List all OAuth apps in a workspace or for a specific app',
    })
    .input(
      z
        .object({
          workspaceId: z.string().min(32).optional(),
          appId: z.string().min(32).optional(),
        })
        .refine((data) => data.workspaceId || data.appId, {
          message: 'Either workspaceId or appId must be provided',
        }),
    )
    .handler(async ({ context, input }) => {
      // If appId is provided, verify app ownership
      if (input.appId) {
        const app = await getAppById(context, input.appId)
        const scope = await OrganizationScope.fromApp(context, app)
        await scope.checkPermissions()

        const clientId = app.metadata.clientId
        if (!clientId) {
          return { oauthApps: [] }
        }

        const oauthApp = await context.db.query.OAuthApplication.findFirst({
          where: eq(OAuthApplication.clientId, clientId),
        })

        if (!oauthApp) {
          return { oauthApps: [] }
        }

        return {
          oauthApps: [
            {
              appId: app.id,
              oauthApp: formatOAuthApp(oauthApp),
            },
          ],
        }
      }

      // If workspaceId is provided, verify workspace ownership and list all OAuth apps
      if (input.workspaceId) {
        const scope = await OrganizationScope.fromWorkspace(context, input.workspaceId)
        await scope.checkPermissions()

        // Get all apps in the workspace
        const apps = await context.db.query.App.findMany({
          where: eq(App.workspaceId, input.workspaceId),
          orderBy: desc(App.createdAt),
        })

        // Get OAuth apps for each app
        const oauthApps = await Promise.all(
          apps.map(async (app) => {
            const clientId = app.metadata.clientId
            if (!clientId) return null

            const oauthApp = await context.db.query.OAuthApplication.findFirst({
              where: eq(OAuthApplication.clientId, clientId),
            })

            if (!oauthApp) return null

            return {
              appId: app.id,
              oauthApp: formatOAuthApp(oauthApp),
            }
          }),
        )

        // Filter out null values
        const validOauthApps = oauthApps.filter((item): item is NonNullable<typeof item> => !!item)

        return {
          oauthApps: validOauthApps,
        }
      }

      // This case should never happen due to the input validation
      return { oauthApps: [] }
    }),

  /**
   * Check if an application has an OAuth app configured
   * Returns boolean indicating existence of OAuth configuration
   */
  has: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/oauth-apps/{appId}/exists',
      tags: ['oauth-apps'],
      summary: 'Check if the application has OAuth app',
    })
    .input(z.object({ appId: z.string().min(32) }))
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.appId)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions()

      // Check if clientId exists in application metadata
      const clientId = app.metadata.clientId

      if (!clientId) {
        return { exists: false }
      }

      const oauthApp = await context.db.query.OAuthApplication.findFirst({
        where: eq(OAuthApplication.clientId, clientId),
      })

      return { exists: !!oauthApp }
    }),

  /**
   * Get OAuth application details by app ID
   * Returns full OAuth app configuration (excluding secret)
   */
  get: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/oauth-apps/{appId}',
      tags: ['oauth-apps'],
      summary: 'Get OAuth application',
    })
    .input(z.object({ appId: z.string().min(32) }))
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.appId)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions()

      // Get clientId from application metadata
      const clientId = app.metadata.clientId
      if (!clientId) {
        throw new ORPCError('NOT_FOUND', {
          message: 'OAuth app not found',
        })
      }

      const oauthApp = await context.db.query.OAuthApplication.findFirst({
        where: eq(OAuthApplication.clientId, clientId),
      })
      if (!oauthApp) {
        throw new ORPCError('NOT_FOUND', {
          message: 'OAuth app not found',
        })
      }

      return {
        oauthApp: formatOAuthApp(oauthApp),
      }
    }),

  /**
   * Get public OAuth application information by client ID
   * Public endpoint that returns basic app info for OAuth discovery
   */
  info: publicProcedure
    .route({
      method: 'GET',
      path: '/v1/oauth-apps/client/{clientId}',
      tags: ['oauth-apps'],
      summary: 'Get OAuth application info by client ID',
    })
    .input(z.object({ clientId: z.string().min(32) }))
    .handler(async ({ context, input }) => {
      // Find OAuth application by clientId
      const _oauthApp = await context.db.query.OAuthApplication.findFirst({
        where: eq(OAuthApplication.clientId, input.clientId),
      })
      if (!_oauthApp) {
        throw new ORPCError('NOT_FOUND', {
          message: 'OAuth app not found',
        })
      }
      const oauthApp = formatOAuthApp(_oauthApp)

      const app = await context.db.query.App.findFirst({
        where: eq(App.id, oauthApp.metadata.appId),
      })
      if (!app) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Associated app not found',
        })
      }

      return {
        name: app.name,
        imageUrl: app.metadata.imageUrl,
        clientId: oauthApp.clientId,
        redirectUris: oauthApp.redirectUris,
        disabled: oauthApp.disabled,
      }
    }),

  /**
   * Create a new OAuth application for an app
   * Registers OAuth app with auth service and updates app metadata
   * Returns OAuth app with full secret (only shown once)
   */
  create: protectedProcedure
    .route({
      method: 'POST',
      path: '/v1/oauth-apps',
      tags: ['oauth-apps'],
      summary: 'Create new OAuth app',
    })
    .input(
      z.object({
        appId: z.string().min(32),
        redirectUris: z
          .array(
            z
              .string()
              .url()
              .refine((uri) => uri.startsWith('http://') || uri.startsWith('https://'), {
                message: 'Redirect URI must start with http:// or https://',
              }),
          )
          .refine((uris) => new Set(uris).size === uris.length, {
            message: 'Redirect URIs must be unique',
          })
          .optional(),
        // scopes: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.appId)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions({ app: ['update'] })

      // TODO: check if the app already has an OAuth application

      const _oauthApp = await auth.api.registerOAuthApplication({
        headers: headers(context.headers),
        body: {
          redirect_uris: input.redirectUris?.map((u) => u.trim()) ?? [],
          scope: 'profile email',
          metadata: { appId: input.appId },
        },
      })

      return await context.db.transaction(async (tx) => {
        await tx
          .update(App)
          .set({
            metadata: {
              ...app.metadata,
              clientId: _oauthApp.client_id,
            },
          })
          .where(eq(App.id, app.id))
          .returning()

        const oauthApp = await tx.query.OAuthApplication.findFirst({
          where: eq(OAuthApplication.clientId, _oauthApp.client_id),
        })
        if (!oauthApp) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'Failed to create OAuth app',
          })
        }

        return {
          oauthApp: formatOAuthApp(oauthApp, true),
        }
      })
    }),

  /**
   * Update OAuth application configuration
   * Can update redirect URIs and disable/enable the app
   */
  update: protectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/oauth-apps/{appId}',
      tags: ['oauth-apps'],
      summary: 'Update OAuth application',
    })
    .input(
      z.object({
        appId: z.string().min(32),
        redirectUris: z
          .array(
            z
              .string()
              .url()
              .refine((uri) => uri.startsWith('http://') || uri.startsWith('https://'), {
                message: 'Redirect URI must start with http:// or https://',
              }),
          )
          .refine((uris) => new Set(uris).size === uris.length, {
            message: 'Redirect URIs must be unique',
          })
          .optional(),
        disabled: z.boolean().optional(),
        // scopes: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.appId)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions({ app: ['update'] })

      // Get clientId from application metadata
      const clientId = app.metadata.clientId
      if (!clientId) {
        throw new ORPCError('NOT_FOUND', {
          message: 'OAuth app not found',
        })
      }

      const oauthApp = await context.db.query.OAuthApplication.findFirst({
        where: eq(OAuthApplication.clientId, clientId),
      })
      if (!oauthApp) {
        throw new ORPCError('NOT_FOUND', {
          message: 'OAuth app not found',
        })
      }

      const [updatedOauthApp] = await context.db
        .update(OAuthApplication)
        .set({
          redirectURLs: input.redirectUris?.map((u) => u.trim()).join(','),
          disabled: input.disabled,
          updatedAt: new Date(),
        })
        .where(eq(OAuthApplication.clientId, clientId))
        .returning()

      if (!updatedOauthApp) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to update OAuth app',
        })
      }

      return {
        oauthApp: formatOAuthApp(updatedOauthApp),
      }
    }),

  /**
   * Delete OAuth application and clean up related data
   * Removes OAuth app, access tokens, consents, and updates app metadata
   */
  delete: protectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/oauth-apps/{appId}',
      tags: ['oauth-apps'],
      summary: 'Delete OAuth application',
    })
    .input(z.object({ appId: z.string().min(32) }))
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.appId)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions({ app: ['update'] })

      // Get clientId from application metadata
      const clientId = app.metadata.clientId
      if (!clientId) {
        throw new ORPCError('NOT_FOUND', {
          message: 'OAuth app not found',
        })
      }

      await context.db.transaction(async (tx) => {
        // Delete related records
        await tx.delete(OAuthConsent).where(eq(OAuthConsent.clientId, clientId))
        await tx.delete(OAuthAccessToken).where(eq(OAuthAccessToken.clientId, clientId))
        await tx.delete(OAuthApplication).where(eq(OAuthApplication.clientId, clientId))

        // Update application metadata, remove clientId
        const { clientId: _, ...restMetadata } = app.metadata
        await tx
          .update(App)
          .set({
            metadata: restMetadata,
          })
          .where(eq(App.id, app.id))
      })
    }),

  /**
   * Rotate OAuth application client secret
   * Generates new secret and returns OAuth app with new secret
   */
  rotateSecret: protectedProcedure
    .route({
      method: 'POST',
      path: '/v1/oauth-apps/{appId}/rotate-secret',
      tags: ['oauth-apps'],
      summary: 'Rotate client secret for OAuth application',
    })
    .input(z.object({ appId: z.string().min(32) }))
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.appId)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions({ app: ['update'] })

      // Get clientId from application metadata
      const clientId = app.metadata.clientId

      if (!clientId) {
        throw new ORPCError('NOT_FOUND', {
          message: 'OAuth app not found',
        })
      }

      const oauthApp = await context.db.query.OAuthApplication.findFirst({
        where: eq(OAuthApplication.clientId, clientId),
      })

      if (!oauthApp) {
        throw new ORPCError('NOT_FOUND', {
          message: 'OAuth app not found',
        })
      }

      // Generate new client secret
      const newClientSecret = generateRandomString(32, 'a-z', 'A-Z')

      // Update client secret of OAuth application
      const [updatedOauthApp] = await context.db
        .update(OAuthApplication)
        .set({
          clientSecret: newClientSecret,
          updatedAt: new Date(),
        })
        .where(eq(OAuthApplication.clientId, clientId))
        .returning()

      if (!updatedOauthApp) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to rotate client secret',
        })
      }

      return {
        oauthApp: formatOAuthApp(updatedOauthApp, true),
      }
    }),
}
