import { Suspense } from 'react'

import { ApiKeys } from '@/components/api-keys'
import { SectionTitle } from '@/components/section'
import { SkeletonCard } from '@/components/skeleton'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'

export const dynamic = 'force-dynamic'

export default function UserApiKeyPage() {
  prefetch(orpc.apiKey.list.queryOptions())

  return (
    <HydrateClient>
      <SectionTitle
        title="API Keys"
        description="Configure API keys to securely control access to your account"
      />

      <Suspense fallback={<SkeletonCard />}>
        <ApiKeys scope="user" />
      </Suspense>
    </HydrateClient>
  )
}
