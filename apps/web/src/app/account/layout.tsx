import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'

import { SidebarInset, SidebarProvider } from '@cared/ui/components/sidebar'

import { AppSidebar } from '@/components/app-sidebar'
import { AppTopBar } from '@/components/app-topbar'
import { ErrorFallback } from '@/components/error-fallback'
import { ForgetOrganization } from '@/components/remember-organization'
import { Section } from '@/components/section'
import { HydrateClient, orpc, prefetch } from '@/lib/orpc'
import { prefetchAndCheckSession } from '@/lib/session'
import { AccountNavMain } from './nav-main'

export const dynamic = 'force-dynamic'

export default async function Layout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  if (!(await prefetchAndCheckSession())) {
    return
  }

  prefetch(orpc.organization.list.queryOptions())
  prefetch(orpc.workspace.list.queryOptions())
  prefetch(orpc.app.list.queryOptions())

  return (
    <HydrateClient>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <SidebarProvider className="flex flex-col">
          <AppTopBar />

          <div className="flex flex-1">
            <AppSidebar baseUrl="/">
              <AccountNavMain />
            </AppSidebar>

            <div className="flex-1 flex flex-col h-[calc(100svh-57px)] overflow-y-auto overflow-x-hidden">
              <SidebarInset>
                <Section>{children}</Section>

                <ForgetOrganization />
              </SidebarInset>
            </div>
          </div>
        </SidebarProvider>
      </ErrorBoundary>
    </HydrateClient>
  )
}
