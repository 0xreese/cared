import { Credits } from '@/components/credits'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'

export const dynamic = 'force-dynamic'

export default function Page() {
  prefetch(orpc.credits.getCredits.queryOptions())

  return (
    <HydrateClient>
      <Credits />
    </HydrateClient>
  )
}
