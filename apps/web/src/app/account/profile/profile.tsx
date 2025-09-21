'use client'

import { useRef, useState } from 'react'
import * as React from 'react'
import { LucideCheck, LucidePencil, LucidePlus, LucideX } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod/v4'

import { authClient } from '@cared/auth/client'
import { Avatar, AvatarFallback, AvatarImage } from '@cared/ui/components/avatar'
import { Badge } from '@cared/ui/components/badge'
import { Button } from '@cared/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@cared/ui/components/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@cared/ui/components/dropdown-menu'
import { Input } from '@cared/ui/components/input'
import { Label } from '@cared/ui/components/label'
import { CircleSpinner } from '@cared/ui/components/spinner'

import type { SocialProvider } from '@/lib/auth-providers'
import { SectionTitle } from '@/components/section'
import { useAccounts, useSession } from '@/hooks/use-session'
import { allowedProviders, getAccountInfo } from '@/lib/auth-providers'

export function Profile() {
  const { user, refetchSession } = useSession()
  const { accounts, refetchAccounts } = useAccounts()

  const fileInputRef = useRef<HTMLInputElement>(null)

  // State for name editing
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  // State for loading states
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState<string | null>(null)

  /**
   * Handle updating user's name
   */
  const handleUpdateName = async () => {
    try {
      // Note: Properties should match your API requirements
      await authClient.updateUser({
        name: nameValue.trim(),
      })
      await refetchSession()
      setIsEditingName(false)
      toast.success('Profile updated successfully')
    } catch (error) {
      console.error('Failed to update profile:', error)
      toast.error('Failed to update profile')
    }
  }

  /**
   * Handle uploading profile image
   */
  const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      // Since updateUserProfileImage may not exist, disable this functionality for now
      // await authClient.updateUserProfileImage(user.id, { file })
      toast.info('Profile image upload coming soon')
      await refetchSession()
    } catch (error) {
      console.error('Failed to update profile image:', error)
      toast.error('Failed to upload profile image')
    }
  }

  /**
   * Handle disconnecting a social account
   */
  const handleDisconnectAccount = async (accountId: string, providerId: string) => {
    if (!accountId) return

    try {
      setIsDisconnecting(accountId)
      // Use the account ID to disconnect the account
      const { error } = await authClient.unlinkAccount({
        providerId,
        accountId,
      })
      if (error) {
        toast.error(error.message ?? error.statusText)
        return
      }
      await refetchAccounts()
    } catch (error) {
      console.error('Failed to disconnect account:', error)
    } finally {
      setIsDisconnecting(null)
    }
  }

  /**
   * Handle connecting a new social account
   */
  const handleConnectAccount = async (provider: SocialProvider) => {
    try {
      setIsConnecting(provider)
      // Use the provider to connect a new account
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: window.location.href,
      })
      if (error) {
        toast.error(error.message ?? error.statusText)
        return
      }
      await refetchAccounts()
    } catch (error) {
      console.error('Failed to connect account:', error)
    } finally {
      setIsConnecting(null)
    }
  }

  // Some social provider (e.g., twitter) does not return email, so we need to check if the email is valid.
  const { success: hasEmail } = z.string().email().safeParse(user.email)

  return (
    <>
      <SectionTitle
        title="Profile Settings"
        description="Manage your personal information and preferences"
      />

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Update your profile details and how others see you on the platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile Image and Name */}
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            {/* Avatar section */}
            <div className="relative">
              {user.image ? (
                <Avatar className="h-20 w-20">
                  <AvatarImage src={user.image} alt={user.name || 'Profile'} />
                  <AvatarFallback>{user.name.charAt(0) || '?'}</AvatarFallback>
                </Avatar>
              ) : (
                <Avatar className="h-20 w-20">
                  <AvatarFallback>{user.name.charAt(0) || '?'}</AvatarFallback>
                </Avatar>
              )}
              <Button
                onClick={() => fileInputRef.current?.click()}
                size="icon"
                variant="secondary"
                className="absolute -bottom-2 -right-2 rounded-full h-8 w-8"
              >
                <LucidePencil className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProfileImageUpload}
              />
            </div>

            {/* Name and email section */}
            <div className="flex-1">
              {isEditingName ? (
                <div className="space-y-4">
                  <div className="flex flex-col space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      placeholder="Enter your name"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <Button onClick={handleUpdateName} size="sm">
                      <LucideCheck className="h-4 w-4" />
                      Save
                    </Button>
                    <Button onClick={() => setIsEditingName(false)} variant="outline" size="sm">
                      <LucideX className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="block text-sm font-medium text-gray-500">Name</Label>
                      <p className="text-lg font-medium">{user.name || 'Not set'}</p>
                    </div>
                    <Button
                      onClick={() => {
                        setNameValue(user.name || '')
                        setIsEditingName(true)
                      }}
                      variant="ghost"
                      size="sm"
                    >
                      <LucidePencil className="h-4 w-4" />
                    </Button>
                  </div>
                  <div>
                    <Label className="block text-sm font-medium text-gray-500">
                      {hasEmail ? 'Email' : 'User ID'}
                    </Label>
                    <div className="flex items-center gap-2">
                      <p>{user.email}</p>
                      {user.emailVerified && (
                        <Badge variant="outline" className="text-xs">
                          Verified
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connected Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>Manage third-party accounts connected to your profile</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connected accounts list */}
          <div className="space-y-3">
            {accounts.filter((a) => a.providerId !== 'credential').length > 0 ? (
              accounts
                .filter((a) => a.providerId !== 'credential')
                .map((account) => {
                  const { icon: Icon, name } = allowedProviders.find(
                    (provider) => provider.provider === account.providerId,
                  )!
                  const displayUsername = getAccountInfo(account).displayUsername

                  return (
                    <div
                      key={account.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <div className="w-5 h-5 flex items-center justify-center">
                          <Icon variant="color" />
                        </div>
                        <span className="font-normal">{name}</span>
                        {displayUsername && (
                          <span className="text-sm font-mono truncate">{displayUsername}</span>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isDisconnecting === account.accountId || accounts.length <= 1}
                        onClick={() =>
                          handleDisconnectAccount(account.accountId, account.providerId)
                        }
                      >
                        {isDisconnecting === account.id && <CircleSpinner className="h-4 w-4" />}
                        Disconnect
                      </Button>
                    </div>
                  )
                })
            ) : (
              <p className="text-gray-500 text-center py-3">No connected accounts</p>
            )}
          </div>

          {/* Connect new account */}
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <LucidePlus className="h-4 w-4" />
                  Connect account
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {allowedProviders
                  .filter(
                    (provider) => !accounts.some((acc) => acc.providerId === provider.provider),
                  )
                  .map(({ icon: Icon, name, provider }) => {
                    return (
                      <DropdownMenuItem
                        key={provider}
                        disabled={isConnecting === provider}
                        onClick={() => handleConnectAccount(provider)}
                        className="cursor-pointer"
                      >
                        <div className="w-4 h-4 flex items-center justify-center">
                          {isConnecting === provider ? (
                            <CircleSpinner className="h-4 w-4" />
                          ) : (
                            <Icon variant="color" />
                          )}
                        </div>
                        <span>{name}</span>
                      </DropdownMenuItem>
                    )
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
