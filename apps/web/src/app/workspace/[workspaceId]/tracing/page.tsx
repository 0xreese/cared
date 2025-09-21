import { TracingWithSelector } from '@/components/tracing'
import { HydrateClient } from '@/lib/orpc'
import { addIdPrefix } from '@/lib/utils'

export default async function WorkspaceTracingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId: workspaceIdNoPrefix } = await params
  const workspaceId = addIdPrefix(workspaceIdNoPrefix, 'workspace')

  return (
    <HydrateClient>
      <TracingWithSelector scope="workspace" workspaceId={workspaceId} />
    </HydrateClient>
  )
}
