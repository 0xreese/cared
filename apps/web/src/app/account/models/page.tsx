import { Models } from '@/components/models'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'

export const dynamic = 'force-dynamic'

/**
 * Models page component
 * Renders the Models component with client-side hydration
 */
export default function Page() {
  prefetch(orpc.model.listProviders.queryOptions())
  prefetch(orpc.model.listModels.queryOptions())
  prefetch(orpc.providerKey.list.queryOptions())

  return (
    <HydrateClient>
      <Models />
    </HydrateClient>
  )
}
