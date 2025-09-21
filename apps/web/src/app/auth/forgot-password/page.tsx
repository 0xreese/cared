import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ForgotPassword } from '@/components/forgot-password'
import { fetch, HydrateClient, orpc } from '@/lib/orpc'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Forgot password | Cared',
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const redirectToUrl = (await searchParams).redirectTo ?? '/'

  const session = await fetch(
    orpc.user.session.queryOptions({
      input: {
        auth: false,
      }
    }),
  )
  if (session) {
    redirect(redirectToUrl)
    return
  }

  return (
    <HydrateClient>
      <ForgotPassword />
    </HydrateClient>
  )
}
