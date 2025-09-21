'use client'

import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, Mail, UserCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { authClient } from '@cared/auth/client'
import { Button } from '@cared/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@cared/ui/components/card'

import { orpc } from '@/lib/orpc'

export default function Page() {
  const searchParams = useSearchParams()
  const clientId = searchParams.get('client_id')
  const scope = searchParams.get('scope')

  // Parse scopes into a more readable format
  const scopes = scope?.split(' ') ?? []

  // Merge duplicate scopes
  const uniqueScopes = scopes.filter((scope, index) => {
    if (scope === 'profile' && scopes.includes('openid')) {
      return false
    }
    return scopes.indexOf(scope) === index
  })

  const { data: app } = useQuery(
    orpc.oauthApp.info.queryOptions({
      input: {
        clientId: clientId!,
      },
    }),
  )

  const handleConsent = async (accept: boolean) => {
    const result = await authClient.oauth2.consent({
      accept,
    })
    if (result.data) {
      window.location.href = result.data.redirectURI
    } else {
      console.error(result)
      // @ts-ignore
      toast.error(result.error.error_description ?? 'An error occurred')
    }
  }

  if (!app) {
    return <></>
  }

  return (
    <div className="container mx-auto px-4 flex h-screen items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">🛡️ Authorize {app.name}</CardTitle>
          <CardDescription>{app.name} is requesting access to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mt-4 space-y-6">
            <div>
              <h3 className="font-medium">Requested Permissions:</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {uniqueScopes.map((scope) => (
                  <li key={scope} className="flex items-center gap-2">
                    {(scope === 'openid' || scope === 'profile') && (
                      <>
                        <UserCircle className="h-4 w-4" />
                        View your profile information
                      </>
                    )}
                    {scope === 'email' && (
                      <>
                        <Mail className="h-4 w-4" />
                        View your email address
                      </>
                    )}
                    {scope === 'offline_access' && (
                      <>
                        <Clock className="h-4 w-4" />
                        Access your account even when you are not using the app
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p>
                By accepting, you allow {app.name} to access your account with the permissions
                listed above.
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="mt-4 flex justify-end gap-4">
          <Button variant="outline" onClick={() => handleConsent(false)}>
            <XCircle className="h-4 w-4" />
            Deny
          </Button>
          <Button onClick={() => handleConsent(true)}>
            <CheckCircle2 className="h-4 w-4" />
            Accept
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
