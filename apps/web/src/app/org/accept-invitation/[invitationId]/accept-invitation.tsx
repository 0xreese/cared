'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  UserCircle,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

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

import { orpc } from '@/lib/orpc'
import { stripIdPrefix } from '@/lib/utils'

interface AcceptInvitationProps {
  invitationId: string
}

export function AcceptInvitation({ invitationId }: AcceptInvitationProps) {
  const router = useRouter()

  const [isProcessing, setIsProcessing] = useState(false)

  // Get invitation details with proper error handling
  const { data, isLoading, error, isError } = useQuery(
    orpc.organization.getInvitation.queryOptions({
      input: {
        invitationId,
      }
    }),
  )

  const invitation = data?.invitation

  const handleAccept = async () => {
    if (!invitation) return

    setIsProcessing(true)
    try {
      const { error } = await authClient.organization.acceptInvitation({
        invitationId: invitationId,
      })

      if (error) {
        throw new Error(error.message || 'Failed to accept invitation')
      }

      toast.success('Invitation accepted successfully!')
      // Redirect to organization page
      router.push(`/org/${stripIdPrefix(invitation.organizationId)}`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to accept invitation')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!invitation) return

    setIsProcessing(true)
    try {
      const { error } = await authClient.organization.rejectInvitation({
        invitationId: invitationId,
      })

      if (error) {
        throw new Error(error.message || 'Failed to reject invitation')
      }

      toast.success('Invitation rejected')
      router.push('/')
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject invitation')
    } finally {
      setIsProcessing(false)
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 flex h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <CardTitle className="text-xl">Loading Invitation</CardTitle>
            <CardDescription>Please wait while we fetch your invitation details...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  // Show error state
  if (isError) {
    return (
      <div className="container mx-auto px-4 flex h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl">Error Loading Invitation</CardTitle>
            <CardDescription>
              {error.message || 'Failed to load invitation details. Please try again later.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-3">
            <Button onClick={() => window.location.reload()} className="w-full">
              Try Again
            </Button>
            <Button variant="outline" onClick={() => router.push('/')} className="w-full">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show error if no invitation data
  if (!invitation) {
    return (
      <div className="container mx-auto px-4 flex h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl">Invitation Not Found</CardTitle>
            <CardDescription>
              The invitation you're looking for could not be found or may have been removed.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push('/')} className="w-full">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Check if invitation is expired
  const isExpired = new Date() > invitation.expiresAt

  // Check if invitation is already processed
  const isProcessed = invitation.status !== 'pending'

  if (isExpired) {
    return (
      <div className="container mx-auto px-4 flex h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Clock className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl">Invitation Expired</CardTitle>
            <CardDescription>
              Your invitation to join {invitation.organizationName} has expired and is no longer
              valid.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push('/')} className="w-full">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isProcessed) {
    const statusConfig: Record<
      string,
      {
        icon: React.ComponentType<{ className?: string }>
        title: string
        description: string
        color: string
        bgColor: string
      }
    > = {
      accepted: {
        icon: CheckCircle2,
        title: `Already Joined ${invitation.organizationName}`,
        description: `You have already accepted the invitation to join ${invitation.organizationName}.`,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
      },
      rejected: {
        icon: XCircle,
        title: `Invitation to ${invitation.organizationName} Rejected`,
        description: `You have already rejected the invitation to join ${invitation.organizationName}.`,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
      },
      canceled: {
        icon: XCircle,
        title: `Invitation to ${invitation.organizationName} Canceled`,
        description: `The invitation to join ${invitation.organizationName} has been canceled.`,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
      },
    }

    const config = statusConfig[invitation.status] || statusConfig.canceled
    if (!config) return null

    const Icon = config.icon

    return (
      <div className="container mx-auto px-4 flex h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${config.bgColor}`}
            >
              <Icon className={`h-8 w-8 ${config.color}`} />
            </div>
            <CardTitle className="text-xl">{config.title}</CardTitle>
            <CardDescription>{config.description}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push('/')} className="w-full">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 flex h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">Join {invitation.organizationName}</CardTitle>
          <CardDescription>
            {invitation.inviterName} has invited you to join this organization
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Organization Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>Organization:</span>
              <span className="font-medium text-foreground">{invitation.organizationName}</span>
            </div>

            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              <span>Invited by:</span>
              <span className="text-foreground">{invitation.inviterName}</span>
              <span className="text-sm text-muted-foreground truncate">{invitation.email}</span>
            </div>

            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              <span>Role:</span>
              <Badge variant="outline" className="capitalize">
                {invitation.role}
              </Badge>
            </div>

            {invitation.teamId && (
              <div className="flex items-center gap-2">
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                <span>Team ID:</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {invitation.teamId}
                </Badge>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Expires:</span>
              <span className="text-sm text-muted-foreground">
                {format(invitation.expiresAt, 'MMM dd, yyyy hh:mm a')}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button onClick={handleAccept} disabled={isProcessing} className="flex-1">
              {isProcessing ? 'Processing...' : 'Accept Invitation'}
            </Button>
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={isProcessing}
              className="flex-1"
            >
              {isProcessing ? 'Processing...' : 'Reject Invitation'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
