import { orpc, prefetch } from '@/lib/orpc'
import { Applications } from './applications'

export const dynamic = 'force-dynamic'

export default function Page() {
  prefetch(orpc.user.oauthApps.queryOptions())

  return <Applications />
}
