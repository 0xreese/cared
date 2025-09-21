'use client'

import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@cared/ui/components/button'
import { Checkbox } from '@cared/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@cared/ui/components/dialog'
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

export function Tags() {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isSelectAll, setIsSelectAll] = useState(false)
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({})
  const PAGE_SIZE = 100

  // Fetch tags using paginated query
  const { data, isPending, refetch } = useQuery({
    ...orpc.app.listTags.queryOptions({
      input: {
        limit: PAGE_SIZE,
        ...cursor,
      },
    }),
    placeholderData: keepPreviousData,
  })

  // Delete tags mutation
  const deleteMutation = useMutation({
    ...orpc.admin.deleteTags.mutationOptions({
      onSuccess: () => {
        toast.success('Tags deleted successfully')
        setIsDeleteDialogOpen(false)
        setSelectedTags([])
        setIsSelectAll(false)
        void refetch() // Refresh the list
      },
      onError: (error) => {
        console.error('Failed to delete tags:', error)
        toast.error(`Failed to delete tags: ${error.message}`)
      },
    }),
  })

  // Tags list from current page
  const tags = data?.tags ?? []

  // Toggle select all
  const toggleSelectAll = () => {
    const newState = !isSelectAll
    setIsSelectAll(newState)

    if (newState) {
      // Select all: get all tag names
      setSelectedTags(tags.map((tag) => tag.name))
    } else {
      // Deselect all
      setSelectedTags([])
    }
  }

  // Toggle single tag selection
  const toggleSelect = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((name) => name !== tagName) : [...prev, tagName],
    )
  }

  // Open delete confirmation dialog
  const openDeleteDialog = () => {
    if (selectedTags.length === 0) {
      toast.error('Please select tags to delete first')
      return
    }
    setIsDeleteDialogOpen(true)
  }

  // Execute delete operation
  const handleDelete = () => {
    if (selectedTags.length === 0) {
      toast.error('Please select tags to delete first')
      return
    }

    return deleteMutation.mutateAsync({
      tags: selectedTags,
    })
  }

  // Handle next page
  const handleNextPage = () => {
    if (data?.last) {
      setCursor({ after: data.last })
    }
  }

  // Handle previous page
  const handlePreviousPage = () => {
    if (data?.first) {
      setCursor({ before: data.first })
    }
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tags</h1>
          <p className="text-muted-foreground mt-2">View all tags or bulk delete unwanted tags.</p>
        </div>
        <Button
          variant="destructive"
          onClick={openDeleteDialog}
          disabled={selectedTags.length === 0}
        >
          <TrashIcon className="mr-2 h-4 w-4" /> Delete Selected
          {selectedTags.length ? ` (${selectedTags.length})` : undefined}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={isSelectAll}
                onCheckedChange={toggleSelectAll}
                aria-label="Select All"
              />
            </TableHead>
            <TableHead>Tag Name</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead>Updated At</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tags.length > 0 ? (
            tags.map((tag) => (
              <TableRow key={tag.name}>
                <TableCell>
                  <Checkbox
                    checked={selectedTags.includes(tag.name)}
                    onCheckedChange={() => toggleSelect(tag.name)}
                    aria-label={`Select ${tag.name}`}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">{tag.name}</TableCell>
                <TableCell>{new Date(tag.createdAt).toLocaleString()}</TableCell>
                <TableCell>{new Date(tag.updatedAt).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      toggleSelect(tag.name)
                      if (!selectedTags.includes(tag.name)) {
                        setSelectedTags((prev) => [...prev, tag.name])
                      }
                    }}
                    className="text-destructive"
                    title="Select for deletion"
                  >
                    {selectedTags.includes(tag.name) ? (
                      <CheckIcon className="h-4 w-4" />
                    ) : (
                      <TrashIcon className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground h-24">
                No tags found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination Controls */}
      <div className="flex justify-end items-center mt-6">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handlePreviousPage}
            disabled={isPending || !data?.first}
            size="sm"
          >
            {isPending && cursor.before ? (
              <CircleSpinner />
            ) : (
              <ChevronLeftIcon className="h-4 w-4 mr-1" />
            )}
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={handleNextPage}
            disabled={isPending || !data?.last}
            size="sm"
          >
            Next
            {isPending && cursor.after ? (
              <CircleSpinner />
            ) : (
              <ChevronRightIcon className="h-4 w-4 ml-1" />
            )}
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the following {selectedTags.length} tags? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-y-auto my-4 border rounded p-2">
            <ul className="list-disc list-inside">
              {selectedTags.map((tagName) => (
                <li key={tagName} className="font-mono text-xs">
                  {tagName}
                </li>
              ))}
            </ul>
          </div>
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
              onClick={handleDelete}
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
