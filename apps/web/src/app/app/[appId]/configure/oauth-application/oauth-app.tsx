'use client'

import type { ComponentProps } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { CheckIcon, CopyIcon, PlusIcon, TrashIcon, XIcon } from 'lucide-react'
import { useFieldArray, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod/v4'

import type { RouterOutputs } from '@cared/api'
import { Button } from '@cared/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@cared/ui/components/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@cared/ui/components/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@cared/ui/components/form'
import { Input } from '@cared/ui/components/input'
import { Label } from '@cared/ui/components/label'
import { CircleSpinner } from '@cared/ui/components/spinner'
import { Switch } from '@cared/ui/components/switch'

import { orpc } from '@/lib/orpc'

export function OAuthApp({ appId }: { appId: string }) {
  const {
    data: { oauthApps },
  } = useSuspenseQuery({
    ...orpc.oauthApp.list.queryOptions({
      input: {
        appId,
      },
    }),
  })
  const oauthApp = oauthApps.at(0)?.oauthApp

  const [showSecretDialog, setShowSecretDialog] = useState(false)
  const [secretToShow, setSecretToShow] = useState<string>()

  useEffect(() => {
    if (!showSecretDialog) {
      setSecretToShow(undefined)
    }
  }, [showSecretDialog])

  if (!oauthApp) {
    return (
      <CreateOAuthApp
        appId={appId}
        setShowSecretDialog={setShowSecretDialog}
        setSecretToShow={setSecretToShow}
      />
    )
  }

  return (
    <UpdateOAuthApp
      appId={appId}
      oauthApp={oauthApp}
      showSecretDialog={showSecretDialog}
      setShowSecretDialog={setShowSecretDialog}
      secretToShow={secretToShow}
      setSecretToShow={setSecretToShow}
    />
  )
}

// Form schema for creating OAuth app
const createOAuthAppSchema = z.object({
  redirectUris: z
    .array(
      z.object({
        uri: z
          .string()
          .url('Please enter a valid URL')
          .refine(isURL, 'URL must use HTTP or HTTPS protocol'),
      }),
    )
    .min(1, 'At least one redirect URI is required')
    .refine((items) => {
      const uris = items.map((item) => item.uri)
      return new Set(uris).size === uris.length
    }, 'Duplicate redirect URIs are not allowed'),
})

type CreateOAuthAppFormValues = z.infer<typeof createOAuthAppSchema>

// Copy button component with state management
function CopyButton({ value, ...props }: { value: string } & ComponentProps<typeof Button>) {
  const timeoutHandle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(value)
    clearTimeout(timeoutHandle.current)
    timeoutHandle.current = setTimeout(() => {
      setCopied(false)
    }, 1000)
    setCopied(true)
  }, [value])

  return (
    <Button variant="outline" size="icon" onClick={copy} {...props}>
      {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
      <span className="sr-only">Copy to clipboard</span>
    </Button>
  )
}

function CreateOAuthApp({
  appId,
  setShowSecretDialog,
  setSecretToShow,
}: {
  appId: string
  setShowSecretDialog: (show: boolean) => void
  setSecretToShow: (secret: string) => void
}) {
  const queryClient = useQueryClient()

  // Form setup
  const form = useForm<CreateOAuthAppFormValues>({
    resolver: zodResolver(createOAuthAppSchema),
    defaultValues: {
      redirectUris: [{ uri: '' }],
    },
  })

  // Setup field array
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'redirectUris',
  })

  // Create OAuth app mutation
  const createMutation = useMutation({
    ...orpc.oauthApp.create.mutationOptions({
      onSuccess: (data) => {
        setShowSecretDialog(true)
        setSecretToShow(data.oauthApp.clientSecret!)
        void queryClient.invalidateQueries({
          queryKey: orpc.oauthApp.list.queryKey({ input: { appId } }),
        })
      },
      onError: (error) => {
        toast.error(`Failed to create OAuth app: ${error.message}`)
      },
    }),
  })

  // Handle form submission
  const onSubmit = useCallback(
    async (data: CreateOAuthAppFormValues) => {
      const submitData = {
        redirectUris: data.redirectUris.map((item) => item.uri),
      }

      await createMutation.mutateAsync({
        appId,
        ...submitData,
      })
    },
    [appId, createMutation],
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Setup OAuth Application</CardTitle>
          <CardDescription>
            Set up your OAuth application by providing the redirect URIs where users will be
            redirected after authentication. You can add multiple URIs to support different
            environments or use cases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <FormLabel>Redirect URIs</FormLabel>
                    <FormDescription>
                      Add the URLs where users will be redirected after successful authentication.
                      Each URI should be a complete URL including the protocol (http:// or
                      https://).
                    </FormDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ uri: '' })}
                    className="h-8"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add URI
                  </Button>
                </div>
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-start gap-2">
                      <FormField
                        control={form.control}
                        name={`redirectUris.${index}.uri`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                {...field}
                                className="font-mono"
                                onBlur={() => {
                                  field.onBlur()
                                  void form.trigger(`redirectUris.${index}.uri`)
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        disabled={fields.length <= 1}
                        className="h-10 w-10"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {!form.formState.isValid &&
                    hasDuplicate(form.getValues('redirectUris').map((u) => u.uri)) && (
                      <p className="text-[0.8rem] font-medium text-destructive">
                        Duplicate redirect URIs are not allowed
                      </p>
                    )}
                </div>
              </div>

              <CardFooter className="px-0">
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="w-full sm:w-auto"
                >
                  {form.formState.isSubmitting ? (
                    <>
                      <CircleSpinner className="h-4 w-4" />
                      Setup...
                    </>
                  ) : (
                    'Setup'
                  )}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

function UpdateOAuthApp({
  appId,
  oauthApp,
  showSecretDialog,
  setShowSecretDialog,
  secretToShow,
  setSecretToShow,
}: {
  appId: string
  oauthApp: NonNullable<RouterOutputs['oauthApp']['list']['oauthApps'][number]['oauthApp']>
  showSecretDialog: boolean
  setShowSecretDialog: (show: boolean) => void
  secretToShow?: string
  setSecretToShow: (secret: string) => void
}) {
  const queryClient = useQueryClient()
  const [showRotateDialog, setShowRotateDialog] = useState(false)
  const [redirectUris, setRedirectUris] = useState<string[]>(oauthApp.redirectUris)
  const [newRedirectUri, setNewRedirectUri] = useState('')
  const [redirectUrisError, setRedirectUrisError] = useState<string>()
  const [isDisabled, setIsDisabled] = useState(!!oauthApp.disabled)

  // Update OAuth app mutation
  const updateMutation = useMutation({
    ...orpc.oauthApp.update.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.oauthApp.list.queryKey({ input: { appId } }),
        })
        setNewRedirectUri('')
      },
      onError: (error) => {
        toast.error(`Failed to update OAuth app: ${error.message}`)
      },
    }),
  })

  const rotateSecretMutation = useMutation({
    ...orpc.oauthApp.rotateSecret.mutationOptions({
      onSuccess: (data) => {
        void queryClient.invalidateQueries({
          queryKey: orpc.oauthApp.list.queryKey({ input: { appId } }),
        })
        setSecretToShow(data.oauthApp.clientSecret!)
        setShowSecretDialog(true)
        setShowRotateDialog(false)
      },
      onError: (error) => {
        toast.error(`Failed to rotate OAuth app client secret: ${error.message}`)
      },
    }),
  })

  const checkNewRedirectUri = useCallback(() => {
    if (!newRedirectUri.trim()) {
      setRedirectUrisError(undefined)
      return true
    }

    // Validate URL format
    if (!isURL(newRedirectUri)) {
      setRedirectUrisError('URL must use HTTP or HTTPS protocol')
      return false
    }

    // Check for duplicates
    if (redirectUris.includes(newRedirectUri)) {
      setRedirectUrisError('Duplicate redirect URIs are not allowed')
      return false
    }

    setRedirectUrisError(undefined)
    return true
  }, [
    redirectUris,
    newRedirectUri,
  ])

  // Handle adding new redirect URI
  const handleAddRedirectUri = useCallback(() => {
    if (!newRedirectUri.trim()) return

    if (!checkNewRedirectUri()) {
      return
    }

    // Update redirect URIs and trigger mutation
    const updatedUris = [...redirectUris, newRedirectUri.trim()]
    setRedirectUris(updatedUris)
    void updateMutation.mutateAsync({
      appId,
      redirectUris: updatedUris,
      disabled: isDisabled,
    })
    setNewRedirectUri('')
  }, [redirectUris, updateMutation, appId, isDisabled, newRedirectUri, checkNewRedirectUri])

  // Handle removing redirect URI
  const handleRemoveRedirectUri = useCallback(
    (uriToRemove: string) => {
      const updatedUris = redirectUris.filter((uri) => uri !== uriToRemove)
      setRedirectUris(updatedUris)
      void updateMutation.mutateAsync({
        appId,
        redirectUris: updatedUris,
        disabled: isDisabled,
      })
    },
    [appId, redirectUris, isDisabled, updateMutation],
  )

  // Handle toggle disabled state
  const handleToggleDisabled = useCallback(() => {
    const newDisabledState = !isDisabled
    setIsDisabled(newDisabledState)
    void updateMutation.mutateAsync({
      appId,
      redirectUris,
      disabled: newDisabledState,
    })
  }, [appId, redirectUris, isDisabled, updateMutation])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Redirect URIs</CardTitle>
          <CardDescription>
            For OAuth requests, the provided URI must exactly match one of the listed URIs. Specify
            at least one URI for authentication to work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="relative max-w-192">
                <Input
                  value={newRedirectUri}
                  onChange={(e) => setNewRedirectUri(e.target.value)}
                  className="font-mono"
                  onBlur={checkNewRedirectUri}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddRedirectUri()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 text-primary"
                  onClick={handleAddRedirectUri}
                  disabled={!newRedirectUri}
                >
                  Add
                </Button>
              </div>

              {redirectUrisError && (
                <p className="text-[0.8rem] font-medium text-destructive">{redirectUrisError}</p>
              )}
            </div>

            {redirectUris.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {redirectUris.map((uri) => (
                  <div
                    key={uri}
                    className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
                  >
                    <span className="font-mono">{uri}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 hover:text-primary"
                      onClick={() => handleRemoveRedirectUri(uri)}
                    >
                      <XIcon className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Application Credentials</CardTitle>
          <CardDescription>Manage your OAuth 2.0 credentials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Client ID</Label>
            <div className="relative max-w-192">
              <Input value={oauthApp.clientId!} readOnly className="font-mono" />
              <CopyButton
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6"
                value={oauthApp.clientId!}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Client Secret</Label>
            <div className="relative max-w-192">
              <Input
                value={`${oauthApp.clientSecretStart ?? ''}••••••••••••••••••••••••••`}
                readOnly
                className="font-mono"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 text-primary"
                onClick={() => setShowRotateDialog(true)}
              >
                Regenerate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between max-w-192">
            <div className="space-y-0.5">
              <Label className="text-base">Disable Application</Label>
              <p className="text-sm text-muted-foreground">
                When disabled, the OAuth application will not accept any new authentication
                requests.
              </p>
            </div>
            <Switch checked={isDisabled} onCheckedChange={handleToggleDisabled} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={showSecretDialog} onOpenChange={setShowSecretDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client Secret</DialogTitle>
            <DialogDescription>
              This is your client secret. Make sure to copy it now. You won't be able to see it
              again!
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input value={secretToShow ?? ''} readOnly className="font-mono" />
            <CopyButton value={secretToShow ?? ''} />
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSecretDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRotateDialog} onOpenChange={setShowRotateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Client Secret</DialogTitle>
            <DialogDescription>
              Are you sure you want to rotate the client secret? This will invalidate the current
              secret and generate a new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRotateDialog(false)}
              disabled={rotateSecretMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rotateSecretMutation.mutate({ appId })}
              disabled={rotateSecretMutation.isPending}
            >
              {rotateSecretMutation.isPending ? (
                <>
                  <CircleSpinner className="h-4 w-4" />
                  Regenerate...
                </>
              ) : (
                'Regenerate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function hasDuplicate(items: string[]) {
  return new Set(items).size !== items.length
}

function isURL(url: string) {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}
