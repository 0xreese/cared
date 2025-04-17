import type { JSONValue } from 'ai'
import { z } from 'zod'

export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.record(z.string(), jsonValueSchema),
    z.array(jsonValueSchema),
  ]),
)

export const providerMetadataSchema = z.record(z.string(), z.record(z.string(), jsonValueSchema))
