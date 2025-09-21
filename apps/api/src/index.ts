import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins'
import { RPCHandler } from '@orpc/server/fetch'
import { BatchHandlerPlugin, ResponseHeadersPlugin } from '@orpc/server/plugins'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { appRouter, createORPCContext, model, tasks, webhooks } from '@cared/api'
import { auth } from '@cared/auth'
import { getWebUrl } from '@cared/auth/client'

const app = new Hono()

app.use(logger())
app.use(
  '/*',
  cors({
    origin: getWebUrl(),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-orpc-batch', 'x-orpc-source'],
    credentials: true,
  }),
)

app.on(['POST', 'GET'], '/api/auth/**', (c) => auth.handler(c.req.raw))

app.get('/api/v1/model/language', model.ai.language.GET)
app.post('/api/v1/model/language', model.ai.language.POST)
app.get('/api/v1/model/image', model.ai.image.GET)
app.post('/api/v1/model/image', model.ai.image.POST)
app.get('/api/v1/model/speech', model.ai.speech.GET)
app.post('/api/v1/model/speech', model.ai.speech.POST)
app.get('/api/v1/model/transcription', model.ai.transcription.GET)
app.post('/api/v1/model/transcription', model.ai.transcription.POST)
app.get('/api/v1/model/embedding', model.ai.embedding.GET)
app.post('/api/v1/model/embedding', model.ai.embedding.POST)

app.post('/api/openai/v1/chat/completions', model.openai.chatCompletions.POST)
app.post('/api/v1/openai/chat/completions', model.openai.chatCompletions.POST)

app.post('/api/v1/webhooks/tasks/:task', tasks.POST)

app.post('/api/v1/webhooks/credits', webhooks.credits.POST)

export const rpcHandler = new RPCHandler(appRouter, {
  plugins: [
    new BatchHandlerPlugin(),
    new ResponseHeadersPlugin(),
  ],
  interceptors: [
    // eslint-disable-next-line @typescript-eslint/unbound-method
    async ({ next }) => {
      try {
        return await next()
      } catch (error) {
        console.error(error)
        throw error
      }
    },
  ],
})

export const openApiHandler = new OpenAPIHandler(appRouter, {
  interceptors: [
    // eslint-disable-next-line @typescript-eslint/unbound-method
    async ({ next }) => {
      try {
        return await next()
      } catch (error) {
        console.error(error)
        throw error
      }
    },
  ],
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
    new ResponseHeadersPlugin(),
  ],
})

app.use('/api/*', async (c, next) => {
  const context = await createORPCContext({
    headers: c.req.raw.headers,
  })

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: '/api/rpc',
    context: context,
  })

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response)
  }

  const apiResult = await openApiHandler.handle(c.req.raw, {
    prefix: '/api/openapi',
    context: context,
  })

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response)
  }

  await next()
})

export default app
