import { Suspense } from 'react'

import { SkeletonCard } from '@/components/skeleton'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { addIdPrefix } from '@/lib/utils'
import { OAuthApp } from './oauth-app'

export const dynamic = 'force-dynamic'

export default async function Page({
  params,
}: {
  params: Promise<{
    appId: string
  }>
}) {
  const { appId: appIdNoPrefix } = await params
  const appId = addIdPrefix(appIdNoPrefix, 'app')

  prefetch(
    orpc.oauthApp.list.queryOptions({
      input: {
        appId,
      }
    }),
  )

  return (
    <HydrateClient>
      <Suspense fallback={<SkeletonCard />}>
        <OAuthApp appId={appId} />
      </Suspense>
    </HydrateClient>
  )
}
