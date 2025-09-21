import { getActiveOrganizationId } from '@/lib/active'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { Settings } from './settings'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  return <HydrateSettings params={params} />
}

export async function HydrateSettings({ params }: { params: Promise<{ organizationId: string }> }) {
  const { activeOrganizationId } = await getActiveOrganizationId(params)

  prefetch(
    orpc.organization.listMembers.queryOptions({
      input: {
        organizationId: activeOrganizationId,
      }
    }),
  )

  return (
    <HydrateClient>
      <Settings />
    </HydrateClient>
  )
}
