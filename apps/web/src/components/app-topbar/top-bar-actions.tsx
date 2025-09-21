'use client'

import { Button } from '@cared/ui/components/button'
import { DropdownMenu, DropdownMenuTrigger } from '@cared/ui/components/dropdown-menu'

import { UserDropdownMenuContent } from '@/components/user-dropdown-menu-content'
import { UserInfo } from '@/components/user-info'
import { useSession } from '@/hooks/use-session'

export function TopBarActions() {
  const { user } = useSession()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <UserInfo user={user} onlyAvatar />
        </Button>
      </DropdownMenuTrigger>
      <UserDropdownMenuContent user={user} />
    </DropdownMenu>
  )
}
