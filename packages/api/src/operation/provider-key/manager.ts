import assert from 'assert'

import type { ModelFullId, ProviderId, ProviderKey as ProviderKeyContent } from '@cared/providers'
import { and, desc, eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { ProviderKey } from '@cared/db/schema'
import { getKV, sha1 } from '@cared/kv'
import { splitModelFullId } from '@cared/providers'

import type { AuthObject } from '../../auth'
import type { WaitUntil } from '../../utils'
import type { DeleteKeysByPrefixResult } from './lua-script'
import { decryptProviderKey } from './encryption'
import { deleteKeysByPrefixScript, providerKeysStatesScript } from './lua-script'

const scripts = {
  providerKeysStates: {
    script: providerKeysStatesScript,
    hash: 'cdb9cca42dc2700b14d40c6484e6d7f20127c27c',
  },
  deleteKeysByPrefix: {
    script: deleteKeysByPrefixScript,
    hash: '3e068d0ff69f0cab4b49cfabb519062e32a0a381',
  },
}

void Object.entries(scripts).forEach(([name, script]) => {
  void sha1(script.script).then((hash) => {
    assert.equal(hash, script.hash, `${name} hash mismatch`)
  })
})

const kv = getKV('providerKey', 'upstash')

export class ProviderKeyManager {
  constructor(
    private auth: AuthObject,
    private modelFullId: ModelFullId,
    private systemKeys: ProviderKeyState[],
    private userOrOrgKeys: ProviderKeyState[],
    private onlyByok: boolean,
    private waitUntil: WaitUntil,
  ) {}

  static async from({
    auth,
    modelId: modelFullId,
    onlyByok,
    waitUntil,
  }: {
    auth: AuthObject
    modelId: ModelFullId
    onlyByok: boolean
    waitUntil: WaitUntil
  }) {
    const { providerId } = splitModelFullId(modelFullId)

    const [systemKeysStateStr, userOrOrgKeysStateStr] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/await-thenable
      !onlyByok ? kv.redis.json.get(kv.key(systemKeysStateKey(modelFullId))) : null,
      kv.redis.json.get(kv.key(userOrOrgKeysStateKey(auth, modelFullId))),
    ])

    let systemKeysState: ProviderKeyState[] | null =
      systemKeysStateStr && JSON.parse(systemKeysStateStr as any)
    let userOrOrgKeysState: ProviderKeyState[] | null =
      userOrOrgKeysStateStr && JSON.parse(userOrOrgKeysStateStr as any)
    let shouldCacheSystemKeys = false
    let shouldCacheUserOrOrgKeys = false

    if (!systemKeysState) {
      shouldCacheSystemKeys = true

      if (!onlyByok) {
        const keys = await getDb()
          .select()
          .from(ProviderKey)
          .where(and(eq(ProviderKey.providerId, providerId), eq(ProviderKey.isSystem, true)))
          .orderBy(desc(ProviderKey.id))

        systemKeysState = keys.map((k) => ({
          ...defaultProviderKeyState(),
          id: k.id,
          byok: false,
          key: k.key,
          disabled: k.disabled,
        }))
      } else {
        systemKeysState = []
      }
    }

    if (!userOrOrgKeysState) {
      shouldCacheUserOrOrgKeys = true

      const keys = await getDb()
        .select()
        .from(ProviderKey)
        .where(
          and(
            eq(ProviderKey.providerId, providerId),
            auth.type === 'user' || auth.type === 'appUser' || auth.scope === 'user'
              ? eq(ProviderKey.userId, auth.userId)
              : eq(ProviderKey.organizationId, auth.organizationId),
          ),
        )
        .orderBy(desc(ProviderKey.id))

      userOrOrgKeysState = keys.map((k) => ({
        ...defaultProviderKeyState(),
        id: k.id,
        byok: true,
        key: k.key,
        disabled: k.disabled,
      }))
    }

    const manager = new ProviderKeyManager(
      auth,
      modelFullId,
      await Promise.all(
        systemKeysState.map(async (k) => ({
          ...k,
          key: await decryptProviderKey(k.key, true),
        })),
      ),
      await Promise.all(
        userOrOrgKeysState.map(async (k) => ({
          ...k,
          key: await decryptProviderKey(k.key, true),
        })),
      ),
      onlyByok,
      waitUntil,
    )

    if (shouldCacheSystemKeys) {
      systemKeysState.forEach((key) => {
        manager.systemKeysChanges.push({
          type: ProviderKeyChangeType.Add,
          ...key,
        })
      })
    }
    if (shouldCacheUserOrOrgKeys) {
      userOrOrgKeysState.forEach((key) => {
        manager.userOrOrgKeysChanges.push({
          type: ProviderKeyChangeType.Add,
          ...key,
        })
      })
    }
    manager.saveState()

    return manager
  }

  selectKeys() {
    const availableSystemKeys = this.systemKeys.filter((k) => !k.disabled && !k.rateLimited)
    const availableUserOrOrgKeys = this.userOrOrgKeys.filter((k) => !k.disabled && !k.rateLimited)

    if (!this.onlyByok) {
      // Combine system and user/org keys, prioritizing user/org keys
      return [
        ...this.selectKeys_(availableUserOrOrgKeys),
        ...this.selectKeys_(availableSystemKeys),
      ]
    } else {
      return this.selectKeys_(availableUserOrOrgKeys)
    }
  }

  private selectKeys_(availableKeys: ProviderKeyState[]) {
    const closedKeys = availableKeys.filter((k) => k.circuitBreaker === CircuitBreakerState.Closed)
    // If there are circuit-breaker closed keys, prefer them
    if (closedKeys.length > 0) {
      return this.sortKeys(closedKeys)
    }
    // Otherwise return all keys, ignoring circuit breaker
    return this.sortKeys(availableKeys)
  }

  private sortKeys(keys: ProviderKeyState[]) {
    return keys
      .map((key) => ({
        key,
        score: this.calculateKeyScore(key),
      }))
      .sort((a, b) => {
        // Higher score first
        if (a.score !== b.score) {
          return b.score - a.score
        }
        // When scores are equal, prioritize keys that haven't been used recently
        return a.key.lastUsedAt - b.key.lastUsedAt
      })
      .map(({ key }) => key)
  }

  private calculateKeyScore(key: ProviderKeyState) {
    const stats = this.keyStats(key)

    let score = 1
    const requests = stats.failures + stats.successes
    if (requests < minimumRequestsToEvaluate) {
      return score
    }

    const failureRate = stats.failures / Math.max(1, stats.failures + stats.successes)
    if (failureRate >= failureThreshold) {
      // Apply penalty based on how much failure rate exceeds threshold
      // Higher failure rates get progressively worse penalties
      const failurePenalty = Math.min(1, failureRate / failureThresholdToCircuitBreaker) // Cap at 100% penalty
      score *= 1 - failurePenalty
    }

    if (stats.latencyAverage >= latencyThreshold) {
      // Apply penalty based on how much average latency exceeds threshold
      // Higher latencies get progressively worse penalties
      const latencyRatio = Math.min(stats.latencyAverage / latencyThreshold, 3) // Cap at 3x threshold
      const latencyPenalty = Math.min(0.2, (latencyRatio - 1) * 0.3) // Cap at 20% penalty
      score *= 1 - latencyPenalty
    }

    if (stats.latencySpike >= latencySpikeThreshold) {
      // Apply penalty based on how much spike latency exceeds threshold
      // Higher spikes get progressively worse penalties
      const spikeRatio = Math.min(stats.latencySpike / latencySpikeThreshold, 4) // Cap at 4x threshold
      const spikePenalty = Math.min(0.1, (spikeRatio - 1) * 0.15) // Cap at 10% penalty
      score *= 1 - spikePenalty
    }

    // Ensure score doesn't go below 0.1 to maintain some diversity
    return Number(Math.max(0.1, score).toFixed(4))
  }

  private keyStats(key: ProviderKeyState) {
    // Sliding window calculation
    const percentageInPrevious = 1 - (Date.now() % window) / window
    const failuresInPreviousWindow = Math.floor(percentageInPrevious * key.previousWindow.failures)
    const failures = failuresInPreviousWindow + key.currentWindow.failures
    const successesInPreviousWindow = Math.floor(
      percentageInPrevious * key.previousWindow.successes,
    )
    const successes = successesInPreviousWindow + key.currentWindow.successes
    const latencyAverageInPreviousWindow = Math.floor(
      percentageInPrevious * key.previousWindow.latencyAverage,
    )
    const latencyAverage = latencyAverageInPreviousWindow + key.currentWindow.latencyAverage
    const latencySpike = Math.max(key.previousWindow.latencySpike, key.currentWindow.latencySpike)
    const expiredAt = key.currentWindow.expiredAt
    return {
      expiredAt,
      failures,
      successes,
      latencyAverage,
      latencySpike,
    }
  }

  private systemKeysChanges: ProviderKeyChange[] = []
  private userOrOrgKeysChanges: ProviderKeyChange[] = []

  updateState(
    key: ProviderKeyState,
    {
      key: newKey,
      disabled,
      success,
      latency,
      retryAfter,
    }: {
      key?: ProviderKeyContent
      disabled?: boolean
      success: boolean
      latency: number
      retryAfter?: string | number // seconds
    },
  ) {
    const rateLimitedUntil = parseRetryAfterToTimestamp(retryAfter)
    const rateLimited = rateLimitedUntil ? true : undefined

    // Compute circuit breaker state
    const oldStats = key.currentWindow
    const failures = oldStats.failures + Number(!success)
    const successes = oldStats.successes + Number(success)
    const failureRate = failures / Math.max(1, failures + successes)
    const circuitBreaker = failureRate >= failureThresholdToCircuitBreaker

    const update: ProviderKeyUpdate = {
      type: ProviderKeyChangeType.Update,
      id: key.id,
      key: newKey,
      disabled,
      rateLimited,
      rateLimitedUntil,
      circuitBreaker: circuitBreaker ? CircuitBreakerState.Open : undefined,
      cooldownUntil: circuitBreaker ? Date.now() + cooldownPeriod : undefined,
    }
    const updateStats: ProviderKeyStatsUpdate = {
      type: ProviderKeyChangeType.UpdateStats,
      id: key.id,
      success,
      latency,
    }

    const changes = !key.byok ? this.systemKeysChanges : this.userOrOrgKeysChanges

    if (
      update.key ||
      update.disabled !== undefined ||
      update.rateLimited !== undefined ||
      update.circuitBreaker !== undefined
    ) {
      changes.push(update)
    }
    changes.push(updateStats)
  }

  private savingPromise: Promise<any> | undefined = undefined

  saveState() {
    this.waitUntil(async () => {
      // Clear changes after saving
      const systemKeysChanges = this.systemKeysChanges
      const userOrOrgKeysChanges = this.userOrOrgKeysChanges
      this.systemKeysChanges = []
      this.userOrOrgKeysChanges = []

      if (this.savingPromise) {
        try {
          await this.savingPromise
        } catch {
          // ignore
        }
      }

      const request = {
        keyTtl,
        now: Date.now(),
        window,
      } as ProviderKeyChangeRequest

      try {
        this.savingPromise = Promise.all([
          // eslint-disable-next-line @typescript-eslint/await-thenable
          systemKeysChanges.length > 0 &&
            kv.eval(
              scripts.providerKeysStates,
              [kv.key(systemKeysStateKey(this.modelFullId))],
              [
                JSON.stringify({
                  ...request,
                  changes: systemKeysChanges,
                }),
              ],
            ),
          // eslint-disable-next-line @typescript-eslint/await-thenable
          userOrOrgKeysChanges.length > 0 &&
            kv.eval(
              scripts.providerKeysStates,
              [kv.key(userOrOrgKeysStateKey(this.auth, this.modelFullId))],
              [
                JSON.stringify({
                  ...request,
                  changes: userOrOrgKeysChanges,
                }),
              ],
            ),
        ])

        await this.savingPromise
      } finally {
        this.savingPromise = undefined
      }
    })
  }
}

export async function deleteProviderKeysStateCache({
  providerId,
  isSystem,
  userId,
  organizationId,
}: {
  providerId: ProviderId
  isSystem?: boolean | null
  userId?: string | null
  organizationId?: string | null
}) {
  return JSON.parse(
    await kv.eval(
      scripts.deleteKeysByPrefix,
      [],
      [
        kv.key(
          providerKeyStateKeyPattern({
            isSystem,
            userId,
            organizationId,
            providerId,
          }),
        ),
      ],
    ),
  ) as DeleteKeysByPrefixResult
}

const keyTtl = 24 * 60 * 60 * 1000 // 24h
const window = 60 * 1000 // 1m
const cooldownPeriod = 60 * 1000 // 1m
const minimumRequestsToEvaluate = 10
const failureThresholdToCircuitBreaker = 0.2 // 20% failures
const failureThreshold = 0.025 // 2.5% failures
const latencyThreshold = 2000 // 2s
const latencySpikeThreshold = 5000 // 5s

function defaultProviderKeyState() {
  return {
    lastUsedAt: 0,
    rateLimited: false,
    rateLimitedUntil: 0,
    circuitBreaker: 0 as const,
    cooldownUntil: 0,
    previousWindow: {
      expiredAt: 0,
      failures: 0,
      successes: 0,
      latencyAverage: 0,
      latencySpike: 0,
    },
    currentWindow: {
      expiredAt: 0,
      failures: 0,
      successes: 0,
      latencyAverage: 0,
      latencySpike: 0,
    },
  }
}

enum CircuitBreakerState {
  Closed = 0,
  Open = 1,
}

export interface ProviderKeyState {
  id: string
  byok: boolean
  key: ProviderKeyContent
  disabled: boolean

  lastUsedAt: number

  rateLimited: boolean
  rateLimitedUntil: number // Unix Epoch timestamp in ms
  circuitBreaker: CircuitBreakerState
  cooldownUntil: number // Unix Epoch timestamp in ms

  previousWindow: ProviderKeyStats
  currentWindow: ProviderKeyStats
}

export interface ProviderKeyStats {
  expiredAt: number // Unix Epoch timestamp in ms

  failures: number
  successes: number
  latencyAverage: number // average latency in ms
  latencySpike: number // max latency in ms
}

export interface ProviderKeyChangeRequest {
  keyTtl: number
  now: number
  window: number

  changes: ProviderKeyChange[]
}

export type ProviderKeyChange =
  | ProviderKeyAdd
  | ProviderKeyUpdate
  | ProviderKeyStatsUpdate
  | ProviderKeyRemove

enum ProviderKeyChangeType {
  Add,
  Update,
  UpdateStats,
  Remove,
}

export type ProviderKeyAdd = {
  type: ProviderKeyChangeType.Add
} & ProviderKeyState

export interface ProviderKeyUpdate {
  type: ProviderKeyChangeType.Update

  id: string

  key?: ProviderKeyContent
  disabled?: boolean

  rateLimited?: boolean
  rateLimitedUntil?: number
  circuitBreaker?: CircuitBreakerState
  cooldownUntil?: number
}

export interface ProviderKeyStatsUpdate {
  type: ProviderKeyChangeType.UpdateStats

  id: string
  success: boolean
  latency: number
}

export interface ProviderKeyRemove {
  type: ProviderKeyChangeType.Remove

  id: string
}

function systemKeysStateKey(modelId: ModelFullId) {
  return providerKeyStateKey({ isSystem: true, modelId })
}

function userOrOrgKeysStateKey(auth: AuthObject, modelId: ModelFullId) {
  return providerKeyStateKey({
    userId:
      auth.type === 'user' || auth.type === 'appUser' || auth.scope === 'user'
        ? auth.userId
        : undefined,
    organizationId: !(auth.type === 'user' || auth.type === 'appUser' || auth.scope === 'user')
      ? auth.organizationId
      : undefined,
    modelId,
  })
}

function providerKeyStateKey({
  isSystem,
  userId,
  organizationId,
  modelId,
}: {
  isSystem?: boolean
  userId?: string | null
  organizationId?: string | null
  modelId: ModelFullId
}) {
  if (isSystem) {
    return `system:${modelId}:state`
  } else if (userId) {
    return `${userId}:${modelId}:state`
  } else {
    return `${organizationId!}:${modelId}:state`
  }
}

function providerKeyStateKeyPattern({
  isSystem,
  userId,
  organizationId,
  providerId,
}: {
  isSystem?: boolean | null
  userId?: string | null
  organizationId?: string | null
  providerId: ProviderId
}) {
  if (isSystem) {
    return `system:${providerId}*`
  } else if (userId) {
    return `${userId}:${providerId}*`
  } else {
    return `${organizationId!}:${providerId}*`
  }
}

function parseRetryAfterToTimestamp(retryAfter?: string | number): number | undefined {
  if (!retryAfter) return undefined
  if (typeof retryAfter === 'number') return retryAfter * 1000 + Date.now()
  const parsed = parseInt(retryAfter, 10)
  if (!isNaN(parsed)) return parsed * 1000 + Date.now()
  const timestamp = new Date(retryAfter).getTime()
  if (!isNaN(timestamp) && timestamp > Date.now()) {
    return timestamp
  }
  return undefined
}
