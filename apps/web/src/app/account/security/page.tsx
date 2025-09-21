import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { Security } from './security'

export const dynamic = 'force-dynamic'

export default function Page() {
  prefetch(orpc.user.sessions.queryOptions())
  prefetch(orpc.user.accounts.queryOptions())

  return (
    <HydrateClient>
      <Security />
    </HydrateClient>
  )
}
