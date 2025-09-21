import { HydrateClient } from '@/lib/orpc'
import { Settings } from './settings'

export default function Page() {
  return (
    <HydrateClient>
      <Settings />
    </HydrateClient>
  )
}
