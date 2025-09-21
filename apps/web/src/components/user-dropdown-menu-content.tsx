'use client'

import Link from 'next/link'
import {
  CircleDollarSignIcon,
  LogOutIcon,
  SparklesIcon,
  UserRoundIcon,
  WalletIcon,
} from 'lucide-react'

import {
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@cared/ui/components/dropdown-menu'
import { useIsMobile } from '@cared/ui/hooks/use-mobile'

import type { User } from '@/hooks/use-session'
import { ThemeSwitcher } from '@/components/theme'
import { useSignOut } from '@/hooks/use-signout'
import { UserInfo } from './user-info'

export function UserDropdownMenuContent({ user }: { user: User }) {
  const isMobile = useIsMobile()

  const { signOut } = useSignOut()

  return (
    <DropdownMenuContent
      className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
      side={isMobile ? 'bottom' : 'right'}
      align="end"
      sideOffset={4}
    >
      <DropdownMenuLabel className="p-0 font-normal">
        <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
          <UserInfo user={user} showEmail />
          <ThemeSwitcher />
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link href="/account/credits" className="cursor-pointer">
            <CircleDollarSignIcon />
            Billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/wallet" className="cursor-pointer">
            <WalletIcon />
            Wallet
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/profile" className="cursor-pointer">
            <UserRoundIcon />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/landing" className="cursor-pointer">
            <SparklesIcon />
            Landing
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={signOut} className="cursor-pointer">
        <LogOutIcon />
        Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
