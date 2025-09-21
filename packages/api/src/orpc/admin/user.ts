import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import type { SQL } from '@cared/db'
import { auth, headers } from '@cared/auth'
import { and, asc, desc, eq, gt, lt, sql } from '@cared/db'
import { user as User } from '@cared/db/schema/auth'

import { adminProcedure } from '../../orpc'

export const userRouter = {
  /**
   * List all users with optional search functionality.
   * Only accessible by admin users.
   * @param input - Object containing search query and pagination parameters
   * @returns List of users with hasMore flag
   */
  listUsers: adminProcedure
    .route({
      method: 'GET',
      path: '/v1/admin/users',
      tags: ['admin'],
      summary: 'List all users with optional search functionality',
    })
    .input(
      z
        .object({
          search: z.string().optional(),
          after: z.string().optional(),
          before: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(50),
          order: z.enum(['desc', 'asc']).default('desc'),
        })
        .refine(
          ({ after, before }) => !(after && before),
          'Cannot use both after and before cursors',
        ),
    )
    .handler(async ({ context, input }) => {
      const conditions: (SQL<unknown> | undefined)[] = []

      // Add search conditions
      if (input.search) {
        const searchTerm = `%${input.search}%`
        conditions.push(
          sql`(${User.name} ILIKE ${searchTerm} OR
                  ${User.email} ILIKE ${searchTerm}`,
        )
      }

      // Add cursor conditions based on pagination direction
      if (input.after) {
        conditions.push(gt(User.id, input.after))
      }
      if (input.before) {
        conditions.push(lt(User.id, input.before))
      }

      const query = conditions.length > 0 ? and(...conditions) : undefined

      const users = await context.db.query.User.findMany({
        where: query,
        orderBy: input.order === 'desc' ? desc(User.id) : asc(User.id),
        limit: input.limit + 1,
      })

      const hasMore = users.length > input.limit
      if (hasMore) {
        users.pop()
      }

      // Get first and last user IDs
      const first = users[0]?.id
      const last = users[users.length - 1]?.id

      return {
        users,
        hasMore,
        first,
        last,
      }
    }),

  /**
   * Get a single user by ID.
   * Only accessible by admin users.
   * @param input - The user ID
   * @returns The user if found
   * @throws {ORPCError} If user not found
   */
  getUser: adminProcedure
    .route({
      method: 'GET',
      path: '/v1/admin/users/{id}',
      tags: ['admin'],
      summary: 'Get a single user by ID',
    })
    .input(z.string())
    .handler(async ({ context, input }) => {
      const user = await context.db.query.User.findFirst({
        where: eq(User.id, input),
      })
      if (!user) {
        throw new ORPCError('NOT_FOUND', {
          message: 'User not found',
        })
      }

      return {
        user,
      }
    }),

  /**
   * Delete a user and their associated data.
   * Only accessible by admin users.
   * Deletes user from both database and auth system.
   * @param input - The user ID
   * @throws {ORPCError} If user not found or deletion fails
   */
  deleteUser: adminProcedure
    .route({
      method: 'DELETE',
      path: '/v1/admin/users/{id}',
      tags: ['admin'],
      summary: 'Delete a user and their associated data',
    })
    .input(z.string())
    .handler(async ({ context, input }) => {
      // Delete user from auth system
      await auth.api.removeUser({
        headers: headers(context.headers),
        body: {
          userId: input,
        },
      })
    }),
}
