import { Expenses } from '@/components/expenses'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'

export const dynamic = 'force-dynamic'

export default function Page() {
  prefetch(orpc.model.listProviders.queryOptions())
  prefetch(orpc.model.listModels.queryOptions())

  return (
    <HydrateClient>
      <Expenses />
    </HydrateClient>
  )
}
