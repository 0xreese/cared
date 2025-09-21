import { redirect } from 'next/navigation'

import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { prefetchAndCheckSession } from '@/lib/session'
import { AcceptInvitation } from './accept-invitation'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params

  // Redirect if no invitationId
  if (!invitationId) {
    redirect('/')
    return
  }

  if (
    !(await prefetchAndCheckSession(
      `/auth/sign-in?redirectTo=/org/accept-invitation/${invitationId}`,
    ))
  ) {
    return
  }

  prefetch(
    orpc.organization.getInvitation.queryOptions({
      input: {
        invitationId,
      }
    }),
  )

  return (
    <HydrateClient>
      <AcceptInvitation invitationId={invitationId} />
    </HydrateClient>
  )
}
