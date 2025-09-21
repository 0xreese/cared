import { Tracing } from '@/components/tracing'
import { HydrateClient } from '@/lib/orpc'
import { addIdPrefix } from '@/lib/utils'

export default async function AppTracingPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId: appIdNoPrefix } = await params
  const appId = addIdPrefix(appIdNoPrefix, 'app')

  return (
    <HydrateClient>
      <Tracing scope="app" appId={appId} />
    </HydrateClient>
  )
}
