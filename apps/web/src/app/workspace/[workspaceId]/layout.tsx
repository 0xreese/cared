import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { ErrorBoundary } from 'react-error-boundary'

import { SidebarInset, SidebarProvider } from '@cared/ui/components/sidebar'

import { AppSidebar } from '@/components/app-sidebar'
import { AppTopBar } from '@/components/app-topbar'
import { ErrorFallback } from '@/components/error-fallback'
import { RememberWorkspace } from '@/components/remember-workspace'
import { Section } from '@/components/section'
import { fetch, HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { prefetchAndCheckSession } from '@/lib/session'
import { addIdPrefix } from '@/lib/utils'
import { WorkspaceNavMain } from './nav-main'

export const dynamic = 'force-dynamic'

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}>) {
  const { workspaceId: workspaceIdNoPrefix } = await params
  const workspaceId = addIdPrefix(workspaceIdNoPrefix, 'workspace')

  if (!(await prefetchAndCheckSession())) {
    return
  }

  const { workspaces } = await fetch(orpc.workspace.list.queryOptions())

  const workspace = workspaces.find((w) => w.id === workspaceId)
  if (!workspace) {
    redirect('/')
    return null
  }

  prefetch(orpc.organization.list.queryOptions())
  prefetch(orpc.app.list.queryOptions())

  return (
    <HydrateClient>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {/*<Suspense fallback={<Loading />}>*/}
        <SidebarProvider className="flex flex-col">
          <AppTopBar />

          <div className="flex flex-1">
            <AppSidebar baseUrl={`/workspace/${workspaceIdNoPrefix}/apps`}>
              <WorkspaceNavMain baseUrl={`/workspace/${workspaceIdNoPrefix}`} />
            </AppSidebar>

            <div className="flex-1 flex flex-col h-[calc(100svh-57px)] overflow-y-auto overflow-x-hidden">
              <SidebarInset>
                <Section>{children}</Section>

                <RememberWorkspace id={workspaceId} />
              </SidebarInset>
            </div>
          </div>
        </SidebarProvider>
        {/*</Suspense>*/}
      </ErrorBoundary>
    </HydrateClient>
  )
}
