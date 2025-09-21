import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

import { SidebarInset, SidebarProvider } from '@cared/ui/components/sidebar'

import { AppSidebar } from '@/components/app-sidebar'
import { AppTopBar } from '@/components/app-topbar'
import { ErrorFallback } from '@/components/error-fallback'
import { Section } from '@/components/section'
import { fetch, HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { prefetchAndCheckSession } from '@/lib/session'
import { addIdPrefix } from '@/lib/utils'
import { AppNavMain } from './nav-main'

export const dynamic = 'force-dynamic'

export default async function Layout({
  params,
  children,
}: Readonly<{
  params: Promise<{
    appId: string
  }>
  children: ReactNode
}>) {
  const { appId: appIdNoPrefix } = await params
  const appId = addIdPrefix(appIdNoPrefix, 'app')

  if (!(await prefetchAndCheckSession())) {
    return
  }

  prefetch(orpc.organization.list.queryOptions())
  prefetch(orpc.workspace.list.queryOptions())
  prefetch(orpc.app.list.queryOptions())
  prefetch(orpc.model.listProvidersModels.queryOptions())
  prefetch(orpc.model.listDefaultModels.queryOptions())

  await fetch(
    orpc.app.byId.queryOptions({
      input: {
        id: appId,
      },
    }),
  )

  return (
    <HydrateClient>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <SidebarProvider defaultOpen={false} className="flex flex-col">
          <AppTopBar />

          <div className="flex flex-1">
            <AppSidebar collapsible="icon" baseUrl="/">
              <AppNavMain baseUrl={`/app/${appIdNoPrefix}`} />
            </AppSidebar>

            <div className="flex-1 flex flex-col h-[calc(100svh-57px)] overflow-y-auto overflow-x-hidden">
              <SidebarInset>
                <Section>{children}</Section>
              </SidebarInset>
            </div>
          </div>
        </SidebarProvider>
      </ErrorBoundary>
    </HydrateClient>
  )
}
