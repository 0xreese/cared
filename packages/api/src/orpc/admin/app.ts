import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import type { SQL } from '@cared/db'
import { and, asc, desc, eq, gt, inArray, lt } from '@cared/db'
import {
  AppsToCategories,
  AppsToTags,
  AppVersion,
  Category,
  CreateCategorySchema,
  Tag,
  UpdateCategorySchema,
} from '@cared/db/schema'

import { adminProcedure } from '../../orpc'
import { getAppById, getApps } from '../app'

export const appRouter = {
  /**
   * List all apps across all workspaces.
   * Only accessible by admin users.
   * @param input - Pagination parameters
   * @returns List of apps with hasMore flag
   */
  list: adminProcedure
    .route({
      method: 'GET',
      path: '/v1/admin/apps',
      tags: ['admin'],
      summary: 'List all apps across all workspaces',
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
        ),
    )
    .handler(async ({ context, input }) => {
      const result = await getApps(context, {
        after: input.after,
        before: input.before,
        limit: input.limit,
        order: input.order,
      })

      return {
        apps: result.apps,
        hasMore: result.hasMore,
        first: result.first,
        last: result.last,
      }
    }),

  /**
   * List all apps in a specific category across all workspaces.
   * Only accessible by admin users.
   * @param input - Object containing categoryId and pagination parameters
   * @returns List of apps in the category
   */
  listByCategory: adminProcedure
    .route({
      method: 'GET',
      path: '/v1/admin/apps/category/{categoryId}',
      tags: ['admin'],
      summary: 'List all apps in a specific category across all workspaces',
    })
    .input(
      z
        .object({
          categoryId: z.string(),
          after: z.string().optional(),
          before: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          order: z.enum(['desc', 'asc']).default('desc'),
        })
        .refine(
          ({ after, before }) => !(after && before),
          'Cannot use both after and before cursors',
        ),
    )
    .handler(async ({ context, input }) => {
      const result = await getApps(context, {
        where: eq(AppsToCategories.categoryId, input.categoryId),
        after: input.after,
        before: input.before,
        limit: input.limit,
        order: input.order,
      })

      return {
        apps: result.apps,
        hasMore: result.hasMore,
        first: result.first,
        last: result.last,
      }
    }),

  /**
   * List all apps with any of the specified tags across all workspaces.
   * Only accessible by admin users.
   * @param input - Object containing tags array and pagination parameters
   * @returns List of apps with matching tags
   */
  listByTags: adminProcedure
    .route({
      method: 'GET',
      path: '/v1/admin/apps/tags',
      tags: ['admin'],
      summary: 'List all apps with any of the specified tags across all workspaces',
    })
    .input(
      z
        .object({
          tags: z.array(z.string()).min(1).max(10),
          after: z.string().optional(),
          before: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
          order: z.enum(['desc', 'asc']).default('desc'),
        })
        .refine(
          ({ after, before }) => !(after && before),
          'Cannot use both after and before cursors',
        ),
    )
    .handler(async ({ context, input }) => {
      const result = await getApps(context, {
        where: inArray(AppsToTags.tag, input.tags),
        after: input.after,
        before: input.before,
        limit: input.limit,
        order: input.order,
      })

      return {
        apps: result.apps,
        hasMore: result.hasMore,
        first: result.first,
        last: result.last,
      }
    }),

  /**
   * List all versions of an app across all workspaces.
   * Only accessible by admin users.
   * @param input - Object containing app ID and pagination parameters
   * @returns List of app versions sorted by version number
   * @throws {ORPCError} If app not found
   */
  listVersions: adminProcedure
    .route({
      method: 'GET',
      path: '/v1/admin/apps/{id}/versions',
      tags: ['admin'],
      summary: 'List all versions of an app across all workspaces',
    })
    .input(
      z
        .object({
          id: z.string(),
          after: z.number().optional(),
          before: z.number().optional(),
          limit: z.number().min(1).max(100).default(50),
          order: z.enum(['desc', 'asc']).default('desc'),
        })
        .refine(
          ({ after, before }) => !(after && before),
          'Cannot use both after and before cursors',
        ),
    )
    .handler(async ({ context, input }) => {
      await getAppById(context, input.id)

      const conditions: SQL<unknown>[] = [eq(AppVersion.appId, input.id)]

      // Add cursor conditions based on pagination direction
      if (typeof input.after === 'number') {
        conditions.push(gt(AppVersion.version, input.after))
      }
      if (typeof input.before === 'number') {
        conditions.push(lt(AppVersion.version, input.before))
      }

      const query = and(...conditions)

      const versions = await context.db.query.AppVersion.findMany({
        where: query,
        orderBy: input.order === 'desc' ? desc(AppVersion.version) : asc(AppVersion.version),
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
   * Get a single app by ID across all workspaces.
   * Only accessible by admin users.
   * @param input - Object containing the app ID
   * @returns The app if found
   * @throws {ORPCError} If app not found
   */
  byId: adminProcedure
    .route({
      method: 'GET',
      path: '/v1/admin/apps/{id}',
      tags: ['admin'],
      summary: 'Get a single app by ID across all workspaces',
    })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const app = await getAppById(context, input.id)
      return { app }
    }),

  /**
   * Create a new category for apps.
   * Only accessible by admin users.
   * @param input - The category data following the {@link CreateCategorySchema}
   * @returns The newly created category
   */
  createCategory: adminProcedure
    .route({
      method: 'POST',
      path: '/v1/admin/categories',
      tags: ['admin'],
      summary: 'Create a new category for apps',
    })
    .input(CreateCategorySchema)
    .handler(async ({ context, input }) => {
      const category = await context.db.insert(Category).values(input).returning()
      return {
        category,
      }
    }),

  /**
   * Update an existing category.
   * Only accessible by admin users.
   * @param input - The category data following the {@link UpdateCategorySchema}
   * @returns The updated category
   * @throws {ORPCError} If category not found
   */
  updateCategory: adminProcedure
    .route({
      method: 'PUT',
      path: '/v1/admin/categories/{id}',
      tags: ['admin'],
      summary: 'Update an existing category',
    })
    .input(UpdateCategorySchema)
    .handler(async ({ context, input }) => {
      const { id, ...updates } = input
      // Find category by ID to ensure it exists
      const [existing] = await context.db
        .select()
        .from(Category)
        .where(eq(Category.id, id))
        .limit(1)

      if (!existing) {
        throw new ORPCError('NOT_FOUND', {
          message: `Category with ID ${id} not found`,
        })
      }

      // Update the category
      const updatedCategory = await context.db
        .update(Category)
        .set(updates)
        .where(eq(Category.id, id))
        .returning()

      return {
        category: updatedCategory[0],
      }
    }),

  /**
   * Delete a category by ID.
   * Only accessible by admin users.
   * @param input - Object containing the category ID
   * @throws {ORPCError} If category not found or delete fails
   */
  deleteCategory: adminProcedure
    .route({
      method: 'DELETE',
      path: '/v1/admin/categories/{id}',
      tags: ['admin'],
      summary: 'Delete a category by ID',
    })
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      // Find category by ID to ensure it exists
      const [existing] = await context.db
        .select()
        .from(Category)
        .where(eq(Category.id, input.id))
        .limit(1)

      if (!existing) {
        throw new ORPCError('NOT_FOUND', {
          message: `Category with ID ${input.id} not found`,
        })
      }

      // Delete the category
      // Note: This will fail if there are apps associated with this category due to foreign key constraints
      return context.db.transaction(async (tx) => {
        // First delete any associations in AppsToCategories table
        await tx.delete(AppsToCategories).where(eq(AppsToCategories.categoryId, input.id))

        // Then delete the category itself
        await tx.delete(Category).where(eq(Category.id, input.id))
      })
    }),

  /**
   * Delete one or more tags and remove all associations with apps.
   * Only accessible by admin users.
   * @param input - Object containing array of tag names to delete
   * @returns The number of tags deleted
   */
  deleteTags: adminProcedure
    .route({
      method: 'DELETE',
      path: '/v1/admin/tags',
      tags: ['admin'],
      summary: 'Delete one or more tags and remove all associations with apps',
    })
    .input(
      z.object({
        tags: z.array(z.string()).min(1).max(100),
      }),
    )
    .handler(async ({ context, input }) => {
      // Verify that all tags exist before attempting to delete
      const existingTags = await context.db.select().from(Tag).where(inArray(Tag.name, input.tags))

      if (existingTags.length !== input.tags.length) {
        const foundTagNames = existingTags.map((tag) => tag.name)
        const missingTags = input.tags.filter((tag) => !foundTagNames.includes(tag))

        throw new ORPCError('NOT_FOUND', {
          message: `The following tags were not found: ${missingTags.join(', ')}`,
        })
      }

      // Delete the tags and their associations in a transaction
      return context.db.transaction(async (tx) => {
        // First delete associations in AppsToTags table
        await tx.delete(AppsToTags).where(inArray(AppsToTags.tag, input.tags))

        // Then delete the tags themselves
        await tx.delete(Tag).where(inArray(Tag.name, input.tags))
      })
    }),
}
