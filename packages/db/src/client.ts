import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { VercelPgDatabase } from 'drizzle-orm/vercel-postgres/driver'
import { cache } from 'react'
import { sql } from '@vercel/postgres'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { drizzle as drizzleVercel } from 'drizzle-orm/vercel-postgres'
import { Pool } from 'pg'

import { env } from './env'
import * as schema from './schema'

export type Database = PostgresJsDatabase<typeof schema> | VercelPgDatabase<typeof schema>
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export const getDb = cache(() => {
  if (globalThis.navigator.userAgent.includes('Cloudflare-Workers')) {
    const pool = new Pool({
      connectionString: env.POSTGRES_URL,
      // You don't want to reuse the same connection for multiple requests
      maxUses: 1,
    })
    return drizzlePg({
      client: pool,
      schema,
      casing: 'camelCase',
      logger: env.NODE_ENV === 'development',
    })
  } else if (env.VERCEL) {
    return drizzleVercel({
      client: sql,
      schema,
      casing: 'camelCase',
      logger: env.NODE_ENV === 'development',
    })
  } else {
    return drizzle({
      connection: {
        url: env.POSTGRES_URL,
        prepare: false,
        idle_timeout: 10,
        connect_timeout: 30,
        max_lifetime: 60 * (30 + Math.random() * 30),
      },
      schema,
      casing: 'camelCase',
      logger: env.NODE_ENV === 'development',
    })
  }
})
