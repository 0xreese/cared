import { z } from 'zod/v4'

import type { JSONValue } from '@ai-sdk/provider'

export type { JSONValue } from '@ai-sdk/provider'

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
