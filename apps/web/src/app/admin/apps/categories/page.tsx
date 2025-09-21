import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { Categories } from './categories'

export const dynamic = 'force-dynamic'

export default function Page() {
  prefetch(
    orpc.app.listCategories.queryOptions({
      input: {
        limit: 100,
      }
    }),
  )

  return (
    <HydrateClient>
      <Categories />
    </HydrateClient>
  )
}
