'use client'

import Image from 'next/image'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@cared/ui/components/button'
import { Card, CardContent, CardDescription, CardTitle } from '@cared/ui/components/card'
import { CircleSpinner } from '@cared/ui/components/spinner'

import { RemoteImage } from '@/components/image'
import { SectionTitle } from '@/components/section'
import { orpc } from '@/lib/orpc'
import defaultLogo from '@/public/images/agent.png'

export function Applications() {
  const { data: apps, refetch } = useSuspenseQuery(orpc.user.oauthApps.queryOptions())

  const revokeMutation = useMutation(
    orpc.user.revokeOauthApp.mutationOptions({
      onSuccess: () => {
        void refetch()
      },
      onError: (error) => {
        console.error('Failed to revoke OAuth application:', error)
        toast.error(`Failed to revoke OAuth application: ${error.message}`)
      },
    }),
  )

  return (
    <>
      <SectionTitle
        title="Authorized Applications"
        description="Manage your authorized OAuth applications"
      />

      <div className="space-y-4">
        {apps.apps.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <p className="text-muted-foreground">No authorized applications found</p>
            </CardContent>
          </Card>
        ) : (
          apps.apps.map((app) => (
            <Card key={app.clientId}>
              <CardContent className="flex items-center gap-4">
                <div className="relative h-16 w-16 min-w-16 rounded-md overflow-hidden">
                  {app.imageUrl ? (
                    <RemoteImage src={app.imageUrl} alt={app.name} fill className="object-cover" />
                  ) : (
                    <Image src={defaultLogo} alt="App Logo" fill className="object-cover" />
                  )}
                </div>
                <div className="max-w-1/4 sm:max-w-1/2 lg:max-w-none">
                  <CardTitle className="truncate">{app.name}</CardTitle>
                  <CardDescription className="truncate">
                    {app.access.updatedAt &&
                      `Last used at ${new Date(app.access.updatedAt).toLocaleDateString()} • `}
                    Owned by {app.owner.name}
                  </CardDescription>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="ml-auto"
                  onClick={() => void revokeMutation.mutate({ clientId: app.clientId })}
                  disabled={revokeMutation.isPending}
                >
                  {revokeMutation.isPending ? (
                    <>
                      <CircleSpinner className="h-4 w-4" />
                      Revoking...
                    </>
                  ) : (
                    'Revoke'
                  )}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  )
}
