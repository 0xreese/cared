import { Tracing } from '@/components/tracing'
import { HydrateClient } from '@/lib/orpc'

export default function AccountTracingPage() {
  return (
    <HydrateClient>
      <Tracing scope="user" />
    </HydrateClient>
  )
}
