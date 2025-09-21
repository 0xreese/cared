import { HydrateClient, orpcClient } from '@/lib/orpc'
import { prefetchAndCheckSession } from '@/lib/session'
import { Redirect } from './redirect'

export const dynamic = 'force-dynamic'

export default async function Page() {
  if (!(await prefetchAndCheckSession())) {
    return
  }

  await orpcClient.organization.setActive({
    organizationId: null,
  })

  return (
    <HydrateClient>
      <Redirect />
    </HydrateClient>
  )
}
