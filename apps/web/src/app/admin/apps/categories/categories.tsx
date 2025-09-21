'use client'

import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { PencilIcon, PlusCircle, TrashIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import type { Category } from '@cared/db/schema'
import { CreateCategorySchema, UpdateCategorySchema } from '@cared/db/schema'
import { Button } from '@cared/ui/components/button'
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
import { CircleSpinner } from '@cared/ui/components/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cared/ui/components/table'

import { orpc } from '@/lib/orpc'

export function Categories() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [currentCategory, setCurrentCategory] = useState<Category>()

  // Fetch all categories using suspense
  const { data, refetch } = useSuspenseQuery({
    ...orpc.app.listCategories.queryOptions({
      input: {
        limit: 100,
      },
    }),
  })

  // Create category mutation
  const createMutation = useMutation({
    ...orpc.admin.createCategory.mutationOptions({
      onSuccess: () => {
        toast.success('Category created successfully')
        setIsCreateDialogOpen(false)
        createForm.reset()
        void refetch() // Refresh the list
      },
      onError: (error) => {
        console.error('Failed to create category:', error)
        toast.error(`Failed to create category: ${error.message}`)
      },
    }),
  })

  // Update category mutation
  const updateMutation = useMutation({
    ...orpc.admin.updateCategory.mutationOptions({
      onSuccess: () => {
        toast.success('Category updated successfully')
        setIsEditDialogOpen(false)
        editForm.reset()
        void refetch() // Refresh the list
      },
      onError: (error) => {
        console.error('Failed to update category:', error)
        toast.error(`Failed to update category: ${error.message}`)
      },
    }),
  })

  // Delete category mutation
  const deleteMutation = useMutation({
    ...orpc.admin.deleteCategory.mutationOptions({
      onSuccess: () => {
        toast.success('Category deleted successfully')
        setIsDeleteDialogOpen(false)
        setCurrentCategory(undefined)
        void refetch() // Refresh the list
      },
      onError: (error) => {
        console.error('Failed to delete category:', error)
        toast.error(`Failed to delete category: ${error.message}`)
      },
    }),
  })

  // Create category form
  const createForm = useForm({
    resolver: zodResolver(CreateCategorySchema),
    defaultValues: {
      name: '',
    },
  })

  // Edit category form
  const editForm = useForm({
    resolver: zodResolver(UpdateCategorySchema),
    defaultValues: {
      id: '',
      name: '',
    },
  })

  // Open edit dialog
  const openEditDialog = (category: Category) => {
    setCurrentCategory(category)
    editForm.reset({
      id: category.id,
      name: category.name,
    })
    setIsEditDialogOpen(true)
  }

  // Open delete confirmation dialog
  const openDeleteDialog = (category: Category) => {
    setCurrentCategory(category)
    setIsDeleteDialogOpen(true)
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground mt-2">
            Manage app categories, create new ones, edit existing ones, or delete unwanted
            categories.
          </p>
        </div>
        <Button
          onClick={() => {
            createForm.reset()
            setIsCreateDialogOpen(true)
          }}
        >
          <PlusCircle className="mr-2 h-4 w-4" /> Add Category
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead>Updated At</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.categories.length > 0 ? (
            data.categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-mono text-xs">{category.id}</TableCell>
                <TableCell>{category.name}</TableCell>
                <TableCell>{new Date(category.createdAt).toLocaleString()}</TableCell>
                <TableCell>{new Date(category.updatedAt).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(category)}
                    title="Edit category"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openDeleteDialog(category)}
                    className="text-destructive"
                    title="Delete category"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                No categories found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Create Category Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
            <DialogDescription>
              Add a new category for apps. You can later assign apps to this category.
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit((data) => {
                return createMutation.mutateAsync({
                  ...data,
                  name: data.name.trim(),
                })
              })}
              className="space-y-4"
            >
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter category name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
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

      {/* Edit Category Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>Modify the existing category name.</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) => {
                return updateMutation.mutateAsync({
                  ...data,
                  name: data.name.trim(),
                })
              })}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter category name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    updateMutation.isPending ||
                    editForm.watch('name').trim() === currentCategory?.name
                  }
                >
                  {updateMutation.isPending ? (
                    <>
                      <CircleSpinner />
                      Updating...
                    </>
                  ) : (
                    'Update'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the category "{currentCategory?.name}"? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (currentCategory) {
                  return deleteMutation.mutateAsync({ id: currentCategory.id })
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
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
