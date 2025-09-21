'use client'

import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { formatDistance } from 'date-fns'
import {
  Bot,
  Box,
  CheckIcon,
  CircleQuestionMarkIcon,
  CopyIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'

import type { ApiKey, ApiKeyMetadataInput, ApiKeyScope } from '@cared/api'
import { Button } from '@cared/ui/components/button'
import { DataTable } from '@cared/ui/components/data-table'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@cared/ui/components/form'
import { Input } from '@cared/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cared/ui/components/select'
import { CircleSpinner } from '@cared/ui/components/spinner'
import { cn } from '@cared/ui/lib/utils'

import type { ColumnDef } from '@tanstack/react-table'
import { PopoverTooltip } from '@/components/tooltip'
import { useApiKeys, useCreateApiKey, useDeleteApiKey, useRotateApiKey } from '@/hooks/use-api-key'
import { useApps } from '@/hooks/use-app'
import { useWorkspaces } from '@/hooks/use-workspace'

// Form schema for creating API key
const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(64, 'Name cannot exceed 64 characters'),
})

type CreateApiKeyFormValues = z.infer<typeof createApiKeySchema>

// Copy button component for copying API key
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [value])

  return (
    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={copy}>
      {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
    </Button>
  )
}

function scopeTarget(scope: ApiKeyScope) {
  switch (scope) {
    case 'user':
      return 'account'
    default:
      return scope
  }
}

export function ApiKeysWithSelector({
  scope,
  organizationId,
  workspaceId,
  appId,
  showTitle,
}: {
  scope: ApiKeyScope
  organizationId?: string
  workspaceId?: string
  appId?: string
  showTitle?: boolean
}) {
  // State for scope switching
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('none')
  const [selectedAppId, setSelectedAppId] = useState<string>('none')

  // Handle workspace selection change - reset app selection when workspace is cleared
  const handleWorkspaceChange = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId)
    setSelectedAppId('none') // Reset app selection when workspace is cleared
  }

  // Determine effective scope and IDs based on user selection
  // Priority: app > workspace > original scope
  const effectiveScope = useMemo(() => {
    if (selectedAppId !== 'none') return 'app'
    if (selectedWorkspaceId !== 'none') return 'workspace'
    return scope
  }, [selectedAppId, selectedWorkspaceId, scope])

  // Use selected IDs if available, otherwise fall back to props
  const effectiveOrganizationId = organizationId
  const effectiveWorkspaceId = selectedWorkspaceId !== 'none' ? selectedWorkspaceId : workspaceId
  const effectiveAppId = selectedAppId !== 'none' ? selectedAppId : appId

  // Get workspaces and apps for scope switching
  const workspaces = useWorkspaces(effectiveOrganizationId)
  const apps = useApps({ workspaceId: effectiveWorkspaceId })

  return (
    <ApiKeysInner
      scope={effectiveScope}
      organizationId={effectiveOrganizationId}
      workspaceId={effectiveWorkspaceId}
      appId={effectiveAppId}
      showTitle={showTitle}
      selector={
        <>
          {/* Workspace selector - only show for organization scope */}
          {scope === 'organization' && (
            <WorkspaceSelector
              value={selectedWorkspaceId}
              onValueChange={handleWorkspaceChange}
              workspaces={workspaces}
            />
          )}

          {/* App selector - show for organization scope when workspace is selected, or for workspace scope */}
          {(scope === 'organization' && effectiveWorkspaceId) || scope === 'workspace' ? (
            <AppSelector value={selectedAppId} onValueChange={setSelectedAppId} apps={apps} />
          ) : null}

          <PopoverTooltip
            icon={CircleQuestionMarkIcon}
            className="inline-block align-bottom"
            side="right"
            align="start"
            content={
              <div className="space-y-2">
                <p className="text-sm">Use the selectors to filter API keys by scope:</p>
                <ul className="text-sm list-disc list-inside space-y-1">
                  {scope === 'organization' && (
                    <>
                      <li>
                        <strong>Organization:</strong> Default scope when no workspace or app is
                        selected
                      </li>
                      <li>
                        <strong>Workspace:</strong> Select a workspace to view and create
                        workspace-scoped API keys
                      </li>
                    </>
                  )}
                  {scope === 'workspace' && (
                    <li>
                      <strong>Workspace:</strong> Default scope when no app is selected
                    </li>
                  )}
                  <li>
                    <strong>App:</strong> Select an app to view and create app-scoped API keys
                  </li>
                </ul>
              </div>
            }
          />
        </>
      }
    />
  )
}

export function ApiKeys({
  scope,
  organizationId,
  workspaceId,
  appId,
  showTitle,
}: {
  scope: ApiKeyScope
  organizationId?: string
  workspaceId?: string
  appId?: string
  showTitle?: boolean
}) {
  return (
    <ApiKeysInner
      scope={scope}
      organizationId={organizationId}
      workspaceId={workspaceId}
      appId={appId}
      showTitle={showTitle}
    />
  )
}

function ApiKeysInner({
  scope,
  organizationId,
  workspaceId,
  appId,
  showTitle,
  selector,
}: {
  scope: ApiKeyScope
  organizationId?: string
  workspaceId?: string
  appId?: string
  showTitle?: boolean
  selector?: ReactNode
}) {
  const { apiKeys: allApiKeys, refetchApiKeys } = useApiKeys()

  const apiKeys = useMemo(() => {
    return allApiKeys.filter((key) => {
      switch (scope) {
        case 'user':
          return key.scope === 'user'
        case 'organization':
          return key.scope === 'organization' && key.organizationId === organizationId
        case 'workspace':
          return key.scope === 'workspace' && key.workspaceId === workspaceId
        case 'app':
          return key.scope === 'app' && key.appId === appId
        default:
          return false
      }
    })
  }, [allApiKeys, scope, organizationId, workspaceId, appId])

  // Shared dialog states for all cards
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [keyToShow, setKeyToShow] = useState<string>()
  const [showRotateDialog, setShowRotateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedApiKey, setSelectedApiKey] = useState<ApiKey | null>(null)
  const [isRotating, setIsRotating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const rotateApiKey = useRotateApiKey()
  const deleteApiKey = useDeleteApiKey()

  // Shared handlers for all cards
  const handleRotate = async () => {
    if (!selectedApiKey) return

    try {
      setIsRotating(true)
      const result = await rotateApiKey(selectedApiKey.id)
      setKeyToShow(result.key.key)
      setShowKeyDialog(true)
      setShowRotateDialog(false)
      void refetchApiKeys()
    } finally {
      setIsRotating(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedApiKey) return

    try {
      setIsDeleting(true)
      await deleteApiKey(selectedApiKey.id)
      setShowDeleteDialog(false)
      void refetchApiKeys()
    } finally {
      setIsDeleting(false)
    }
  }

  const openRotateDialog = (apiKey: ApiKey) => {
    setSelectedApiKey(apiKey)
    setShowRotateDialog(true)
  }

  const openDeleteDialog = (apiKey: ApiKey) => {
    setSelectedApiKey(apiKey)
    setShowDeleteDialog(true)
  }

  // Define table columns
  const columns: ColumnDef<ApiKey>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const apiKey = row.original
        return (
          <div className="flex flex-col max-w-50">
            <span className="font-medium truncate">{apiKey.name}</span>
            <span className="text-sm text-muted-foreground">
              Created {formatDistance(apiKey.createdAt, new Date(), { addSuffix: true })}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'key',
      header: 'API Key',
      cell: ({ row }) => {
        const apiKey = row.original
        return (
          <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
            {`${apiKey.start}••••••••••••••••••••••••••`}
          </code>
        )
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const apiKey = row.original
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openRotateDialog(apiKey)}
              className="hidden"
            >
              <RefreshCwIcon className="h-4 w-4" />
              Regenerate
            </Button>
            <Button variant="destructive" size="sm" onClick={() => openDeleteDialog(apiKey)}>
              <Trash2Icon className="h-4 w-4" />
              Delete
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="w-full flex flex-wrap items-center justify-end md:justify-between gap-x-8 gap-y-4">
        <div className="w-full md:w-auto flex items-center gap-4">
          {showTitle && (
            <>
              <h3 className="text-lg font-semibold">API Keys</h3>
              <p className="text-sm text-muted-foreground">
                Configure API keys to securely control access to your {scopeTarget(scope)}. Keep
                these keys secure and never share them publicly.
              </p>
            </>
          )}

          {selector}
        </div>

        <Button onClick={() => setShowCreateDialog(true)}>
          <PlusIcon />
          Create
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <div className="flex flex-col items-center justify-center mt-8 py-8 border rounded-md">
          <p className="text-sm text-muted-foreground mb-4">No API keys found</p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <PlusIcon />
            Create API Key
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={apiKeys}
          searchKeys={['name']}
          searchPlaceholder="Search API keys..."
        />
      )}

      <CreateApiKeyDialog
        scope={scope}
        organizationId={organizationId}
        workspaceId={workspaceId}
        appId={appId}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={refetchApiKeys}
      />

      {/* Shared Show Key Dialog for all cards */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key</DialogTitle>
            <DialogDescription>
              This is your new API key. Make sure to copy it now. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input value={keyToShow ?? ''} readOnly className="font-mono" />
            <CopyButton value={keyToShow ?? ''} />
          </div>
          <DialogFooter>
            <Button onClick={() => setShowKeyDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared Rotate Key Dialog for all cards */}
      <Dialog
        open={showRotateDialog}
        onOpenChange={(open) => {
          if (!isRotating) {
            setShowRotateDialog(open)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to regenerate your API key? This will invalidate the current key
              and generate a new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRotateDialog(false)}
              disabled={isRotating}
            >
              Cancel
            </Button>
            <Button variant="default" onClick={handleRotate} disabled={isRotating}>
              {isRotating ? (
                <>
                  <CircleSpinner />
                  Regenerating...
                </>
              ) : (
                'Regenerate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared Delete Key Dialog for all cards */}
      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setShowDeleteDialog(open)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this API key? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <CircleSpinner />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateApiKeyDialog({
  scope,
  organizationId,
  workspaceId,
  appId,
  open,
  onOpenChange,
  onSuccess,
}: {
  scope: ApiKeyScope
  organizationId?: string
  workspaceId?: string
  appId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [keyToShow, setKeyToShow] = useState<string>()
  const [isCreating, setIsCreating] = useState(false)

  const createApiKey = useCreateApiKey()

  const form = useForm<CreateApiKeyFormValues>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: {
      name: '',
    },
  })

  const onSubmit = async (data: CreateApiKeyFormValues) => {
    try {
      setIsCreating(true)

      // Create the metadata object based on scope
      let metadata: ApiKeyMetadataInput
      switch (scope) {
        case 'user':
          metadata = { scope: 'user' }
          break
        case 'organization':
          metadata = { scope: 'organization', organizationId: organizationId! }
          break
        case 'workspace':
          metadata = { scope: 'workspace', workspaceId: workspaceId! }
          break
        case 'app':
          metadata = { scope: 'app', appId: appId! }
          break
      }

      const result = await createApiKey({
        name: data.name,
        ...metadata,
      })

      setKeyToShow(result.key.key)
      setShowKeyDialog(true)
      onOpenChange(false)
      form.reset()
      onSuccess()
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key to securely control access to your {scopeTarget(scope)}. Keep
              this key secure and never share it publicly.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter API key name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? (
                    <>
                      <CircleSpinner />
                      Creating...
                    </>
                  ) : (
                    'Create'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Show Key Dialog for newly created key */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              This is your API key. Make sure to copy it now. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input value={keyToShow ?? ''} readOnly className="font-mono" />
            <CopyButton value={keyToShow ?? ''} />
          </div>
          <DialogFooter>
            <Button onClick={() => setShowKeyDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Workspace selector component
function WorkspaceSelector({
  value,
  onValueChange,
  workspaces,
}: {
  value: string
  onValueChange: (value: string) => void
  workspaces: { id: string; name: string }[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn('w-[calc(50%-24px)] md:w-auto', value === 'none' && 'w-full')}>
        <SelectValue placeholder="Select workspace">
          <div className="flex items-center gap-2 pr-2">
            <Box className="size-4 text-muted-foreground/70" />
            <span className={cn('flex-1 truncate', value === 'none' && 'text-muted-foreground/70')}>
              {value !== 'none' ? workspaces.find((w) => w.id === value)?.name : '--'}
            </span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <div className="flex items-center gap-2">
            <Box className="size-4 text-muted-foreground/70" />
            <span>-- None --</span>
          </div>
        </SelectItem>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.id} value={workspace.id}>
            <div className="flex items-center gap-2">
              <Box className="size-4 text-muted-foreground/70" />
              {workspace.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// App selector component
function AppSelector({
  value,
  onValueChange,
  apps,
}: {
  value: string
  onValueChange: (value: string) => void
  apps: { app: { id: string; name: string } }[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[calc(50%-24px)] md:w-auto">
        <SelectValue placeholder="Select app">
          <div className="flex items-center gap-2 pr-2">
            <Bot className="size-4 text-muted-foreground/70" />
            <span className={cn('flex-1 truncate', value === 'none' && 'text-muted-foreground/70')}>
              {value !== 'none' ? apps.find((a) => a.app.id === value)?.app.name : '--'}
            </span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground/70" />
            <span>-- None --</span>
          </div>
        </SelectItem>
        {apps.map((app) => (
          <SelectItem key={app.app.id} value={app.app.id}>
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-muted-foreground/70" />
              {app.app.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
