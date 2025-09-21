import { Suspense } from 'react'

import { ApiKeys } from '@/components/api-keys'
import { SkeletonCard } from '@/components/skeleton'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { addIdPrefix } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ApiKeyPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId: appIdNoPrefix } = await params
  const appId = addIdPrefix(appIdNoPrefix, 'app')

  prefetch(orpc.apiKey.list.queryOptions())

  return (
    <HydrateClient>
      <Suspense fallback={<SkeletonCard />}>
        <ApiKeys scope="app" appId={appId} showTitle />
      </Suspense>
    </HydrateClient>
  )
}
