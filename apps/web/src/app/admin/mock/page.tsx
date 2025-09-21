'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Database, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@cared/ui/components/alert'
import { Button } from '@cared/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@cared/ui/components/card'
import { CircleSpinner } from '@cared/ui/components/spinner'

import { orpc } from '@/lib/orpc'

/**
 * Admin Mock Page
 * Allows administrators to populate the database with mock data for testing purposes
 * Can only be executed once - checks if data already exists by counting users
 */
export default function Page() {
  const [isMocked, setIsMocked] = useState(false)

  // Query to check if data has already been mocked
  const { data, isLoading, isError, refetch } = useQuery({
    ...orpc.admin.listUsers.queryOptions({
      input: {
        limit: 11, // Get 11 users to check if there are more than 10
      },
    }),
    retry: 1,
  })

  // Mock data mutation
  const mockMutation = useMutation(
    orpc.admin.mock.mutationOptions({
      onSuccess: () => {
        toast.success('Data successfully added to database')
        setIsMocked(true)
        void refetch() // Refresh the user list to confirm data was added
      },
      onError: (error) => {
        console.error('Failed to mock data:', error)
        toast.error('Failed to add data')
      },
    }),
  )

  // Determine if data has already been mocked
  const hasBeenMocked = data?.users && data.users.length > 10

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-2">Mock Data</h1>
      <p className="text-muted-foreground mb-8">
        Add mock data to the database in the development environment for testing and development
        purposes.
      </p>

      <div className="grid gap-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Data Status
            </CardTitle>
            <CardDescription>Check if mock data already exists in the database.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking database status...
              </div>
            ) : isError ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Check Failed</AlertTitle>
                <AlertDescription>
                  Unable to check database status. Make sure you have admin privileges.
                </AlertDescription>
              </Alert>
            ) : hasBeenMocked || isMocked ? (
              <Alert className="bg-green-50 text-green-800 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle>Data Exists</AlertTitle>
                <AlertDescription>
                  Mock data already exists in the database. No need to add again.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <AlertTitle>Data Does Not Exist</AlertTitle>
                <AlertDescription>
                  No mock data in the database yet. You can click the button below to add it.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button
              onClick={() => mockMutation.mutateAsync({})}
              disabled={isLoading || hasBeenMocked || isMocked || mockMutation.isPending}
            >
              {mockMutation.isPending ? (
                <>
                  <CircleSpinner />
                  Adding data...
                </>
              ) : (
                'Add Mock Data'
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>About Mock Data</CardTitle>
            <CardDescription>
              Learn about the types of data that will be added to the database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium mb-1">User Data</h3>
              <p className="text-sm text-muted-foreground">
                Multiple test users will be added, including names, emails, and profile information.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-1">Workspace Data</h3>
              <p className="text-sm text-muted-foreground">
                Multiple workspaces will be created, and test users will be assigned as members or
                owners.
              </p>
            </div>
            <div>
              <h3 className="font-medium mb-1">Important Notes</h3>
              <p className="text-sm text-muted-foreground">
                Mock data can only be added once. If you need to reset the data, please clear the
                database directly.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
