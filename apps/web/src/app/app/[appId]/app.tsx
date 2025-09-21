'use client'

import { useCallback } from 'react'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { App as AppType } from '@cared/db/schema'

import { SectionTitle } from '@/components/section'
import { UploadLogo } from '@/components/upload-logo'
import { orpc } from '@/lib/orpc'
import defaultLogo from '@/public/images/agent.png'

export function App({ appId }: { appId: string }) {
  // Get app information
  const {
    data: { app },
  } = useSuspenseQuery({
    ...orpc.app.byId.queryOptions({
      input: {
        id: appId,
      },
    }),
  })

  return <UpdateAppLogo app={app} />
}

function UpdateAppLogo({ app }: { app: AppType }) {
  const queryClient = useQueryClient()

  // App update mutation
  const updateMutation = useMutation({
    ...orpc.app.update.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries(
          orpc.app.byId.queryOptions({
            input: {
              id: app.id,
            },
          }),
        )
      },
      onError: (error) => {
        console.error('Failed to update app logo:', error)
        toast.error(`Failed to update app logo: ${error.message}`)
      },
    }),
  })

  const onLogoUrlChange = useCallback(
    async (logoUrl: string) => {
      if (logoUrl !== app.metadata.imageUrl) {
        await updateMutation.mutateAsync({
          id: app.id,
          metadata: {
            imageUrl: logoUrl,
          },
        })
      }
    },
    [app, updateMutation],
  )

  return (
    <>
      <SectionTitle title="Design" />

      <div className="container mx-auto px-4 sm:px-0">
        <UploadLogo
          location={{
            type: 'app',
            appId: app.id,
          }}
          logoUrl={app.metadata.imageUrl}
          onLogoUrlChange={onLogoUrlChange}
          defaultLogo={defaultLogo}
        />
      </div>
    </>
  )
}
