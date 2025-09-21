import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { SignInUp } from '@/components/sign-in-up'
import { fetch, HydrateClient, orpc } from '@/lib/orpc'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in | Cared',
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
      <SignInUp mode="sign-in" />
    </HydrateClient>
  )
}
