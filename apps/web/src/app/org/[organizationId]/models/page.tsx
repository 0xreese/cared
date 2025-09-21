import { Models } from '@/components/models'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { addIdPrefix } from '@/lib/utils'

export const dynamic = 'force-dynamic'

/**
 * Models page component
 * Renders the Models component with client-side hydration
 */
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId: orgIdNoPrefix } = await params
  const organizationId = addIdPrefix(orgIdNoPrefix, 'org')

  prefetch(orpc.model.listProviders.queryOptions())
  prefetch(
    orpc.model.listModels.queryOptions({
      input: {
        organizationId,
      }
    }),
  )
  prefetch(
    orpc.providerKey.list.queryOptions({
      input: {
        organizationId,
      }
    }),
  )

  return (
    <HydrateClient>
      <Models organizationId={organizationId} />
    </HydrateClient>
  )
}
