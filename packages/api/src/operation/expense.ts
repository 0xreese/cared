import assert from 'assert'
import { Ratelimit } from '@upstash/ratelimit'
import { Decimal } from 'decimal.js'

import type { GenerationDetails, ModelCallOptions, TypedModelInfo } from '@cared/providers'
import { and, desc, eq, sql } from '@cared/db'
import { getDb } from '@cared/db/client'
import { Credits, Expense, Member, Organization } from '@cared/db/schema'
import { getKV } from '@cared/kv'
import { computeGenerationCost, estimateGenerationCost } from '@cared/providers'

import type { AuthObject } from '../auth'
import type { WaitUntil } from '../utils'
import { cfg } from '../config'
import { triggerAutoRechargePaymentIntent } from './credits'

const kv = getKV('expense', 'upstash')
const cache = new Map()
const freeQuotaRateLimit = new Ratelimit({
  redis: kv.redis,
  limiter: Ratelimit.fixedWindow(cfg.perUser.perDay.freeQuotaModelCalls, '1 d'),
  prefix: 'freeQuota',
  ephemeralCache: cache,
  timeout: 2000, // 2s
  analytics: false,
})

export class ExpenseManager {
  static from({
    auth,
    payerOrganizationId,
    waitUntil,
  }: {
    auth: AuthObject
    payerOrganizationId?: string
    waitUntil: WaitUntil
  }) {
    if (auth.type === 'user') {
      return new ExpenseManager({
        userId: auth.userId,
        organizationId: payerOrganizationId,
        waitUntil,
      })
    } else {
      if (payerOrganizationId) {
        throw new Error('Cannot use payerOrganizationId with non-user auth')
      }

      if (auth.type === 'appUser' || auth.scope === 'user') {
        return new ExpenseManager({
          userId: auth.userId,
          appId: auth.type === 'appUser' ? auth.appId : undefined,
          waitUntil,
        })
      } else {
        return new ExpenseManager({
          userId: auth.ownerId, // as member of organization
          organizationId: auth.organizationId,
          appId: auth.scope === 'app' ? auth.appId : undefined,
          waitUntil,
        })
      }
    }
  }

  private readonly userId: string
  private readonly organizationId?: string
  private readonly appId?: string
  private readonly waitUntil: WaitUntil

  constructor({
    userId,
    organizationId,
    appId,
    waitUntil,
  }: {
    userId: string
    organizationId?: string
    appId?: string
    waitUntil: WaitUntil
  }) {
    this.userId = userId
    this.organizationId = organizationId
    this.appId = appId
    this.waitUntil = waitUntil
  }

  private creditsCandidates?: Credits[]

  private async prepare() {
    if (this.creditsCandidates) {
      return this.creditsCandidates
    }

    this.creditsCandidates = []

    if (this.organizationId) {
      const credits = await getDb()
        .select({
          credits: Credits,
        })
        .from(Member)
        .innerJoin(Credits, eq(Credits.organizationId, Member.organizationId))
        .where(and(eq(Member.userId, this.userId), eq(Member.organizationId, this.organizationId)))
        .then((creditsArray) => creditsArray.at(0)?.credits)
      if (credits) {
        this.creditsCandidates.push(credits)
      }
    } else {
      const creditsArray: Credits[] = (
        await Promise.all([
          getDb().query.Credits.findMany({
            where: eq(Credits.userId, this.userId),
          }),
          getDb()
            .select({
              credits: Credits,
            })
            .from(Member)
            .innerJoin(Organization, eq(Member.organizationId, Organization.id))
            .innerJoin(Credits, eq(Credits.organizationId, Organization.id))
            .where(eq(Member.userId, this.userId))
            .orderBy(desc(Credits.id))
            .then((creditsArray) => creditsArray.map(({ credits }) => credits)),
        ])
      ).flat()

      this.creditsCandidates.push(...creditsArray)
    }

    return this.creditsCandidates
  }

  private hasFreeQuota_: boolean | undefined

  async hasFreeQuota() {
    // Check only once per request
    if (this.hasFreeQuota_ === undefined) {
      const { success } = await freeQuotaRateLimit.limit(this.userId)
      this.hasFreeQuota_ = success
    }
    return this.hasFreeQuota_
  }

  async canAfford(model: TypedModelInfo, callOptions: ModelCallOptions, byok?: boolean) {
    if (!model.chargeable && !byok) {
      throw new Error('Model is not chargeable')
    }

    const creditsCandidates = await this.prepare()
    if (creditsCandidates.some((credits) => new Decimal(credits.credits).isNegative())) {
      throw new Error('Negative credits')
    }

    const cost = estimateGenerationCost(model, callOptions)

    // If no cost
    if (!cost?.isPositive()) {
      if (!(await this.hasFreeQuota())) {
        throw new Error('Free quota exceeded')
      }
      return
    }

    for (const credits of creditsCandidates) {
      if (new Decimal(credits.credits).gte(cost)) {
        return
      }
    }

    throw new Error('Insufficient credits')
  }

  billGeneration(model: TypedModelInfo, details: GenerationDetails) {
    if (!model.chargeable && !details.byok) {
      throw new Error('Model is not chargeable')
    }

    this.waitUntil(async () => {
      const creditsCandidates = await this.prepare()

      if (creditsCandidates.some((credits) => new Decimal(credits.credits).isNegative())) {
        throw new Error('Negative credits')
      }

      let cost = computeGenerationCost(model, details)

      if (!cost?.isPositive()) {
        assert(this.hasFreeQuota())
        await getDb().insert(Expense).values({
          type: 'user',
          userId: this.userId,
          appId: this.appId,
          kind: 'generation',
          details,
        })

        return
      }

      // If byok, apply credits fee rate
      if (details.byok) {
        cost = cost.times(cfg.platform.creditsFeeRate).div(1 + cfg.platform.creditsFeeRate)
      }

      if (!creditsCandidates.length) {
        throw new Error('No credits available')
      }

      // Find credits with sufficient balance to fully cover the cost

      let maxCredits: Credits | undefined
      for (const credits of creditsCandidates) {
        if (!maxCredits || new Decimal(credits.credits).gt(maxCredits.credits)) {
          maxCredits = credits
        }

        if (new Decimal(credits.credits).lt(cost)) {
          continue
        }

        await getDb()
          .insert(Expense)
          .values({
            type: credits.type,
            userId: credits.type === 'user' ? credits.userId! : this.userId,
            organizationId: credits.organizationId,
            appId: this.appId,
            kind: 'generation',
            cost: cost.toString(),
            details,
          })

        const updatedCredits = (
          await getDb()
            .update(Credits)
            .set({
              credits: sql`${Credits.credits} - ${cost.toString()}`,
            })
            .where(eq(Credits.id, credits.id))
            .returning()
        ).at(0)!

        credits.credits = updatedCredits.credits

        await triggerAutoRechargePaymentIntent(updatedCredits)

        return
      }

      // All available credits have insufficient balance to fully cover the cost.
      // Use the credits with maximum balance to pay as much as possible.
      // Note that this will result in negative balance for this credits.

      assert(maxCredits, 'maxCredits should be defined if creditsCandidates is not empty')

      await getDb()
        .insert(Expense)
        .values({
          type: maxCredits.type,
          userId: maxCredits.type === 'user' ? maxCredits.userId! : this.userId,
          organizationId: maxCredits.organizationId,
          appId: this.appId,
          kind: 'generation',
          cost: cost.toString(),
          details,
        })

      const updatedCredits = (
        await getDb()
          .update(Credits)
          .set({
            credits: sql`${Credits.credits} - ${cost.toString()}`,
          })
          .where(eq(Credits.id, maxCredits.id))
          .returning()
      ).at(0)!

      maxCredits.credits = updatedCredits.credits

      await triggerAutoRechargePaymentIntent(updatedCredits)
    })
  }
}
