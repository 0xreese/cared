import { ORPCError, os } from '@orpc/server'

import type { Database } from '@cared/db/client'
import { getDb } from '@cared/db/client'

import type { Auth } from './auth'
import type { ResponseHeadersPluginContext } from '@orpc/server/plugins'
import { authenticate } from './auth'
import { env } from './env'

export interface BaseContext extends ResponseHeadersPluginContext {
  db: Database
  headers: Headers
}

export type Context = BaseContext & {
  auth: Auth
}

export const createORPCContext = async ({ headers }: { headers: Headers }): Promise<Context> => {
  const auth = await authenticate(headers)

  console.log('>>> oRPC Request from', headers.get('x-orpc-source') ?? 'unknown', 'by', auth.by())

  return {
    auth,
    db: getDb(),
    headers,
  }
}

const o = os.$context<Context>()

const timingMiddleware = o.middleware(async ({ next, path }) => {
  const start = performance.now()

  // Check if we're in development mode
  const isDev = env.NODE_ENV === 'development'
  if (isDev) {
    // artificial delay in dev 100-500ms
    const waitMs = Math.floor(Math.random() * 400) + 100
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }

  const result = await next()

  const end = performance.now()
  console.log(`[ORPC] ${String(path)} took ${Math.floor(end - start)}ms to execute`)

  return result
})

export const publicProcedure = o.use(timingMiddleware)

export const protectedProcedure = o.use(timingMiddleware).use(({ context, next }) => {
  if (!context.auth.isAuthenticated()) {
    throw new ORPCError('UNAUTHORIZED')
  }
  return next()
})

export type UserContext = BaseContext & {
  auth: {
    userId: string
    isAdmin?: boolean
    useApiKey: boolean
  }
}

export const userProtectedProcedure = o
  .use(timingMiddleware)
  // @ts-ignore
  .use<UserContext>(({ context, next }) => {
    const auth = context.auth.auth
    if (!(auth?.type === 'user' || (auth?.type === 'apiKey' && auth.scope === 'user'))) {
      throw new ORPCError('UNAUTHORIZED')
    }
    return next({
      context: {
        auth: {
          userId: auth.userId,
          isAdmin: auth.isAdmin,
          useApiKey: auth.type === 'apiKey',
        },
      },
    })
  })

export const userPlainProtectedProcedure = userProtectedProcedure.use(({ context, next }) => {
  if (context.auth.useApiKey) {
    throw new ORPCError('UNAUTHORIZED')
  }
  return next()
})

export type AppContext = BaseContext & {
  auth: {
    appId: string
  }
}

export const appProtectedProcedure = o
  .use(timingMiddleware)
  // @ts-ignore
  .use<AppContext>(({ context, next }) => {
    const auth = context.auth.auth
    if (auth?.type !== 'apiKey' || auth.scope !== 'app') {
      throw new ORPCError('UNAUTHORIZED')
    }
    return next({
      context: {
        auth: {
          appId: auth.appId,
        },
      },
    })
  })

export type AppUserContext = BaseContext & {
  auth: {
    appId: string
    userId: string
  }
}

export const appUserProtectedProcedure = o
  .use(timingMiddleware)
  // @ts-ignore
  .use<AppUserContext>(({ context, next }) => {
    const auth = context.auth.auth
    if (auth?.type !== 'appUser') {
      throw new ORPCError('UNAUTHORIZED')
    }
    return next({
      context: {
        auth: {
          appId: auth.appId,
          userId: auth.userId,
        },
      },
    })
  })

export type UserOrAppUserContext = BaseContext & {
  auth: {
    userId: string
    appId?: string
    isAdmin?: boolean
  }
}

export const userOrAppUserProtectedProcedure = o
  .use(timingMiddleware)
  // @ts-ignore
  .use<UserOrAppUserContext>(({ context, next }) => {
    const auth = context.auth.auth
    if (!(auth?.type === 'user' || auth?.type === 'appUser')) {
      throw new ORPCError('UNAUTHORIZED')
    }
    return next({
      context: {
        auth: {
          userId: auth.userId,
          appId: auth.type === 'appUser' ? auth.appId : undefined,
          isAdmin: auth.type === 'user' && auth.isAdmin,
        },
      },
    })
  })

export type AdminContext = BaseContext & {
  auth: {
    userId: string
  }
}

// @ts-ignore
export const adminProcedure = o.use(timingMiddleware).use<AdminContext>(({ context, next }) => {
  const auth = context.auth.auth
  if (!(auth?.type === 'user' || (auth?.type === 'apiKey' && auth.scope === 'user'))) {
    throw new ORPCError('UNAUTHORIZED')
  }
  if (!auth.isAdmin) {
    throw new ORPCError('FORBIDDEN')
  }
  return next({
    context: {
      auth: {
        userId: auth.userId,
      },
    },
  })
})
