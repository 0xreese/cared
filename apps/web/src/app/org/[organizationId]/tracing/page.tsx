import { TracingWithSelector } from '@/components/tracing'
import { HydrateClient } from '@/lib/orpc'
import { addIdPrefix } from '@/lib/utils'

export default async function OrganizationTracingPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId: organizationIdNoPrefix } = await params
  const organizationId = addIdPrefix(organizationIdNoPrefix, 'org')

  return (
    <HydrateClient>
      <TracingWithSelector scope="organization" organizationId={organizationId} />
    </HydrateClient>
  )
}
