import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { Profile } from './profile'

export const dynamic = 'force-dynamic'

export default function Page() {
  prefetch(orpc.user.accounts.queryOptions())

  return (
    <HydrateClient>
      <Profile />
    </HydrateClient>
  )
}
