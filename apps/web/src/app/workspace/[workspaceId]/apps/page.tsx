import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { Apps } from './apps'

export const dynamic = 'force-dynamic'

/**
 * Apps page component
 * Renders the Apps component with client-side hydration
 */
export default function Page() {
  prefetch(orpc.app.list.queryOptions())
  prefetch(orpc.app.listCategories.queryOptions())
  prefetch(orpc.model.listProvidersModels.queryOptions())
  prefetch(orpc.model.listDefaultModels.queryOptions())

  return (
    <HydrateClient>
      <Apps />
    </HydrateClient>
  )
}
