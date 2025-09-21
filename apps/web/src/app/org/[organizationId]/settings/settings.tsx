'use client'

import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Trash2, UserPlus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod/v4'

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

import { SectionTitle } from '@/components/section'
import { useActiveOrganization } from '@/hooks/use-active'
import { useMembers } from '@/hooks/use-members'
import { useTransferOrganizationOwnership, useUpdateOrganization } from '@/hooks/use-organization'
import { useSession } from '@/hooks/use-session'

// Schema for updating organization
const updateOrganizationSchema = z.object({
  name: z
    .string()
    .min(1, 'Organization name cannot be empty')
    .max(128, 'Organization name cannot be longer than 128 characters'),
})

/**
 * Organization settings component
 * Allows updating organization name, transferring ownership, and deleting organization
 */
export function Settings() {
  const { user } = useSession()

  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)

  const activeOrganization = useActiveOrganization()
  const members = useMembers(activeOrganization?.id)

  const currentUserMember = members.find((member) => member.userId === user.id)
  const isOwner = currentUserMember?.role === 'owner'

  // Use encapsulated hooks for mutations
  const updateOrganization = useUpdateOrganization()
  const transferOwnership = useTransferOrganizationOwnership()

  // Form for updating organization name
  const form = useForm({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      name: activeOrganization?.name ?? '',
    },
  })

  // Handle form submission
  const handleSubmit = async (data: { name: string }) => {
    if (isUpdating) return

    setIsUpdating(true)
    try {
      await updateOrganization({
        id: activeOrganization?.id ?? '',
        name: data.name.trim(),
      })
      // Reset form with new name on success
      form.reset({ name: data.name.trim() })
    } finally {
      setIsUpdating(false)
    }
  }

  // Handle transfer ownership
  const handleTransferOwnership = async () => {
    if (selectedUserId && !isTransferring) {
      setIsTransferring(true)
      try {
        await transferOwnership({
          organizationId: activeOrganization?.id ?? '',
          memberId: selectedUserId,
        })
        // Reset dialog state on success
        setIsTransferDialogOpen(false)
        setSelectedUserId('')
      } finally {
        setIsTransferring(false)
      }
    }
  }

  return (
    <>
      <SectionTitle title="Settings" description="Manage your organization settings" />

      <div className="space-y-6">
        {/* Organization Name */}
        <Card>
          <CardHeader>
            <CardTitle>Organization Name</CardTitle>
            <CardDescription>
              Update your organization name. This will be visible to all members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Organization name"
                          {...field}
                          disabled={!isOwner || isUpdating}
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
                    !isOwner || isUpdating || form.watch('name').trim() === activeOrganization?.name
                  }
                >
                  {isUpdating ? (
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
                    Only organization owners can change the organization name.
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
              Transfer ownership of this organization to another member. You will become a regular
              member.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">
                Select a member to transfer ownership to. This action cannot be undone.
              </p>
              {/* Show message when no other members are available */}
              {members.filter((member) => member.userId !== currentUserMember?.userId).length ===
                0 && (
                <p className="text-sm text-amber-600 mt-2">
                  No other members available to transfer ownership to.
                </p>
              )}
            </div>
            <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={
                    !isOwner ||
                    members.filter((member) => member.userId !== currentUserMember.userId)
                      .length === 0
                  }
                >
                  <UserPlus className="h-4 w-4" />
                  Transfer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transfer Organization Ownership</DialogTitle>
                  <DialogDescription>
                    Select a member to transfer ownership to. This action cannot be undone. You will
                    become a regular member of the organization.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Select
                    value={selectedUserId}
                    onValueChange={setSelectedUserId}
                    disabled={isTransferring}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members
                        .filter((member) => member.userId !== currentUserMember?.userId)
                        .map((member) => (
                          <SelectItem key={member.userId} value={member.userId}>
                            {member.user.name} ({member.user.email})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsTransferDialogOpen(false)}
                    disabled={isTransferring}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleTransferOwnership}
                    disabled={!selectedUserId || isTransferring}
                  >
                    {isTransferring ? (
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
                Only organization owners can transfer ownership.
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
            {/* Delete Organization */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <h3 className="font-medium">Delete Organization</h3>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this organization and all associated data.
                </p>
                <p className="text-sm text-amber-600 mt-1">
                  Organization deletion is currently disabled for safety reasons.
                </p>
              </div>
              <Button variant="destructive" disabled>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            {!isOwner && (
              <p className="text-sm text-muted-foreground">
                Only organization owners can perform these actions.
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    </>
  )
}
