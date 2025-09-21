'use client'

import type { VirtualizerHandle } from 'virtua'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckIcon, EditIcon, PlusIcon, ServerIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Virtualizer } from 'virtua'
import { z } from 'zod/v4'

import type { BaseProviderInfo, ProviderId } from '@cared/providers'
import { providerKeySchema } from '@cared/providers'
import { Avatar, AvatarFallback, AvatarImage } from '@cared/ui/components/avatar'
import { Button } from '@cared/ui/components/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@cared/ui/components/form'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@cared/ui/components/sheet'
import { CircleSpinner } from '@cared/ui/components/spinner'
import { Switch } from '@cared/ui/components/switch'

import { OptionalInput } from '@/components/input'
import { useProviders } from '@/hooks/use-model'
import {
  useCreateProviderKey,
  useDeleteProviderKey,
  useProviderKeysByProvider,
  useToggleProviderKey,
  useUpdateProviderKey,
} from '@/hooks/use-provider-key'

// Temporary ID prefix for new items that haven't been submitted yet
const TEMP_ID_PREFIX = 'temp_'

// Form schema for provider key creation/editing
const providerKeyFormSchema = z.object({
  disabled: z.boolean(),
  key: providerKeySchema,
})

type ProviderKeyFormValues = z.infer<typeof providerKeyFormSchema>

// Helper function to get default values for a provider
function getDefaultValuesForProvider(providerId: ProviderId): ProviderKeyFormValues['key'] {
  return {
    providerId,
    apiKey: '',
    baseUrl: '',
    apiVersion: undefined,
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    location: undefined,
    serviceAccountJson: '',
    apiToken: '',
  }
}

interface EditableProviderKey {
  id: string
  providerId: ProviderId
  key: {
    providerId: ProviderId
    apiKey?: string
    baseUrl?: string
    apiVersion?: string
    region?: string
    accessKeyId?: string
    secretAccessKey?: string
    location?: string
    serviceAccountJson?: string
    apiToken?: string
  }
  disabled: boolean
  isEditing: boolean
  isNew?: boolean
}

export function ProviderKeysSheet({
  isSystem,
  organizationId,
  provider,
  open,
  onOpenChange,
}: {
  isSystem?: boolean
  organizationId?: string
  provider: BaseProviderInfo
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const providerId = provider.id
  const { refetchProviders } = useProviders()
  const { providerKeys, refetchProviderKeys } = useProviderKeysByProvider({
    isSystem,
    organizationId,
    providerId,
  })
  const vListRef = useRef<VirtualizerHandle>(null)
  const createProviderKey = useCreateProviderKey({
    isSystem,
    organizationId,
  })
  const updateProviderKey = useUpdateProviderKey()
  const deleteProviderKey = useDeleteProviderKey()
  const toggleProviderKey = useToggleProviderKey()

  const [newKeys, setNewKeys] = useState<EditableProviderKey[]>([])
  const [existingKeys, setExistingKeys] = useState<EditableProviderKey[]>([])
  const [allKeys, setAllKeys] = useState<EditableProviderKey[]>([])

  useEffect(() => {
    setNewKeys([])
  }, [open])

  // Transform provider keys to editable format
  useEffect(() => {
    const existingKeys = providerKeys.map((key) => ({
      id: key.id,
      providerId: key.providerId,
      key: {
        ...getDefaultValuesForProvider(key.providerId),
        ...key.key,
      },
      disabled: key.disabled,
      isEditing: false,
      isNew: false,
    }))

    setExistingKeys(existingKeys)
  }, [providerKeys])

  useEffect(() => {
    setAllKeys([...newKeys, ...existingKeys])
  }, [newKeys, existingKeys])

  // Handle adding new provider key
  const handleAddNew = useCallback(() => {
    const newKey: EditableProviderKey = {
      id: `${TEMP_ID_PREFIX}${Date.now()}`,
      providerId,
      key: getDefaultValuesForProvider(providerId),
      disabled: false,
      isEditing: true,
      isNew: true,
    }

    setNewKeys((prev) => [newKey, ...prev])

    // Scroll to the first item (new item)
    setTimeout(() => {
      vListRef.current?.scrollToIndex(0, { align: 'start', smooth: true })
    }, 100)
  }, [providerId])

  // Handle editing existing provider key
  const handleEdit = useCallback((id: string) => {
    setNewKeys((prev) => prev.map((key) => (key.id === id ? { ...key, isEditing: true } : key)))
    setExistingKeys((prev) =>
      prev.map((key) => (key.id === id ? { ...key, isEditing: true } : key)),
    )
  }, [])

  // Handle canceling edits
  const handleCancel = useCallback((id: string) => {
    setNewKeys((prev) => prev.map((key) => (key.id === id ? { ...key, isEditing: false } : key)))
    setExistingKeys((prev) =>
      prev.map((key) => (key.id === id ? { ...key, isEditing: false } : key)),
    )
  }, [])

  // Handle saving changes
  const handleSave = useCallback(
    async (id: string, formData: ProviderKeyFormValues) => {
      if (id.startsWith(TEMP_ID_PREFIX)) {
        // This is a new key, create it via API
        await createProviderKey({
          key: formData.key,
          disabled: formData.disabled,
        })

        await refetchProviderKeys()
        await refetchProviders()

        // Remove the temporary item from local state
        setNewKeys((prev) => prev.filter((key) => key.id !== id))
      } else {
        // This is an existing key, update it via API
        await updateProviderKey({
          id,
          key: formData.key,
          disabled: formData.disabled,
        })

        await refetchProviders()

        // Update local state
        setExistingKeys((prev) =>
          prev.map((key) => (key.id === id ? { ...key, isEditing: false } : key)),
        )
      }
    },
    [createProviderKey, refetchProviderKeys, refetchProviders, updateProviderKey],
  )

  // Handle removing temporary items or deleting existing ones
  const handleRemove = useCallback(
    async (id: string) => {
      if (id.startsWith(TEMP_ID_PREFIX)) {
        // This is a temporary item, just remove from local state
        setNewKeys((prev) => prev.filter((key) => key.id !== id))
        return
      }

      // This is an existing key, delete it via API
      await deleteProviderKey(id)

      await refetchProviders()

      // Remove from local state
      setExistingKeys((prev) => prev.filter((key) => key.id !== id))
    },
    [deleteProviderKey, refetchProviders],
  )

  const handleToggle = useCallback(
    async (id: string, disabled: boolean) => {
      if (id.startsWith(TEMP_ID_PREFIX)) {
        setNewKeys((prev) => prev.map((key) => (key.id === id ? { ...key, disabled } : key)))
        return
      }

      setExistingKeys((prev) => prev.map((key) => (key.id === id ? { ...key, disabled } : key)))

      await toggleProviderKey(id, disabled)

      await refetchProviderKeys()
      await refetchProviders()
    },
    [toggleProviderKey, refetchProviderKeys, refetchProviders],
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[500px]">
        <SheetHeader className="flex flex-row items-center gap-4">
          <Avatar className="size-10 rounded-lg">
            <AvatarImage src={`/images/providers/${provider.icon}`} alt={provider.name} />
            <AvatarFallback>
              <ServerIcon />
            </AvatarFallback>
          </Avatar>
          <div>
            <SheetTitle>{provider.name}</SheetTitle>
            <SheetDescription>Use your own provider API keys (BYOK)</SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 flex flex-col gap-4 px-4 pb-4 overflow-y-auto [overflow-anchor:none]">
          {allKeys.length === 0 ? (
            // Empty state with add button
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-muted-foreground mb-4">
                <p className="text-lg font-medium">No API keys found for {provider.name}</p>
                <p className="text-sm">You can add an API key</p>
              </div>
              <Button onClick={handleAddNew} size="sm">
                <PlusIcon />
                Add API Key
              </Button>
            </div>
          ) : (
            // Existing keys list
            <Virtualizer ref={vListRef} count={allKeys.length + 1}>
              {(index) => {
                if (index === 0) {
                  return (
                    <div className="mb-4 flex justify-end">
                      <Button onClick={handleAddNew} size="sm">
                        <PlusIcon />
                        Add
                      </Button>
                    </div>
                  )
                }

                const key = allKeys[index - 1]!

                return (
                  <ProviderKeyItem
                    key={key.id}
                    index={index - 1}
                    providerKey={key}
                    onEdit={() => handleEdit(key.id)}
                    onCancel={() => handleCancel(key.id)}
                    onSave={(formData) => handleSave(key.id, formData)}
                    onRemove={() => handleRemove(key.id)}
                    onToggle={(disabled: boolean) => handleToggle(key.id, disabled)}
                  />
                )
              }}
            </Virtualizer>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ProviderKeyItem({
  index,
  providerKey,
  onEdit,
  onCancel,
  onSave,
  onRemove,
  onToggle,
}: {
  index: number
  providerKey: EditableProviderKey
  onEdit: () => void
  onCancel: () => void
  onSave: (formData: ProviderKeyFormValues) => Promise<void>
  onRemove: () => Promise<void>
  onToggle: (disabled: boolean) => Promise<void>
}) {
  // Track loading states for specific actions separately
  const [isSaving, setIsSaving] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  // Handle save with loading state
  const handleSave = async (formData: ProviderKeyFormValues) => {
    setIsSaving(true)
    try {
      await onSave(formData)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle remove with loading state
  const handleRemove = async () => {
    setIsRemoving(true)
    try {
      await onRemove()
    } finally {
      setIsRemoving(false)
    }
  }

  const handleToggle = async (disabled: boolean) => {
    setIsSaving(true)
    try {
      await onToggle(disabled)
    } finally {
      setIsSaving(false)
    }
  }

  if (providerKey.isEditing) {
    return (
      <ProviderKeyItemEdit
        index={index}
        providerKey={providerKey}
        isSaving={isSaving}
        isRemoving={isRemoving}
        onCancel={onCancel}
        onSave={handleSave}
        onRemove={handleRemove}
      />
    )
  } else {
    return (
      <ProviderKeyItemView
        index={index}
        providerKey={providerKey}
        isSaving={isSaving}
        isRemoving={isRemoving}
        onEdit={onEdit}
        onRemove={handleRemove}
        onToggle={handleToggle}
      />
    )
  }
}

function ProviderKeyItemView({
  index,
  providerKey,
  isSaving,
  isRemoving,
  onEdit,
  onRemove,
  onToggle,
}: {
  index: number
  providerKey: EditableProviderKey
  isSaving: boolean
  isRemoving: boolean
  onEdit: () => void
  onRemove: () => Promise<void>
  onToggle: (disabled: boolean) => Promise<void>
}) {
  const isDisabled = isSaving || isRemoving

  return (
    <div className="border rounded-lg p-4 my-4 flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="font-medium">Key #{index + 1}</span>
          {providerKey.isNew && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">New</span>
          )}
          {providerKey.disabled && (
            <span className="text-xs bg-muted px-2 py-1 rounded">Disabled</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Switch
            checked={!providerKey.disabled}
            onCheckedChange={(checked) => onToggle(!checked)}
            disabled={isDisabled}
          />
          <Button
            variant="outline"
            size="icon"
            className="size-6"
            onClick={onEdit}
            disabled={isDisabled}
          >
            <EditIcon className="size-3" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-6"
            onClick={onRemove}
            disabled={isDisabled}
          >
            {isRemoving ? <CircleSpinner className="size-3" /> : <Trash2Icon className="size-3" />}
          </Button>
        </div>
      </div>
      <div className="text-sm text-muted-foreground">
        {providerKey.key.apiKey && (
          <div>
            API Key: <span className="font-mono">{formatDecryptedKey(providerKey.key.apiKey)}</span>
          </div>
        )}
        {providerKey.key.baseUrl && (
          <div>
            Base URL: <span className="font-mono">{providerKey.key.baseUrl}</span>
          </div>
        )}
        {providerKey.key.apiVersion && (
          <div>
            API Version: <span className="font-mono">{providerKey.key.apiVersion}</span>
          </div>
        )}
        {providerKey.key.region && (
          <div>
            Region: <span className="font-mono">{providerKey.key.region}</span>
          </div>
        )}
        {providerKey.key.accessKeyId && (
          <div>
            Access Key ID:{' '}
            <span className="font-mono">{formatDecryptedKey(providerKey.key.accessKeyId)}</span>
          </div>
        )}
        {providerKey.key.secretAccessKey && (
          <div>
            Secrete Access Key:{' '}
            <span className="font-mono">{formatDecryptedKey(providerKey.key.secretAccessKey)}</span>
          </div>
        )}
        {providerKey.key.location && (
          <div>
            Location: <span className="font-mono">{providerKey.key.location}</span>
          </div>
        )}
        {providerKey.key.serviceAccountJson && (
          <div>
            Service Account JSON:{' '}
            <span className="font-mono">
              {formatDecryptedKey(providerKey.key.serviceAccountJson)}
            </span>
          </div>
        )}
        {providerKey.key.apiToken && (
          <div>
            API Token:{' '}
            <span className="font-mono">{formatDecryptedKey(providerKey.key.apiToken)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const emptyValuesForEncryptedFields = {
  apiKey: '',
  accessKeyId: '',
  secretAccessKey: '',
  serviceAccountJson: '',
  apiToken: '',
}

function ProviderKeyItemEdit({
  index,
  providerKey,
  isSaving,
  isRemoving,
  onCancel,
  onSave,
  onRemove,
}: {
  index: number
  providerKey: EditableProviderKey
  isSaving: boolean
  isRemoving: boolean
  onCancel: () => void
  onSave: (formData: ProviderKeyFormValues) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const form = useForm<ProviderKeyFormValues>({
    resolver: zodResolver(providerKeyFormSchema),
    defaultValues: {
      disabled: providerKey.disabled,
      key: {
        ...providerKey.key,
        ...emptyValuesForEncryptedFields,
        ...(providerKey.providerId !== 'azure' && {
          baseUrl: providerKey.key.baseUrl ? providerKey.key.baseUrl : undefined,
        }),
      },
    },
  })

  const handleSave = async () => {
    console.log(form.getValues())
    if (await form.trigger()) {
      const formData = form.getValues()
      await onSave(formData)
    }
  }

  const handleCancel = () => {
    onCancel()
  }

  // Disable form inputs only when saving or removing
  const isFormDisabled = isSaving || isRemoving

  return (
    <div className="border rounded-lg p-4 my-4 bg-muted/50">
      <Form {...form}>
        <form className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">
              {providerKey.isNew ? 'New Key' : 'Edit Key'} #{index + 1}
            </h4>
            <div className="flex items-center gap-2">
              {!providerKey.isNew && (
                <Button
                  variant="outline"
                  size="icon"
                  className="size-6"
                  onClick={handleCancel}
                  disabled={isFormDisabled}
                >
                  <XIcon className="size-3" />
                </Button>
              )}
              <Button
                size="icon"
                className="size-6"
                onClick={(e) => {
                  e.preventDefault()
                  void handleSave()
                }}
                disabled={isFormDisabled}
              >
                {isSaving ? <CircleSpinner className="size-3" /> : <CheckIcon className="size-3" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-6"
                onClick={onRemove}
                disabled={isFormDisabled}
              >
                {isRemoving ? (
                  <CircleSpinner className="size-3" />
                ) : (
                  <Trash2Icon className="size-3" />
                )}
              </Button>
            </div>
          </div>

          {/* API Key - for non-bedrock, non-vertex, non-replicate providers */}
          {!['bedrock', 'vertex', 'replicate'].includes(providerKey.providerId) && (
            <FormField
              control={form.control}
              name="key.apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormControl>
                    <OptionalInput
                      type="password"
                      placeholder="Enter API key"
                      {...field}
                      disabled={isFormDisabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Base URL */}
          <FormField
            control={form.control}
            name="key.baseUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base URL {providerKey.providerId !== 'azure' && '(Optional)'}</FormLabel>
                <FormControl>
                  <OptionalInput
                    placeholder="Enter base URL"
                    {...field}
                    disabled={isFormDisabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Azure-specific fields */}
          {providerKey.providerId === 'azure' && (
            <FormField
              control={form.control}
              name="key.apiVersion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Version (Optional)</FormLabel>
                  <FormControl>
                    <OptionalInput
                      placeholder="Enter API version"
                      {...field}
                      disabled={isFormDisabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Bedrock-specific fields */}
          {providerKey.providerId === 'bedrock' && (
            <>
              <FormField
                control={form.control}
                name="key.region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Region</FormLabel>
                    <FormControl>
                      <OptionalInput
                        placeholder="Enter region"
                        {...field}
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="key.accessKeyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access Key ID</FormLabel>
                    <FormControl>
                      <OptionalInput
                        type="password"
                        placeholder="Enter access key ID"
                        {...field}
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="key.secretAccessKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secret Access Key</FormLabel>
                    <FormControl>
                      <OptionalInput
                        type="password"
                        placeholder="Enter secret access key"
                        {...field}
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {/* Vertex-specific fields */}
          {providerKey.providerId === 'vertex' && (
            <>
              <FormField
                control={form.control}
                name="key.location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location (Optional)</FormLabel>
                    <FormControl>
                      <OptionalInput
                        placeholder="us-central1"
                        {...field}
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="key.serviceAccountJson"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Account JSON</FormLabel>
                    <FormControl>
                      <OptionalInput
                        type="password"
                        placeholder='{ "type": "...", "project_id": "...", "private_key_id": "...", "private_key": "...", "client_email": "..." }'
                        {...field}
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {/* Replicate-specific fields */}
          {providerKey.providerId === 'replicate' && (
            <FormField
              control={form.control}
              name="key.apiToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Token</FormLabel>
                  <FormControl>
                    <OptionalInput
                      type="password"
                      placeholder="Enter API token"
                      {...field}
                      disabled={isFormDisabled}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Disabled switch */}
          <FormField
            control={form.control}
            name="disabled"
            render={({ field }) => (
              <FormItem className="flex items-center space-x-2">
                <FormLabel>Enabled</FormLabel>
                <FormControl>
                  <Switch
                    checked={!field.value}
                    onCheckedChange={(checked) => field.onChange(!checked)}
                    disabled={isFormDisabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
    </div>
  )
}

function formatDecryptedKey(key: string): string {
  return key + '••••••••'
}
