'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Boxes, ChevronsUpDown, Plus, UserIcon } from 'lucide-react'

import { Button } from '@cared/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@cared/ui/components/dropdown-menu'
import { useIsMobile } from '@cared/ui/hooks/use-mobile'
import { cn } from '@cared/ui/lib/utils'

import { CreateOrganizationDialog } from '@/components/create-organization-dialog'
import { UserInfo } from '@/components/user-info'
import { useActive } from '@/hooks/use-active'
import {
  useOrganizations,
  useReplaceRouteWithOrganizationId,
  useSetLastOrganization,
} from '@/hooks/use-organization'
import { useSession } from '@/hooks/use-session'
import { stripIdPrefix } from '@/lib/utils'

export function OrganizationAndAccountSwitcherInner({
  trigger,
}: {
  trigger?: (props: { children: ReactNode }) => ReactNode
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const { user } = useSession()
  const organizations = useOrganizations()
  const { activeOrganization, activeWorkspace } = useActive()
  const { setLastOrganization } = useSetLastOrganization()
  const replaceRouteWithOrganizationId = useReplaceRouteWithOrganizationId()

  const isMobile = useIsMobile()

  const addOrganizationMenuItem = (
    <DropdownMenuItem className="gap-2 p-2 cursor-pointer">
      <div className="flex size-6 items-center justify-center rounded-md border bg-muted">
        <Plus className="size-4" />
      </div>
      <div>Create Organization</div>
    </DropdownMenuItem>
  )

  const Trigger = trigger

  const handleOrganizationClick = async (e: React.MouseEvent, orgId: string, href: string) => {
    e.preventDefault() // Prevent default navigation
    setIsOpen(false) // Close the dropdown menu
    await setLastOrganization(orgId, true)
    router.push(href) // Use router.push for navigation
  }

  const handleAccountClick = async (e: React.MouseEvent) => {
    e.preventDefault() // Prevent default navigation
    setIsOpen(false) // Close the dropdown menu
    await setLastOrganization(undefined, true)
    router.push('/account/credits') // Use router.push for navigation
  }

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        className="h-8 gap-2 px-1 has-[>svg]:px-1 text-sm font-medium hover:bg-inherit hover:text-inherit"
        asChild
      >
        <Link
          href={
            activeOrganization ? `/org/${stripIdPrefix(activeOrganization.id)}` : `/account/credits`
          }
        >
          {!activeOrganization ? (
            <>
              <UserIcon className="size-4 text-muted-foreground" />
              Account
            </>
          ) : (
            <>
              <Boxes className="text-muted-foreground/70" />
              <span className={cn('truncate max-w-20 md:inline', activeWorkspace && 'hidden')}>
                {activeOrganization.name}
              </span>
            </>
          )}
        </Link>
      </Button>

      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 px-1.5 has-[>svg]:px-1.5 text-sm font-medium">
            <ChevronsUpDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
          align="start"
          side={isMobile ? 'bottom' : 'right'}
          sideOffset={4}
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Organizations
          </DropdownMenuLabel>
          {organizations.map((org) => {
            const isActive = org.id === activeOrganization?.id
            const href =
              !activeOrganization || activeWorkspace
                ? `/org/${stripIdPrefix(org.id)}`
                : replaceRouteWithOrganizationId(org.id)

            return (
              <DropdownMenuItem key={org.id} className="max-w-56 gap-2 p-2 cursor-pointer" asChild>
                <Link
                  href={href}
                  className="flex w-full items-center gap-2"
                  onClick={(e) => handleOrganizationClick(e, org.id, href)}
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <Boxes className="size-4 text-muted-foreground/70" />
                  </div>
                  <span className={cn('flex-1 truncate')}>{org.name}</span>
                  {isActive && (
                    <div className="ml-2 flex items-center">
                      <div className="size-1.5 rounded-full bg-green-500" aria-hidden="true" />
                    </div>
                  )}
                </Link>
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          {Trigger ? <Trigger>{addOrganizationMenuItem}</Trigger> : addOrganizationMenuItem}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Account</DropdownMenuLabel>
          <DropdownMenuItem className="gap-2 p-2 cursor-pointer" asChild>
            <Link
              href="/account/credits"
              className="flex w-full items-center gap-2"
              onClick={handleAccountClick}
            >
              <UserInfo user={user} />
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function OrganizationAndAccountSwitcher() {
  return <CreateOrganizationDialog menu={OrganizationAndAccountSwitcherInner} />
}
