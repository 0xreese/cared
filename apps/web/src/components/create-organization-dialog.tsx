'use client'

import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@cared/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@cared/ui/components/dialog'
import { Input } from '@cared/ui/components/input'
import { Label } from '@cared/ui/components/label'
import { CircleSpinner } from '@cared/ui/components/spinner'

import { orpc } from '@/lib/orpc'
import { stripIdPrefix } from '@/lib/utils'

export function CreateOrganizationDialog({
  menu,
  trigger,
  onSuccess,
}: {
  menu?: (props: { trigger: (props: { children: ReactNode }) => ReactNode }) => ReactNode
  trigger?: ReactNode
  onSuccess?: () => void
}) {
  const router = useRouter()

  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
    }
  }, [open])

  const createOrganization = useMutation(
    orpc.organization.create.mutationOptions({
      onSuccess: async (data) => {
        await queryClient.invalidateQueries(orpc.organization.list.queryOptions())

        if (onSuccess) {
          onSuccess()
        } else {
          router.push(`/org/${stripIdPrefix(data.organization.id)}`)
        }
      },
      onError: (error) => {
        console.error('Failed to create organization:', error)
        toast.error('Failed to create organization')
      },
    }),
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setIsSubmitting(true)
    try {
      await createOrganization.mutateAsync({
        name: name.trim(),
      })
      setOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const Menu = menu

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {Menu && (
        <Menu trigger={({ children }) => <DialogTrigger asChild>{children}</DialogTrigger>} />
      )}
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            Create a new organization to collaborate with team members and manage workspaces.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-8 mt-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Enter organization name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              maxLength={128}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || name.trim().length > 64 || isSubmitting}
            >
              {isSubmitting ? (
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
      </DialogContent>
    </Dialog>
  )
}
