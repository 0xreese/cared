import type { Context } from 'hono'

import { eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { Credits } from '@cared/db/schema'

import { authenticate } from '../../../auth'

export async function GET(c: Context): Promise<Response> {
  const a = await authenticate(c.req.raw.headers)
  if (!a.isAuthenticated()) {
    return new Response('Unauthorized', { status: 401 })
  }
  const auth = a.auth!

  const credits = await getDb().query.Credits.findFirst({
    where:
      auth.type === 'user' || auth.type === 'appUser' || auth.scope === 'user'
        ? eq(Credits.organizationId, auth.userId)
        : eq(Credits.userId, auth.organizationId),
  })
  if (!credits) {
    throw new Error('Credits not found')
  }

  return Response.json({
    data: {
      total_credits: Number(credits.credits),
      total_usage: 0,
    },
  })
}
