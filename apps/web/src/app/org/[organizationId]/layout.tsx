import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ErrorBoundary } from 'react-error-boundary'

import { SidebarInset, SidebarProvider } from '@cared/ui/components/sidebar'

import { OrganizationNavMain } from '@/app/org/[organizationId]/nav-main'
import { AppSidebar } from '@/components/app-sidebar'
import { AppTopBar } from '@/components/app-topbar'
import { ErrorFallback } from '@/components/error-fallback'
import { RememberOrganization } from '@/components/remember-organization'
import { Section } from '@/components/section'
import { getActiveOrganizationId } from '@/lib/active'
import { lastWorkspaceCookieName } from '@/lib/cookie'
import { fetch, HydrateClient, orpc, orpcClient, prefetch } from '@/lib/orpc'
import { prefetchAndCheckSession } from '@/lib/session'
import { stripIdPrefix } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function OrganizationLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode
  params: Promise<{ organizationId: string }>
}>) {
  const { activeOrganizationId, activeOrganizationIdNoPrefix } =
    await getActiveOrganizationId(params)

  if (!(await prefetchAndCheckSession())) {
    return
  }

  const { organizations } = await fetch(orpc.organization.list.queryOptions())

  const organization = organizations.find((w) => w.id === activeOrganizationId)
  if (!organization) {
    await orpcClient.organization.setActive({
      organizationId: null,
    })

    redirect('/org')
    return null
  }

  const redirectToWorkspace = false

  // TODO: preference
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!redirectToWorkspace) {
    prefetch(orpc.workspace.list.queryOptions())
  } else {
    const { workspaces: allWorkspaces } = await fetch(orpc.workspace.list.queryOptions())
    const workspaces = allWorkspaces.filter((w) => w.organizationId === activeOrganizationId)

    let lastWorkspace = (await cookies()).get(lastWorkspaceCookieName)?.value
    if (!lastWorkspace || !workspaces.some((w) => w.id === lastWorkspace)) {
      lastWorkspace = workspaces[0]?.id
    }

    if (lastWorkspace) {
      redirect(`/workspace/${stripIdPrefix(lastWorkspace)}/apps`)
    }
  }

  prefetch(orpc.app.list.queryOptions())

  return (
    <HydrateClient>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <SidebarProvider className="flex flex-col">
          <AppTopBar />

          <div className="flex flex-1">
            <AppSidebar baseUrl={`/org/${activeOrganizationIdNoPrefix}/credits`}>
              <OrganizationNavMain baseUrl={`/org/${activeOrganizationIdNoPrefix}`} />
            </AppSidebar>

            <div className="flex-1 flex flex-col h-[calc(100svh-57px)] overflow-y-auto overflow-x-hidden">
              <SidebarInset>
                <Section>{children}</Section>

                <RememberOrganization id={activeOrganizationId} />
              </SidebarInset>
            </div>
          </div>
        </SidebarProvider>
      </ErrorBoundary>
    </HydrateClient>
  )
}
