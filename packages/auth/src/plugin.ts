import type { BetterAuthPlugin, InferSession, Prettify } from 'better-auth'
import { createAuthMiddleware, sessionMiddleware } from 'better-auth/api'
import { parseSetCookieHeader } from 'better-auth/cookies'
import { parseSessionOutput } from 'better-auth/db'
import { createAuthEndpoint } from 'better-auth/plugins'

export const customPlugin = () => {
  return {
    id: 'custom',
    hooks: {
      after: [
        {
          matcher() {
            return true
          },
          handler: createAuthMiddleware(async (ctx) => {
            const checkOidcCookie = async (cookieName: string) => {
              const parsedSetCookieHeader = parseSetCookieHeader(
                ctx.context.responseHeaders?.get('set-cookie') ?? '',
              )
              const cookieAttributes = parsedSetCookieHeader.get(cookieName)
              if (!cookieAttributes?.value) {
                return
              }
              const value = decodeURIComponent(cookieAttributes.value)
              // Clear the original cookie
              ctx.setCookie(cookieName, '', {
                maxAge: 0,
              })

              // Remove the signature part
              const signatureStartPos = value.lastIndexOf('.')
              if (signatureStartPos < 1) {
                return
              }
              const signedValue = value.substring(0, signatureStartPos)

              // Set the new cookie
              await ctx.setSignedCookie(cookieName, signedValue, ctx.context.secret, {
                ...cookieAttributes,
                // The original cookie path doesn't work for the '/api/auth/*' post-processing from the oidc plugin. So we use '/api/auth' here.
                path: '/api/auth',
              })
            }

            await checkOidcCookie('oidc_login_prompt')
            await checkOidcCookie('oidc_consent_prompt')
          }),
        },
      ],
    },
    endpoints: {
      customListSessions: createAuthEndpoint(
        '/custom/list-sessions',
        {
          method: 'GET',
          use: [sessionMiddleware],
        },
        async (ctx) => {
          if (!ctx.context.secondaryStorage) {
            throw ctx.error('INTERNAL_SERVER_ERROR', {
              message: 'Secondary storage is not available',
            })
          }

          try {
            const currentList = (await ctx.context.secondaryStorage.get(
              `active-sessions-${ctx.context.session.user.id}`,
            )) as string | null
            if (!currentList) return []

            const list: { token: string; expiresAt: number }[] = safeJSONParse(currentList) || []
            const now = Date.now()

            const validSessions = list.filter((s) => s.expiresAt > now)
            const sessions: any[] = []

            await Promise.all(
              validSessions.map(async (session) => {
                const sessionStringified = (await ctx.context.secondaryStorage!.get(
                  session.token,
                )) as string | null
                if (sessionStringified) {
                  const s = JSON.parse(sessionStringified)
                  const parsedSession = parseSessionOutput(ctx.context.options, {
                    ...s.session,
                    expiresAt: new Date(s.session.expiresAt),
                  })
                  sessions.push(parsedSession as any)
                }
              }),
            )

            const activeSessions = sessions.filter((session) => {
              return session.expiresAt > new Date()
            })
            return ctx.json(
              activeSessions as unknown as Prettify<InferSession<typeof ctx.context.options>>[],
            )
          } catch (e: any) {
            ctx.context.logger.error(e)
            throw ctx.error('INTERNAL_SERVER_ERROR')
          }
        },
      ),
    },
  } satisfies BetterAuthPlugin
}

export function safeJSONParse<T>(data: string): T | null {
  function reviver(_: string, value: any): any {
    if (typeof value === 'string') {
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
      if (iso8601Regex.test(value)) {
        const date = new Date(value)
        if (!isNaN(date.getTime())) {
          return date
        }
      }
    }
    return value
  }

  try {
    return JSON.parse(data, reviver)
  } catch {
    return null
  }
}
