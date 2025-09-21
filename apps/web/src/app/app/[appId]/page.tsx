import { HydrateClient } from '@/lib/orpc'
import { addIdPrefix } from '@/lib/utils'
import { App } from './app'

export default async function Page({
  params,
}: {
  params: Promise<{
    appId: string
  }>
}) {
  const { appId: appIdNoPrefix } = await params
  const appId = addIdPrefix(appIdNoPrefix, 'app')

  return (
    <HydrateClient>
      <App appId={appId} />
    </HydrateClient>
  )
}
