import { adminRouter } from './admin'
import { agentRouter } from './agent'
import { apiKeyRouter } from './api-key'
import { appRouter as appRouter_ } from './app'
import { artifactRouter } from './artifact'
import { chatRouter } from './chat'
import { creditsRouter } from './credits'
import { datasetRouter } from './dataset'
import { expenseRouter } from './expense'
import { fileRouter } from './file'
import { messageRouter } from './message'
import { modelRouter } from './model'
import { oauthAppRouter } from './oauth-app'
import { organizationRouter } from './organization'
import { providerKeyRouter } from './provider-key'
import { storageRouter } from './storage'
import { stripeRouter } from './stripe'
import { telemetryRouter } from './telemetry'
// import { tokenizerRouter } from './tokenizer'
import { userRouter } from './user'
import { workspaceRouter } from './workspace'

export const appRouter = {
  admin: adminRouter,
  organization: organizationRouter,
  workspace: workspaceRouter,
  user: userRouter,
  providerKey: providerKeyRouter,
  app: appRouter_,
  apiKey: apiKeyRouter,
  oauthApp: oauthAppRouter,
  agent: agentRouter,
  dataset: datasetRouter,
  storage: storageRouter,
  model: modelRouter,
  // tokenizer: tokenizerRouter,
  chat: chatRouter,
  message: messageRouter,
  artifact: artifactRouter,
  credits: creditsRouter,
  expense: expenseRouter,
  stripe: stripeRouter,
  telemetry: telemetryRouter,
  file: fileRouter,
}

export type AppRouter = typeof appRouter
