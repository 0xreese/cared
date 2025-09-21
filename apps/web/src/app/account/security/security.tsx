'use client'

import { useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { LucideKey, LucideLogOut, LucideTrash2 } from 'lucide-react'
import { UAParser } from 'ua-parser-js'

import { authClient } from '@cared/auth/client'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@cared/ui/components/tooltip'

import { SectionTitle } from '@/components/section'
import { useAccounts, useSession } from '@/hooks/use-session'
import { orpc } from '@/lib/orpc'
import { ChangePasswordDialog } from './change-password-dialog'

export function Security() {
  const { accounts } = useAccounts()
  const [isRevoking, setIsRevoking] = useState(false)
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false)

  const { session } = useSession()
  const {
    data: { sessions: sessionsData },
    refetch: refetchSessions,
  } = useSuspenseQuery({
    ...orpc.user.sessions.queryOptions(),
  })

  // Check if user has a credential account (email/password authentication)
  const hasCredentialAccount = accounts.some((account) => account.providerId === 'credential')

  const sessions = sessionsData
    .map((s) => {
      return {
        ...s,
        ua: s.userAgent ? UAParser(s.userAgent) : undefined,

        isCurrent: s.token === session.token,
      }
    })
    .reverse()

  // Function to set password
  const handleSetPassword = () => {
    setShowChangePasswordDialog(true)
  }

  // Function to add passkey
  const handleAddPasskey = () => {
    // Implementation would connect to authClient
    console.log('Add passkey clicked')
  }

  // Function to add two-step verification
  const handleAddTwoStep = () => {
    // Implementation would connect to authClient
    console.log('Add two-step verification clicked')
  }

  // Function to handle device options
  const handleRevokeSession = async (token: string, isCurrent: boolean) => {
    if (isCurrent) {
      return
    }

    try {
      setIsRevoking(true)
      await authClient.revokeSession({ token })
      await refetchSessions()
    } catch (error) {
      console.error('Failed to revoke session:', error)
    } finally {
      setIsRevoking(false)
    }
  }

  // Function to revoke all other sessions
  const handleRevokeAllOtherSessions = async () => {
    try {
      setIsRevoking(true)
      await authClient.revokeOtherSessions()
      await refetchSessions()
    } catch (error) {
      console.error('Failed to revoke other sessions:', error)
    } finally {
      setIsRevoking(false)
    }
  }

  // Function to delete account
  const handleDeleteAccount = () => {
    // Implementation would connect to authClient
    console.log('Delete account clicked')
  }

  return (
    <>
      <SectionTitle
        title="Security Settings"
        description="Manage your account security and authentication methods"
      />

      {/* Authentication Methods Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LucideKey className="h-5 w-5" />
            Authentication Methods
          </CardTitle>
          <CardDescription>Configure how you sign in to your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Password Section */}
          <div className="flex items-center justify-between py-2">
            <div>
              <h3 className="font-medium">Password</h3>
              {!hasCredentialAccount && <p className="text-sm text-gray-500">No password set</p>}
            </div>
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleSetPassword}
            >
              {hasCredentialAccount ? 'Change password' : 'Set password'}
            </Button>
          </div>

          {/* Passkeys Section */}
          <div className="flex items-center justify-between py-2">
            <div>
              <h3 className="font-medium">Passkeys</h3>
              <p className="text-sm text-gray-500">No passkeys configured</p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      className="flex items-center gap-2"
                      onClick={handleAddPasskey}
                      disabled
                    >
                      Add passkey
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Coming soon</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Two-step verification Section */}
          <div className="flex items-center justify-between py-2">
            <div>
              <h3 className="font-medium">Two-step verification</h3>
              <p className="text-sm text-gray-500">Not enabled</p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      className="flex items-center gap-2"
                      onClick={handleAddTwoStep}
                      disabled
                    >
                      Enable 2FA
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Coming soon</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Active devices Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active devices</CardTitle>
              <CardDescription>Manage devices that have logged into your account</CardDescription>
            </div>
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleRevokeAllOtherSessions}
              disabled={isRevoking}
            >
              <LucideLogOut className="h-4 w-4" />
              Sign out all other devices
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sessions.map((session) => {
              const ua = session.ua
              const { city, region, country } = session.geolocation ?? {}
              const geo = [city, region, country].filter(Boolean).join(', ')

              return (
                <div
                  key={session.token}
                  className={`flex items-start gap-4 p-3 border rounded-lg transition-opacity duration-200 ${
                    isRevoking ? 'opacity-50' : ''
                  }`}
                >
                  <div className="mt-1">
                    {[undefined, null, 'console', 'smarttv'].includes(ua?.device.type)
                      ? '🖥️'
                      : '📱'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-normal">{ua?.os.name}</span>
                        {session.isCurrent && (
                          <Badge variant="secondary" className="text-xs">
                            Current device
                          </Badge>
                        )}
                      </div>
                      {!session.isCurrent && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={isRevoking}>
                              •••
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleRevokeSession(session.token, session.isCurrent)}
                            >
                              <LucideLogOut className="mr-2 h-4 w-4" />
                              Sign out this device
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {ua?.browser.name} {ua?.browser.version}
                    </div>
                    <div className="text-sm text-gray-500">
                      {session.ipAddress} {geo && `(${geo})`}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Last active: {new Date(session.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Delete account Section */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <LucideTrash2 className="h-5 w-5" />
            Delete account
          </CardTitle>
          <CardDescription className="text-red-600">
            Permanently delete your account and all associated data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-500">This action cannot be undone</p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="destructive"
                      className="flex items-center gap-2"
                      onClick={handleDeleteAccount}
                      disabled
                    >
                      Delete account
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Coming soon</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardContent>
      </Card>

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={showChangePasswordDialog}
        onOpenChange={setShowChangePasswordDialog}
      />
    </>
  )
}
