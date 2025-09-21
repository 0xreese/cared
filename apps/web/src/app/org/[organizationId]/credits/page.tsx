import { Credits } from '@/components/credits'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { addIdPrefix } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId: organizationIdNoPrefix } = await params
  const organizationId = addIdPrefix(organizationIdNoPrefix, 'org')

  prefetch(
    orpc.credits.getCredits.queryOptions({
      input: {
        organizationId,
      }
    }),
  )

  return (
    <HydrateClient>
      <Credits organizationId={organizationId} />
    </HydrateClient>
  )
}
