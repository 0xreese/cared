import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { Tags } from './tags'

export const dynamic = 'force-dynamic'

export default function Page() {
  prefetch(
    orpc.app.listTags.queryOptions({
      input: {
        limit: 100,
      }
    }),
  )

  return (
    <HydrateClient>
      <Tags />
    </HydrateClient>
  )
}
