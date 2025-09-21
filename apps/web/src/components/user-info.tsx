'use client'

import { UserIcon } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@cared/ui/components/avatar'

import type { User } from '@/hooks/use-session'

export function UserInfo({
  user,
  onlyAvatar,
  showEmail,
}: {
  user: User
  onlyAvatar?: boolean
  showEmail?: boolean
}) {
  return (
    <>
      <Avatar className="h-8 w-8 rounded-lg">
        <AvatarImage src={user.image ?? undefined} alt={user.name} />
        <AvatarFallback>
          <UserIcon className="size-4" />
        </AvatarFallback>
      </Avatar>
      {!onlyAvatar && (
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{user.name}</span>
          {showEmail && <span className="truncate text-xs">{user.email}</span>}
        </div>
      )}
    </>
  )
}
