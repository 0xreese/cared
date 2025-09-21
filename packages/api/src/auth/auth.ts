import { cache } from 'react'
import { base64Url } from '@better-auth/utils/base64'
import { createHash } from '@better-auth/utils/hash'

import { auth as authApi, headers as authHeaders } from '@cared/auth'
import { eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { ApiKey, App, OAuthAccessToken, OAuthApplication, User } from '@cared/db/schema'

import type { ApiKeyAuth, ApiKeyMetadata } from '../types'

export type AuthObject =
  | {
      type: 'user'
      userId: string
      isAdmin?: boolean
    }
  | {
      type: 'appUser'
      userId: string
      appId: string
    }
  | ({
      type: 'apiKey'
      ownerId: string
    } & ApiKeyAuth)

export class Auth {
  constructor(public auth?: AuthObject) {}

  type() {
    return this.auth?.type
  }

  isAuthenticated(): boolean {
    return !!this.auth
  }

  isUser(): boolean {
    const auth = this.auth
    return (
      auth?.type === 'user' ||
      auth?.type === 'appUser' ||
      (auth?.type === 'apiKey' && auth.scope === 'user')
    )
  }

  isAdmin(): boolean {
    const auth = this.auth
    return (
      (auth?.type === 'user' && !!auth.isAdmin) ||
      (auth?.type === 'apiKey' && auth.scope === 'user' && !!auth.isAdmin)
    )
  }

  ownerId(): string | undefined {
    const auth = this.auth
    if (auth?.type === 'user' || auth?.type === 'appUser') {
      return auth.userId
    } else if (auth?.type === 'apiKey') {
      return auth.ownerId
    }
  }

  checkOrganization({ organizationId }: { organizationId: string }): boolean {
    const auth = this.auth
    return (
      auth?.type === 'user' ||
      (auth?.type === 'apiKey' &&
        auth.scope === 'organization' &&
        auth.organizationId === organizationId)
    )
  }

  checkWorkspace({
    workspaceId,
    organizationId,
  }: {
    workspaceId: string
    organizationId: string
  }): boolean {
    const auth = this.auth
    if (auth?.type === 'user') {
      return true
    }
    if (auth?.type === 'apiKey') {
      switch (auth.scope) {
        case 'workspace':
          return auth.workspaceId === workspaceId
        case 'organization':
          return auth.organizationId === organizationId
      }
    }
    return false
  }

  checkApp({
    appId,
    workspaceId,
    organizationId,
  }: {
    appId: string
    workspaceId: string
    organizationId: string
  }): boolean {
    const auth = this.auth
    if (auth?.type === 'user') {
      return true
    }
    if (auth?.type === 'apiKey') {
      switch (auth.scope) {
        case 'app':
          return auth.appId === appId
        case 'workspace':
          return auth.workspaceId === workspaceId
        case 'organization':
          return auth.organizationId === organizationId
      }
    }
    return false
  }

  by() {
    const auth = this.auth
    switch (auth?.type) {
      case 'user':
        return `${auth.userId}${auth.isAdmin ? ' (admin)' : ''}`
      case 'appUser':
        return `${auth.appId}:${auth.userId}`
      case 'apiKey':
        switch (auth.scope) {
          case 'user':
            return `${auth.userId}${auth.isAdmin ? ' (admin)' : ''} api key`
          case 'organization':
            return `${auth.organizationId} api key`
          case 'workspace':
            return `${auth.workspaceId} api key`
          case 'app':
            return `${auth.appId} api key`
        }
        break
      default:
        return 'Anonymous'
    }
  }
}

export const authenticate = cache(async (headers: Headers): Promise<Auth> => {
  const authorization = headers.get('Authorization')
  const bearerToken = authorization?.replace('Bearer ', '') ?? ''

  let apiKey = headers.get('X-API-KEY')
  if (!apiKey && bearerToken.startsWith('sk_')) {
    apiKey = bearerToken
  }

  if (apiKey) {
    // See: https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/plugins/api-key/routes/verify-api-key.ts
    const hash = await createHash('SHA-256').digest(new TextEncoder().encode(apiKey))
    const hashed = base64Url.encode(new Uint8Array(hash), {
      padding: false,
    })

    // TODO: cache
    const key = await getDb().query.ApiKey.findFirst({
      where: eq(ApiKey.key, hashed),
    })

    if (key?.metadata) {
      // NOTE: metadata is stringified twice in better-auth
      const metadata = JSON.parse(JSON.parse(key.metadata)) as ApiKeyMetadata

      const auth = {
        ...metadata,
      } as ApiKeyAuth

      if (auth.scope === 'user') {
        auth.userId = key.userId

        const user = await getDb().query.User.findFirst({
          where: eq(User.id, key.userId),
        })
        if (!user) {
          return new Auth()
        }

        auth.isAdmin = user.role === 'admin'
      }

      return new Auth({
        type: 'apiKey',
        ownerId: key.userId,
        ...auth,
      })
    }
  }

  if (bearerToken) {
    // TODO: cache
    const accessToken = await getDb().query.OAuthAccessToken.findFirst({
      where: eq(OAuthAccessToken.accessToken, bearerToken),
    })
    if (accessToken) {
      // TODO: cache
      const oauthApp = await getDb().query.OAuthApplication.findFirst({
        where: eq(OAuthApplication.clientId, accessToken.clientId!),
      })
      if (oauthApp?.metadata) {
        const appId = JSON.parse(oauthApp.metadata).appId! as string
        return new Auth({
          type: 'appUser',
          appId,
          userId: accessToken.userId!,
        })
      }
    }
  }

  const { user, session } =
    (await authApi.api.getSession({
      headers: authHeaders(headers),
    })) ?? {}
  if (!user || !session) {
    return new Auth()
  }

  {
    const appId = headers.get('X-APP-ID')
    if (appId) {
      const app = await getDb().query.App.findFirst({
        where: eq(App.id, appId),
      })
      if (!app) {
        return new Auth()
      }
      return new Auth({
        type: 'appUser',
        appId,
        userId: session.userId,
      })
    }
  }

  return new Auth({
    type: 'user',
    userId: session.userId,
    isAdmin: user.role === 'admin',
  })
})
