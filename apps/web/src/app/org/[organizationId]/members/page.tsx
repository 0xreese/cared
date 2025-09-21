import { getActiveOrganizationId } from '@/lib/active'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { Members } from './members'

export const dynamic = 'force-dynamic'

export default function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  return <HydrateMembers kind="members" params={params} />
}

export async function HydrateMembers({
  kind,
  params,
}: {
  kind: 'members' | 'invitations'
  params: Promise<{ organizationId: string }>
}) {
  const { activeOrganizationId } = await getActiveOrganizationId(params)

  prefetch(
    orpc.organization.listMembers.queryOptions({
      input: {
        organizationId: activeOrganizationId,
      }
    }),
  )
  prefetch(
    orpc.organization.listInvitations.queryOptions({
      input: {
        organizationId: activeOrganizationId,
      }
    }),
  )

  return (
    <HydrateClient>
      <Members kind={kind} />
    </HydrateClient>
  )
}
