import type { Context as HonoContext } from 'hono'

export enum MeasureUnit {
  MINUTES = 'm',
  SECONDS = 's',
  MILLISECONDS = 'ms',
}

/**
 * Measures the execution time of an async function
 * @param fn The async function to measure
 * @param unit The unit of time to return (minutes, seconds, or milliseconds)
 * @returns A tuple containing [executionTimeInSpecifiedUnit, result]
 */
export async function measure<T>(
  fn: (() => Promise<T>) | Promise<T>,
  unit: MeasureUnit = MeasureUnit.SECONDS,
): Promise<[number, T]> {
  const startTime = performance.now()
  const result = typeof fn === 'function' ? await fn() : await fn
  const endTime = performance.now()
  const executionTimeMs = endTime - startTime

  // Convert execution time to the specified unit
  const executionTime =
    Math.floor(
      (() => {
        switch (unit) {
          case MeasureUnit.MINUTES:
            return executionTimeMs / 60
          case MeasureUnit.SECONDS:
            return executionTimeMs
          case MeasureUnit.MILLISECONDS:
            return executionTimeMs * 1000
        }
      })(),
    ) / 1000

  return [executionTime, result]
}

export function omitUserId<
  T extends {
    userId: string
    [key: string]: any
  },
>(obj: T): Omit<T, 'userId'> {
  const { userId: _, ...rest } = obj
  return rest
}

export function stripIdPrefix(id: string) {
  return id.split('_', 2)[1] ?? ''
}

export type WaitUntil = (fn: Promise<unknown> | (() => Promise<unknown>)) => void

export function waitUntil(ctx: HonoContext): WaitUntil {
  return (fn: Promise<unknown> | (() => Promise<unknown>)) => {
    const promise = typeof fn === 'function' ? fn() : fn
    return ctx.executionCtx.waitUntil(promise)
  }
}
