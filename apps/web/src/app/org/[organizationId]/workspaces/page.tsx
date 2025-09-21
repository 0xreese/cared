import { HydrateClient } from '@/lib/orpc'
import { Workspaces } from './workspaces'

export default function Page() {
  return (
    <HydrateClient>
      <Workspaces />
    </HydrateClient>
  )
}
