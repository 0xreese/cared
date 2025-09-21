import { Models } from '@/components/models'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'

export const dynamic = 'force-dynamic'

/**
 * Models page component
 * Renders the Models component with client-side hydration
 */
export default function Page() {
  prefetch(orpc.model.listProviders.queryOptions())
  prefetch(
    orpc.model.listModels.queryOptions({
      input: {
        source: 'system',
      }
    }),
  )
  prefetch(
    orpc.providerKey.list.queryOptions({
      input: {
        isSystem: true,
      }
    }),
  )

  return (
    <HydrateClient>
      <Models isSystem />
    </HydrateClient>
  )
}
