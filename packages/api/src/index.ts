import type { AppRouter } from './orpc/router'
import type { InferRouterInputs, InferRouterOutputs } from '@orpc/server'
import { authenticate } from './auth'
import { createORPCContext } from './orpc'
import appRouterContract from './orpc/contract.json'
import { appRouter } from './orpc/router'

/**
 * Inference helpers for input types
 * @example
 * type PostByIdInput = RouterInputs['post']['byId']
 *      ^? { id: number }
 **/
type RouterInputs = InferRouterInputs<AppRouter>

/**
 * Inference helpers for output types
 * @example
 * type AllPostsOutput = RouterOutputs['post']['all']
 *      ^? Post[]
 **/
type RouterOutputs = InferRouterOutputs<AppRouter>

export { createORPCContext, appRouter, appRouterContract, authenticate }
export type { AppRouter, RouterInputs, RouterOutputs }

export * from './types'
export * from './rest'
export { registerTelemetry } from './telemetry'
export type { ApiKeyMetadataInput, OptionalApiKeyMetadataInput, S3Location } from './operation'
