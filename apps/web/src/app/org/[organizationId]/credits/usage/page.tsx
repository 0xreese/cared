import { Expenses } from '@/components/expenses'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { addIdPrefix } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId: organizationIdNoPrefix } = await params
  const organizationId = addIdPrefix(organizationIdNoPrefix, 'org')

  prefetch(orpc.model.listProviders.queryOptions())
  prefetch(
    orpc.model.listModels.queryOptions({
      input: {
        organizationId,
      }
    }),
  )

  return (
    <HydrateClient>
      <Expenses organizationId={organizationId} />
    </HydrateClient>
  )
}
