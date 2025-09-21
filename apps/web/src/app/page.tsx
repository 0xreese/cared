import { redirect } from 'next/navigation'

import { orpcClient } from '@/lib/orpc'
import { stripIdPrefix } from '@/lib/utils'
import Landing from './landing/page'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await orpcClient.user.session({
    auth: false,
  })
  const userId = session?.user.id

  if (userId) {
    const orgId = session.session.activeOrganizationId
    if (!orgId) {
      redirect(`/account/credits`)
    } else {
      redirect(`/org/${stripIdPrefix(orgId)}`)
    }
  }

  return <Landing />
}
