import Link from 'next/link'
import { KeyIcon, UsersIcon } from 'lucide-react'

import { SectionTitle } from '@/components/section'
import { TabsContent, TabsList, TabsTrigger } from '@/components/tabs'
import NavTabs from './nav-tabs'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTitle title="App Configuration" />

      <NavTabs>
        <TabsList>
          <TabsLinkTrigger href="./api-keys">
            <KeyIcon className="h-4 w-4" />
            API key
          </TabsLinkTrigger>
          <TabsLinkTrigger href="./oauth-application">
            <UsersIcon className="h-4 w-4" />
            OAuth application
          </TabsLinkTrigger>
        </TabsList>

        <TabsContent value="./api-keys" className="space-y-4">
          {children}
        </TabsContent>
        <TabsContent value="./oauth-application" className="space-y-4">
          {children}
        </TabsContent>
      </NavTabs>
    </>
  )
}

function TabsLinkTrigger({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <TabsTrigger value={href} asChild>
      <Link href={href}>{children}</Link>
    </TabsTrigger>
  )
}
