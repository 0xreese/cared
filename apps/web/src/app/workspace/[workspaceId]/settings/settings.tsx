'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Trash2, UserPlus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { updateWorkspaceSchema } from '@cared/api/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@cared/ui/components/alert-dialog'
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
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cared/ui/components/select'
import { CircleSpinner } from '@cared/ui/components/spinner'

import { useActive } from '@/hooks/use-active'
import { useMembers } from '@/hooks/use-members'
import { useSession } from '@/hooks/use-session'
import { orpc } from '@/lib/orpc'

/**
 * General settings component for workspace
 * Allows updating workspace name, transferring ownership, and deleting workspace
 */
export function Settings() {
  const router = useRouter()

  const queryClient = useQueryClient()

  const { activeWorkspace, activeOrganization } = useActive()
  const { user } = useSession()

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>('')

  // Get organization members to check current user's role
  const members = useMembers(activeOrganization?.id ?? '')
  const currentUserMember = members.find((member) => member.userId === user.id)
  const isOwner = currentUserMember?.role === 'owner'

  // Form for updating workspace name
  const form = useForm({
    resolver: zodResolver(updateWorkspaceSchema.omit({ id: true })),
    defaultValues: {
      name: activeWorkspace?.name ?? '',
    },
  })

  // Update form values when activeWorkspace changes
  useEffect(() => {
    if (activeWorkspace?.name) {
      form.reset({ name: activeWorkspace.name })
    }
  }, [activeWorkspace?.name, form])

  // Update workspace mutation
  const updateWorkspaceMutation = useMutation(
    orpc.workspace.update.mutationOptions({
      onSuccess: (data) => {
        form.reset({ name: data.workspace.name })
        void queryClient.invalidateQueries(
          orpc.workspace.get.queryOptions({ input: { id: activeWorkspace?.id ?? '' } }),
        )
        toast.success('Workspace name updated successfully')
      },
      onError: (error: unknown) => {
        console.error('Failed to update workspace:', error)
        toast.error('Failed to update workspace name')
      },
    }),
  )

  // Delete workspace mutation
  const deleteWorkspaceMutation = useMutation(
    orpc.workspace.delete.mutationOptions({
      onSuccess: () => {
        setIsDeleteDialogOpen(false)
        toast.success('Workspace deleted successfully')
        router.push('/')
      },
      onError: (error: unknown) => {
        setIsDeleteDialogOpen(false)
        console.error('Failed to delete workspace:', error)
        toast.error('Failed to delete workspace')
      },
    }),
  )

  // Transfer ownership mutation
  const transferOwnershipMutation = useMutation(
    orpc.workspace.transferOwnership.mutationOptions({
      onSuccess: () => {
        setIsTransferDialogOpen(false)
        setSelectedOrganizationId('')
        toast.success('Workspace ownership transferred successfully')

        // Refresh workspace data
        void queryClient.invalidateQueries(
          orpc.workspace.get.queryOptions({ input: { id: activeWorkspace?.id ?? '' } }),
        )
      },
      onError: (error: unknown) => {
        console.error('Failed to transfer ownership:', error)
        toast.error('Failed to transfer workspace ownership')
      },
    }),
  )

  // Early return if no active workspace
  if (!activeWorkspace) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Workspace Name */}
      <Card>
        <CardHeader>
          <CardTitle>Workspace Name</CardTitle>
          <CardDescription>
            Update your workspace name. This will be visible to all members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => {
                return updateWorkspaceMutation.mutateAsync({
                  id: activeWorkspace.id,
                  name: data.name.trim(),
                })
              })}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Workspace name"
                        {...field}
                        disabled={!isOwner || form.formState.isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>
                      This is the name that will be displayed to all members.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={
                  !isOwner ||
                  form.formState.isSubmitting ||
                  form.watch('name').trim() === activeWorkspace.name
                }
              >
                {form.formState.isSubmitting ? (
                  <>
                    <CircleSpinner />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
              {!isOwner && (
                <p className="text-sm text-muted-foreground mt-2">
                  Only workspace owners can change the workspace name.
                </p>
              )}
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Transfer Ownership */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Transfer Ownership</CardTitle>
          <CardDescription>
            Transfer ownership of this workspace to another organization. This action cannot be
            undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Select an organization to transfer ownership to. This action cannot be undone.
          </p>
          <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!isOwner}>
                <UserPlus className="h-4 w-4" />
                Transfer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Transfer Workspace Ownership</DialogTitle>
                <DialogDescription>
                  Select an organization to transfer ownership to. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Select
                  value={selectedOrganizationId}
                  onValueChange={setSelectedOrganizationId}
                  disabled={transferOwnershipMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Note: This would need to be populated with available organizations */}
                    <SelectItem value="org_example" disabled>
                      No other organizations available
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsTransferDialogOpen(false)}
                  disabled={transferOwnershipMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedOrganizationId) {
                      return transferOwnershipMutation.mutateAsync({
                        workspaceId: activeWorkspace.id,
                        organizationId: selectedOrganizationId,
                      })
                    }
                  }}
                  disabled={!selectedOrganizationId || transferOwnershipMutation.isPending}
                >
                  {transferOwnershipMutation.isPending ? (
                    <>
                      <CircleSpinner />
                      Transferring...
                    </>
                  ) : (
                    'Transfer Ownership'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
        <CardFooter>
          {!isOwner && (
            <p className="text-sm text-muted-foreground">
              Only workspace owners can transfer ownership.
            </p>
          )}
        </CardFooter>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Actions here can't be undone. Please proceed with caution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Delete Workspace */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <h3 className="font-medium">Delete Workspace</h3>
              <p className="text-sm text-muted-foreground">
                Permanently delete this workspace and all associated data.
              </p>
            </div>
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!isOwner}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the workspace "
                    {activeWorkspace.name}" and all associated data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteWorkspaceMutation.isPending}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault()
                      return deleteWorkspaceMutation.mutateAsync({ id: activeWorkspace.id })
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteWorkspaceMutation.isPending ? (
                      <>
                        <CircleSpinner />
                        Deleting...
                      </>
                    ) : (
                      'Delete'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
        <CardFooter>
          {!isOwner && (
            <p className="text-sm text-muted-foreground">
              Only workspace owners can perform these actions.
            </p>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
