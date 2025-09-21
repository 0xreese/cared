import type { SQL } from 'drizzle-orm'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import type { AppMetadata } from '@cared/db/schema'
import { and, asc, count, desc, eq, gt, inArray, lt, sql } from '@cared/db'
import {
  Agent,
  AgentVersion,
  App,
  AppsToCategories,
  AppsToTags,
  AppVersion,
  Category,
  CreateAgentVersionSchema,
  CreateAppSchema,
  DRAFT_VERSION,
  Member,
  Tag,
  UpdateAppSchema,
  Workspace,
} from '@cared/db/schema'
import log from '@cared/log'
import { defaultModels } from '@cared/providers'
import { mergeWithoutUndefined } from '@cared/shared'

import type { BaseContext, Context } from '../orpc'
import { OrganizationScope } from '../auth'
import { s3Client } from '../client/s3'
import { cfg } from '../config'
import { env } from '../env'
import { AppOperator, parseS3Url } from '../operation'
import { protectedProcedure, publicProcedure } from '../orpc'
import { deleteImages } from './utils'

/**
 * Get an app by ID.
 * @param ctx - The context object
 * @param id - The app ID
 * @returns The app if found
 * @throws {ORPCError} If app not found
 */
export async function getAppById(ctx: BaseContext, id: string) {
  const app = await ctx.db.query.App.findFirst({
    where: eq(App.id, id),
  })

  if (!app) {
    throw new ORPCError('NOT_FOUND', {
      message: `App with id ${id} not found`,
    })
  }

  return app
}

/**
 * Get apps with their categories and tags.
 * @param ctx - The context object
 * @param baseQuery - Query parameters including where clause and limit
 * @returns Array of apps with their associated categories and tags, hasMore flag, and first/last IDs
 */
export async function getApps(
  ctx: BaseContext,
  baseQuery: {
    where?: SQL<unknown>
    limit?: number
    after?: string
    before?: string
    order?: 'desc' | 'asc'
  },
) {
  const conditions: SQL<unknown>[] = []

  if (baseQuery.where) {
    conditions.push(baseQuery.where)
  }

  // Add cursor conditions based on pagination direction
  if (baseQuery.after) {
    conditions.push(gt(App.id, baseQuery.after))
  }
  if (baseQuery.before) {
    conditions.push(lt(App.id, baseQuery.before))
  }

  const query = conditions.length > 0 ? and(...conditions) : undefined

  // Get apps with appropriate ordering
  const apps = await ctx.db.query.App.findMany({
    where: query,
    orderBy: (baseQuery.order ?? 'desc') === 'desc' ? desc(App.id) : asc(App.id),
    limit: baseQuery.limit ? baseQuery.limit + 1 : undefined, // Get one extra to determine hasMore when limit is specified
  })

  const hasMore = !!baseQuery.limit && apps.length > baseQuery.limit
  if (hasMore) {
    apps.pop() // Remove the extra item
  }

  if (apps.length === 0) {
    return {
      apps: [],
      hasMore: false,
      first: undefined,
      last: undefined,
    }
  }

  // Get first and last IDs
  const first = apps[0]?.id
  const last = apps[apps.length - 1]?.id

  return {
    apps: await getAppsCategoriesAndTags(ctx, apps),
    hasMore,
    first,
    last,
  }
}

async function getAppsCategoriesAndTags(ctx: BaseContext, apps: App[]) {
  // Get categories for each app
  const categories = await ctx.db
    .select({
      appId: AppsToCategories.appId,
      category: {
        id: Category.id,
        name: Category.name,
      },
    })
    .from(AppsToCategories)
    .innerJoin(Category, eq(Category.id, AppsToCategories.categoryId))
    .where(
      inArray(
        AppsToCategories.appId,
        apps.map((app) => app.id),
      ),
    )

  // Get tags for each app
  const tags = await ctx.db
    .select({
      appId: AppsToTags.appId,
      tag: {
        name: Tag.name,
      },
    })
    .from(AppsToTags)
    .innerJoin(Tag, eq(Tag.name, AppsToTags.tag))
    .where(
      inArray(
        AppsToTags.appId,
        apps.map((app) => app.id),
      ),
    )

  // Organize data into a map for efficient lookup
  const appsMap = new Map(
    apps.map((app) => [
      app.id,
      {
        app,
        categories: [] as { id: string; name: string }[],
        tags: [] as string[],
      },
    ]),
  )

  // Add categories to their respective apps
  categories.forEach(({ appId, category }) => {
    appsMap.get(appId)?.categories.push(category)
  })

  // Add tags to their respective apps
  tags.forEach(({ appId, tag }) => {
    appsMap.get(appId)?.tags.push(tag.name)
  })

  return Array.from(appsMap.values())
}

/**
 * Get an app version by app ID and version.
 * @param ctx - The context object
 * @param appId - The app ID
 * @param version - The version number or 'latest' or 'draft'
 * @returns The app version if found
 * @throws {ORPCError} If app version not found
 */
export async function getAppVersion(
  ctx: Context,
  appId: string,
  version?: number | 'latest' | 'draft',
) {
  let appVersion

  if (!version) {
    version = 'latest'
  }

  if (version === 'draft') {
    appVersion = await ctx.db.query.AppVersion.findFirst({
      where: and(eq(AppVersion.appId, appId), eq(AppVersion.version, DRAFT_VERSION)),
    })
  } else if (version === 'latest') {
    appVersion = await ctx.db.query.AppVersion.findFirst({
      where: and(
        eq(AppVersion.appId, appId),
        lt(AppVersion.version, DRAFT_VERSION), // Exclude draft version
      ),
      orderBy: desc(AppVersion.version),
    })
  } else {
    appVersion = await ctx.db.query.AppVersion.findFirst({
      where: and(eq(AppVersion.appId, appId), eq(AppVersion.version, version)),
    })
  }

  if (!appVersion) {
    throw new ORPCError('NOT_FOUND', {
      message: `App version '${version}' not found for app ${appId}`,
    })
  }

  return appVersion
}

export const appRouter = {
  /**
   * List all apps in a workspace or organization.
   * Only accessible by workspace members or organization members.
   * @param input - Object containing either workspaceId or organizationId (but not both) and ordering preference
   * @returns List of apps with their categories and tags
   * @throws {ORPCError} If workspace/organization access verification fails
   */
  list: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/apps',
      tags: ['apps'],
      summary: 'List all apps in a workspace or organization',
    })
    .input(
      z
        .object({
          organizationId: z.string().min(32).optional(),
          workspaceId: z.string().min(32).optional(),
          order: z.enum(['desc', 'asc']).default('desc'),
        })
        .refine((data) => !(data.organizationId && data.workspaceId), {
          message: "Cannot provide both 'organizationId' and 'workspaceId' at the same time",
          path: ['organizationId', 'workspaceId'],
        })
        .default({
          order: 'desc',
        }),
    )
    .handler(async ({ context, input }) => {
      let appsWithCategoriesAndTags: Awaited<ReturnType<typeof getAppsCategoriesAndTags>>
      if (input.workspaceId) {
        const scope = await OrganizationScope.fromWorkspace(context, input.workspaceId)
        await scope.checkPermissions()

        const { apps } = await getApps(context, {
          where: eq(App.workspaceId, input.workspaceId),
          order: input.order,
        })
        appsWithCategoriesAndTags = apps
      } else if (input.organizationId) {
        const scope = OrganizationScope.fromOrganization(context, input.organizationId)
        await scope.checkPermissions()

        // When organizationId is provided, we need to find apps in workspaces belonging to that organization
        const apps = await context.db
          .select({
            app: App,
          })
          .from(App)
          .innerJoin(Workspace, eq(Workspace.id, App.workspaceId))
          .where(eq(Workspace.organizationId, input.organizationId))
          .orderBy(input.order === 'desc' ? desc(App.id) : asc(App.id))

        appsWithCategoriesAndTags = await getAppsCategoriesAndTags(
          context,
          apps.map(({ app }) => app),
        )
      } else {
        const auth = context.auth.auth
        if (auth?.type !== 'user') {
          throw new ORPCError('FORBIDDEN')
        }

        const apps = await context.db
          .select({
            app: App,
          })
          .from(App)
          .innerJoin(Workspace, eq(Workspace.id, App.workspaceId))
          .innerJoin(Member, eq(Member.organizationId, Workspace.organizationId))
          .where(eq(Member.userId, auth.userId))
          .orderBy(input.order === 'desc' ? desc(App.id) : asc(App.id))

        appsWithCategoriesAndTags = await getAppsCategoriesAndTags(
          context,
          apps.map(({ app }) => app),
        )
      }

      return {
        apps: appsWithCategoriesAndTags,
      }
    }),

  /**
   * List all apps in a specific category within a workspace.
   * Only accessible by workspace members.
   * @param input - Object containing workspaceId, categoryId and ordering preference
   * @returns List of apps in the category
   * @throws {ORPCError} If workspace access verification fails
   */
  listByCategory: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/apps/by-category/{categoryId}',
      tags: ['apps'],
      summary: 'List all apps in a specific category within a workspace',
    })
    .input(
      z.object({
        workspaceId: z.string().min(32),
        categoryId: z.string(),
        order: z.enum(['desc', 'asc']).default('desc'),
      }),
    )
    .handler(async ({ context, input }) => {
      const scope = await OrganizationScope.fromWorkspace(context, input.workspaceId)
      await scope.checkPermissions()

      const result = await getApps(context, {
        where: and(
          eq(App.workspaceId, input.workspaceId),
          eq(AppsToCategories.categoryId, input.categoryId),
        ),
        order: input.order,
      })

      return {
        apps: result.apps,
      }
    }),

  /**
   * List all apps with any of the specified tags in a workspace.
   * Only accessible by workspace members.
   * @param input - Object containing workspaceId, tags array and ordering preference
   * @returns List of apps with matching tags
   * @throws {ORPCError} If workspace access verification fails
   */
  listByTags: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/apps/by-tags',
      tags: ['apps'],
      summary: 'List all apps with any of the specified tags in a workspace',
    })
    .input(
      z.object({
        workspaceId: z.string().min(32),
        tags: z.array(z.string()).min(1).max(20),
        order: z.enum(['desc', 'asc']).default('desc'),
      }),
    )
    .handler(async ({ context, input }) => {
      const scope = await OrganizationScope.fromWorkspace(context, input.workspaceId)
      await scope.checkPermissions()

      const result = await getApps(context, {
        where: and(eq(App.workspaceId, input.workspaceId), inArray(AppsToTags.tag, input.tags)),
        order: input.order,
      })

      return {
        apps: result.apps,
      }
    }),

  /**
   * List all versions of an app.
   * Only accessible by workspace members.
   * @param input - Object containing app ID and pagination parameters
   * @returns List of app versions sorted by version number
   * @throws {ORPCError} If app not found or access verification fails
   */
  listVersions: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/apps/{id}/versions',
      tags: ['apps'],
      summary: 'List all versions of an app',
    })
    .input(
      z.object({
        id: z.string(),
        after: z.number().optional(),
        before: z.number().optional(),
        limit: z.number().min(1).max(100).default(50),
        order: z.enum(['desc', 'asc']).default('desc'),
      }),
    )
    .handler(async ({ context, input }) => {
      const scope = await OrganizationScope.fromApp(context, input.id)
      await scope.checkPermissions()

      const conditions: SQL<unknown>[] = [eq(AppVersion.appId, input.id)]

      if (typeof input.after === 'number') {
        conditions.push(gt(AppVersion.version, input.after))
      }
      if (typeof input.before === 'number') {
        conditions.push(lt(AppVersion.version, input.before))
      }

      const versions = await context.db.query.AppVersion.findMany({
        where: and(...conditions),
        orderBy: input.order === 'desc' ? desc(AppVersion.version) : AppVersion.version,
        limit: input.limit + 1,
      })

      const hasMore = versions.length > input.limit
      if (hasMore) {
        versions.pop()
      }

      // Get first and last version numbers
      const first = versions[0]?.version
      const last = versions[versions.length - 1]?.version

      return {
        versions,
        hasMore,
        first,
        last,
      }
    }),

  /**
   * Get a single app by ID.
   * Only accessible by workspace members.
   * @param input - The app ID
   * @returns The app if found
   * @throws {ORPCError} If app not found or access verification fails
   */
  byId: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/apps/{id}',
      tags: ['apps'],
      summary: 'Get a single app by ID',
    })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.id)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions()
      return { app }
    }),

  /**
   * Get a specific version of an app.
   * Only accessible by workspace members.
   * @param input - Object containing app ID and version number
   * @returns The app version if found
   * @throws {ORPCError} If app version not found or access verification fails
   */
  getVersion: protectedProcedure
    .route({
      method: 'GET',
      path: '/v1/apps/{id}/versions/{version}',
      tags: ['apps'],
      summary: 'Get a specific version of an app',
    })
    .input(
      z.object({
        id: z.string(),
        version: z.number(),
      }),
    )
    .handler(async ({ context, input }) => {
      const scope = await OrganizationScope.fromApp(context, input.id)
      await scope.checkPermissions()

      const version = await context.db.query.AppVersion.findFirst({
        where: and(eq(AppVersion.appId, input.id), eq(AppVersion.version, input.version)),
      })

      if (!version) {
        throw new ORPCError('NOT_FOUND', {
          message: `Version ${input.version} of app ${input.id} not found`,
        })
      }

      return { version }
    }),

  /**
   * Create a new app in a workspace.
   * Only accessible by workspace members.
   * @param input - The app data following the {@link CreateAppSchema}
   * @returns The created app and its draft version
   * @throws {ORPCError} If app creation fails
   */
  create: protectedProcedure
    .route({
      method: 'POST',
      path: '/v1/apps',
      tags: ['apps'],
      summary: 'Create a new app in a workspace',
    })
    .input(CreateAppSchema)
    .handler(async ({ context, input }) => {
      const scope = await OrganizationScope.fromWorkspace(context, input.workspaceId)
      await scope.checkPermissions({ app: ['create'] })

      // Validate imageUrl if provided
      if (input.metadata.imageUrl) {
        const parsedUrl = parseS3Url(input.metadata.imageUrl)
        if (parsedUrl === false) {
          throw new ORPCError('BAD_REQUEST', {
            message: 'Invalid S3 image URL format',
          })
        } else if (parsedUrl) {
          if (parsedUrl.type !== 'workspace' || parsedUrl.workspaceId !== input.workspaceId) {
            throw new ORPCError('BAD_REQUEST')
          }
          // Check if file exists in S3 storage
          try {
            const url = new URL(input.metadata.imageUrl)
            const key = url.pathname.slice(1) // Remove leading slash

            await s3Client.send(
              new HeadObjectCommand({
                Bucket: env.S3_BUCKET,
                Key: key,
              }),
            )
          } catch (error) {
            log.error('Image file not found or cannot be accessed', error)
            throw new ORPCError('BAD_REQUEST', {
              message: 'Image file not found or cannot be accessed',
            })
          }
        }
      }

      const appValues = {
        ...input,
        metadata: mergeWithoutUndefined<AppMetadata>(defaultModels.app, input.metadata),
      }

      return context.db.transaction(async (tx) => {
        // Check if workspace has reached the maximum app limit
        const appsCount = await tx
          .select({ count: count() })
          .from(App)
          .where(eq(App.workspaceId, input.workspaceId))
          .then((r) => r[0]!.count)

        if (appsCount >= cfg.perWorkspace.maxApps) {
          throw new ORPCError('FORBIDDEN', {
            message: `Workspace has reached the maximum limit of ${cfg.perWorkspace.maxApps} applications`,
          })
        }

        const [app] = await tx.insert(App).values(appValues).returning()

        if (!app) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'Failed to create app',
          })
        }

        const appVersionValues = {
          appId: app.id,
          version: DRAFT_VERSION,
          type: app.type,
          name: app.name,
          metadata: app.metadata,
        }

        const [draft] = await tx.insert(AppVersion).values(appVersionValues).returning()

        if (!draft) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'Failed to create draft version',
          })
        }

        return {
          app,
          draft,
        }
      })
    }),

  /**
   * Update an existing app.
   * Only updates the draft version.
   * Only accessible by workspace members.
   * @param input - The app data following the {@link UpdateAppSchema}
   * @returns The updated app and its draft version
   * @throws {ORPCError} If app update fails
   */
  update: protectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/apps/{id}',
      tags: ['apps'],
      summary: 'Update an existing app',
    })
    .input(UpdateAppSchema)
    .handler(async ({ context, input }) => {
      const { id, ...update } = input
      const app = await getAppById(context, id)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions({ app: ['update'] })

      const draft = await getAppVersion(context, id, 'draft')
      // Check if there's any published version
      const publishedVersion = await getAppVersion(context, id, 'latest').catch(() => undefined)

      const imagesToDelete = []

      // Validate imageUrl if it was updated
      if (update.metadata?.imageUrl && update.metadata.imageUrl !== draft.metadata.imageUrl) {
        if (draft.metadata.imageUrl) {
          imagesToDelete.push(draft.metadata.imageUrl)
        }

        const parsedUrl = parseS3Url(update.metadata.imageUrl)
        if (parsedUrl === false) {
          throw new ORPCError('BAD_REQUEST', {
            message: 'Invalid S3 image URL format',
          })
        } else if (parsedUrl) {
          if (
            (parsedUrl.type !== 'workspace' || parsedUrl.workspaceId !== app.workspaceId) &&
            (parsedUrl.type !== 'app' || parsedUrl.appId !== app.id)
          ) {
            throw new ORPCError('BAD_REQUEST')
          }

          // Check if file exists in S3 storage
          try {
            const url = new URL(update.metadata.imageUrl)
            const key = url.pathname.slice(1) // Remove leading slash

            await s3Client.send(
              new HeadObjectCommand({
                Bucket: env.S3_BUCKET,
                Key: key,
              }),
            )
          } catch (error) {
            log.error('Image file not found or cannot be accessed', error)
            throw new ORPCError('BAD_REQUEST', {
              message: 'Image file not found or cannot be accessed',
            })
          }
        }
      }

      const updateValues = {
        ...update,
        // Merge new metadata with existing metadata
        metadata: mergeWithoutUndefined<AppMetadata>(draft.metadata, update.metadata),
      }

      const result = await context.db.transaction(async (tx) => {
        // Update draft version
        const [updatedDraft] = await tx
          .update(AppVersion)
          .set(updateValues)
          .where(and(eq(AppVersion.appId, id), eq(AppVersion.version, DRAFT_VERSION)))
          .returning()

        if (!updatedDraft) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'Failed to update draft version',
          })
        }

        // If no published version exists, update the app's main record as well
        let updatedApp = app
        if (!publishedVersion) {
          if (
            update.metadata?.imageUrl &&
            app.metadata.imageUrl &&
            update.metadata.imageUrl !== app.metadata.imageUrl
          ) {
            imagesToDelete.push(app.metadata.imageUrl)
          }

          const [newApp] = await tx.update(App).set(updateValues).where(eq(App.id, id)).returning()

          if (!newApp) {
            throw new ORPCError('INTERNAL_SERVER_ERROR', {
              message: 'Failed to update app',
            })
          }
          updatedApp = newApp
        }

        return {
          app: updatedApp,
          draft: updatedDraft,
        }
      })

      await deleteImages(imagesToDelete)

      return result
    }),

  /**
   * Delete an app.
   * Only accessible by workspace members.
   * Also deletes all related category and tag associations.
   * Also deletes all related agents and their versions.
   * @param input - The app ID
   * @returns Success status
   * @throws {ORPCError} If app deletion fails
   */
  delete: protectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/apps/{id}',
      tags: ['apps'],
      summary: 'Delete an app',
    })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const scope = await OrganizationScope.fromApp(context, input.id)
      await scope.checkPermissions({ app: ['delete'] })

      const app = await context.db.query.App.findFirst({
        where: eq(App.id, input.id),
        columns: { id: true },
      })
      if (!app) {
        throw new ORPCError('NOT_FOUND', {
          message: `App not found`,
        })
      }

      const operator = new AppOperator(context, app.id)

      await operator.delete()
    }),

  /**
   * Publish an app version.
   * Creates a new published version while keeping the draft version.
   * Updates the app's main record to match the published version.
   * Also publishes all associated agents.
   * @param input - The app ID
   * @returns The updated app and new version number
   * @throws {ORPCError} If publishing fails
   */
  publish: protectedProcedure
    .route({
      method: 'POST',
      path: '/v1/apps/{id}/publish',
      tags: ['apps'],
      summary: 'Publish an app version',
    })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.id)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions({ app: ['publish'] })
      const draftVersion = await getAppVersion(context, input.id, 'draft')

      return context.db.transaction(async (tx) => {
        // Create new published version with current timestamp
        const publishedVersion = Math.floor(Date.now() / 1000)

        await tx.insert(AppVersion).values({
          appId: input.id,
          version: publishedVersion,
          type: draftVersion.type,
          name: draftVersion.name,
          metadata: draftVersion.metadata,
        })

        // Update the app's main record to match the published version
        const [updatedApp] = await tx
          .update(App)
          .set({
            type: draftVersion.type,
            name: draftVersion.name,
            metadata: draftVersion.metadata,
          })
          .where(eq(App.id, input.id))
          .returning()

        // Get all agents and their draft versions for this app in one query
        const agentsWithDrafts = await tx
          .select({
            agent: Agent,
            draft: AgentVersion,
          })
          .from(Agent)
          .innerJoin(
            AgentVersion,
            and(eq(AgentVersion.agentId, Agent.id), eq(AgentVersion.version, DRAFT_VERSION)),
          )
          .where(eq(Agent.appId, input.id))

        // Get total number of agents for this app
        const agentsCount = await tx
          .select({ count: count() })
          .from(Agent)
          .where(eq(Agent.appId, input.id))

        // Check if any agent is missing a draft version
        if (agentsWithDrafts.length !== agentsCount[0]!.count) {
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: 'Some agents are missing draft versions',
          })
        }

        if (agentsWithDrafts.length > 0) {
          // Bulk insert new published versions
          await tx.insert(AgentVersion).values(
            agentsWithDrafts.map((item) =>
              CreateAgentVersionSchema.parse({
                agentId: item.agent.id,
                version: publishedVersion,
                name: item.draft.name,
                metadata: item.draft.metadata,
              }),
            ),
          )

          // Build CASE expressions for name and metadata updates
          const nameCaseChunks: SQL[] = []
          const metadataCaseChunks: SQL[] = []
          const agentIds: string[] = []

          nameCaseChunks.push(sql`(case`)
          metadataCaseChunks.push(sql`(case`)

          for (const item of agentsWithDrafts) {
            nameCaseChunks.push(sql`when
            ${Agent.id}
            =
            ${item.agent.id}
            then
            ${item.draft.name}`)
            metadataCaseChunks.push(
              sql`when
              ${Agent.id}
              =
              ${item.agent.id}
              then
              ${item.draft.metadata}`,
            )
            agentIds.push(item.agent.id)
          }

          nameCaseChunks.push(sql`end
          )`)
          metadataCaseChunks.push(sql`end
          )`)

          const nameCase = sql.join(nameCaseChunks, sql.raw(' '))
          const metadataCase = sql.join(metadataCaseChunks, sql.raw(' '))

          // Update all agents in a single query
          await tx
            .update(Agent)
            .set({
              name: nameCase,
              metadata: metadataCase,
            })
            .where(inArray(Agent.id, agentIds))
        }

        return {
          app: updatedApp,
          version: publishedVersion,
        }
      })
    }),

  /**
   * List all tags.
   * Accessible by any user.
   * @param input - Pagination parameters
   * @returns List of tags
   * @throws {ORPCError} If tag retrieval fails
   */
  listTags: publicProcedure
    .route({
      method: 'GET',
      path: '/v1/tags',
      tags: ['tags'],
      summary: 'List all tags',
    })
    .input(
      z
        .object({
          after: z.string().optional(),
          before: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          order: z.enum(['desc', 'asc']).default('desc'),
        })
        .refine(
          ({ after, before }) => !(after && before),
          'Cannot use both after and before cursors',
        )
        .default({ limit: 50, order: 'desc' }),
    )
    .handler(async ({ context, input }) => {
      const conditions: SQL<unknown>[] = []

      // Add cursor conditions based on pagination direction
      if (input.after) {
        conditions.push(gt(Tag.name, input.after))
      }
      if (input.before) {
        conditions.push(lt(Tag.name, input.before))
      }

      const query = conditions.length > 0 ? and(...conditions) : undefined

      const tags = await context.db.query.Tag.findMany({
        where: query,
        orderBy: input.order === 'desc' ? desc(Tag.name) : asc(Tag.name),
        limit: input.limit + 1,
      })

      const hasMore = tags.length > input.limit
      if (hasMore) {
        tags.pop()
      }

      // Get first and last tag names from the result
      const first = tags[0]?.name
      const last = tags[tags.length - 1]?.name

      return {
        tags,
        hasMore,
        first,
        last,
      }
    }),

  /**
   * Update tags for an app.
   * Replaces all existing tags with the new ones.
   * Only accessible by workspace members.
   * @param input - Object containing app ID and new tags array
   * @returns The updated tags
   * @throws {ORPCError} If tag update fails
   */
  updateTags: protectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/apps/{id}/tags',
      tags: ['apps'],
      summary: 'Update tags for an app',
    })
    .input(
      z.object({
        id: z.string(),
        tags: z.array(z.string()).max(20, 'Maximum 20 tags allowed'),
      }),
    )
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.id)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions({ app: ['update'] })

      return context.db.transaction(async (tx) => {
        // Delete all existing tags
        await tx.delete(AppsToTags).where(eq(AppsToTags.appId, input.id))

        // Insert new tags if any
        if (input.tags.length > 0) {
          // Ensure all tags exist
          await tx
            .insert(Tag)
            .values(input.tags.map((name) => ({ name })))
            .onConflictDoNothing()

          // Associate tags with app
          await tx.insert(AppsToTags).values(input.tags.map((tag) => ({ appId: input.id, tag })))
        }

        const tags = await tx
          .select({
            tag: Tag,
          })
          .from(AppsToTags)
          .innerJoin(Tag, eq(Tag.name, AppsToTags.tag))
          .where(eq(AppsToTags.appId, input.id))
          .limit(5)

        return {
          tags: tags.map((r) => r.tag),
        }
      })
    }),

  /**
   * List all categories.
   * Accessible by any user.
   * @param input - Pagination parameters
   * @returns List of categories
   * @throws {ORPCError} If category retrieval fails
   */
  listCategories: publicProcedure
    .route({
      method: 'GET',
      path: '/v1/categories',
      tags: ['categories'],
      summary: 'List all categories',
    })
    .input(
      z
        .object({
          after: z.string().optional(),
          before: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          order: z.enum(['desc', 'asc']).default('desc'),
        })
        .refine(
          ({ after, before }) => !(after && before),
          'Cannot use both after and before cursors',
        )
        .default({ limit: 50, order: 'desc' }),
    )
    .handler(async ({ context, input }) => {
      const conditions: SQL<unknown>[] = []

      // Add cursor conditions based on pagination direction
      if (input.after) {
        conditions.push(gt(Category.id, input.after))
      }
      if (input.before) {
        conditions.push(lt(Category.id, input.before))
      }

      const query = conditions.length > 0 ? and(...conditions) : undefined

      const categories = await context.db.query.Category.findMany({
        where: query,
        orderBy: input.order === 'desc' ? desc(Category.id) : asc(Category.id),
        limit: input.limit + 1,
      })

      const hasMore = categories.length > input.limit
      if (hasMore) {
        categories.pop()
      }

      // Get first and last category IDs
      const first = categories[0]?.id
      const last = categories[categories.length - 1]?.id

      return {
        categories,
        hasMore,
        first,
        last,
      }
    }),

  /**
   * Update app categories.
   * Add and/or remove categories for an app.
   * Only accessible by workspace members.
   * @param input - Object containing app ID, categories to add and/or remove
   * @returns The updated categories
   * @throws {ORPCError} If category update fails
   */
  updateCategories: protectedProcedure
    .route({
      method: 'PATCH',
      path: '/v1/apps/{id}/categories',
      tags: ['apps'],
      summary: 'Update app categories',
    })
    .input(
      z.object({
        id: z.string(),
        add: z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.id)
      const scope = await OrganizationScope.fromApp(context, app)
      await scope.checkPermissions({ app: ['update'] })

      // Check for same category IDs in both add and remove arrays
      if (input.add?.length && input.remove?.length) {
        const intersection = input.add.filter((id) => input.remove?.includes(id))
        if (intersection.length > 0) {
          throw new ORPCError('BAD_REQUEST', {
            message: `Cannot add and remove the same categories: ${intersection.join(', ')}`,
          })
        }
      }

      return context.db.transaction(async (tx) => {
        // Get current categories count
        const currentCategories = await tx
          .select({ categoryId: AppsToCategories.categoryId })
          .from(AppsToCategories)
          .where(eq(AppsToCategories.appId, input.id))

        // Get existing category IDs
        const existingCategoryIds = currentCategories.map((c) => c.categoryId)

        // Ensure categories to remove exist
        if (input.remove?.length) {
          const nonExistingCategories = input.remove.filter(
            (id) => !existingCategoryIds.includes(id),
          )
          if (nonExistingCategories.length > 0) {
            throw new ORPCError('BAD_REQUEST', {
              message: `The following categories do not exist: ${nonExistingCategories.join(', ')}`,
            })
          }
        }

        // Ensure categories to add don't already exist
        if (input.add?.length) {
          const alreadyExistingCategories = input.add.filter((id) =>
            existingCategoryIds.includes(id),
          )
          if (alreadyExistingCategories.length > 0) {
            throw new ORPCError('BAD_REQUEST', {
              message: `The following categories already exist: ${alreadyExistingCategories.join(', ')}`,
            })
          }
        }

        // Calculate potential new count
        const removeCategoryIds = input.remove ?? []
        const addCategoryIds = input.add ?? []

        // Calculate new count after removing and adding
        const newCategoryCount =
          currentCategories.length - removeCategoryIds.length + addCategoryIds.length

        // Check if new count exceeds the maximum limit
        if (newCategoryCount > 20) {
          throw new ORPCError('BAD_REQUEST', {
            message: 'Maximum 20 categories allowed per app',
          })
        }

        // Remove categories if specified
        if (input.remove?.length) {
          await tx
            .delete(AppsToCategories)
            .where(
              and(
                eq(AppsToCategories.appId, input.id),
                inArray(AppsToCategories.categoryId, input.remove),
              ),
            )
        }

        // Add categories if specified
        if (input.add?.length) {
          await tx
            .insert(AppsToCategories)
            .values(
              input.add.map((categoryId) => ({
                appId: input.id,
                categoryId,
              })),
            )
            .onConflictDoNothing()
        }

        // Return updated categories
        const updatedCategories = await tx
          .select({
            category: {
              id: Category.id,
              name: Category.name,
            },
          })
          .from(AppsToCategories)
          .innerJoin(Category, eq(Category.id, AppsToCategories.categoryId))
          .where(eq(AppsToCategories.appId, input.id))

        return {
          categories: updatedCategories.map((r) => r.category),
        }
      })
    }),
}
