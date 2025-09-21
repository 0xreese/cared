'use client'

import type { ChangeEvent, ComponentProps } from 'react'
import { useCallback, useState } from 'react'
import Image from 'next/image'
import { PencilIcon, UploadIcon, XIcon } from 'lucide-react'
import { usePresignedUpload } from 'next-s3-upload'
import { toast } from 'sonner'

import type { S3Location } from '@cared/api'
import { Button } from '@cared/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@cared/ui/components/dropdown-menu'
import { Spinner } from '@cared/ui/components/spinner'
import { cn } from '@cared/ui/lib/utils'

import { RemoteImage } from '@/components/image'
import { env } from '@/env'

export interface UploadLogoProps {
  /**
   * Upload location
   */
  location: S3Location
  /**
   * Current logo URL
   */
  logoUrl?: string
  /**
   * Callback function when logo changes
   */
  onLogoUrlChange?: (url: string) => void | Promise<void>
  defaultLogo: ComponentProps<typeof Image>['src']
  /**
   * Logo container width
   */
  width?: number
  /**
   * Logo container height
   */
  height?: number
  /**
   * Additional CSS class name
   */
  className?: string
}

/**
 * Logo upload component
 */
export function UploadLogo({
  location,
  logoUrl,
  onLogoUrlChange,
  defaultLogo,
  width = 120,
  height = 120,
  className,
}: UploadLogoProps) {
  const [isUploading, setIsUploading] = useState(false)
  const { uploadToS3 } = usePresignedUpload()

  // Handle file upload
  const handleFileUpload = useCallback(
    async (file: File) => {
      // Validate image file
      if (!file.type.startsWith('image/')) {
        throw new Error('Only image files are allowed')
      }

      if (!env.NEXT_PUBLIC_IMAGE_URL) {
        throw new Error('Environment variable NEXT_PUBLIC_IMAGE_URL is not set')
      }

      // Start uploading
      setIsUploading(true)

      let key = ''
      try {
        // Upload to S3
        key = (
          await uploadToS3(file, {
            endpoint: {
              request: {
                url: '/api/openapi/v1/files/s3-presigned-url',
                body: location,
              },
            },
          })
        ).key
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Upload failed, please try again')
        setIsUploading(false)
        return
      }

      try {
        await onLogoUrlChange?.(`${env.NEXT_PUBLIC_IMAGE_URL}/${key}`)
      } finally {
        setIsUploading(false)
      }
    },
    [location, onLogoUrlChange, uploadToS3],
  )

  // File input change handler
  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        void handleFileUpload(file)
        // Reset file input value to ensure the same file can be selected again
        event.target.value = ''
      }
    },
    [handleFileUpload],
  )

  return (
    <div
      className={cn(
        `relative overflow-hidden flex items-center justify-center bg-muted/50 rounded-lg`,
        isUploading && 'opacity-70',
        className,
      )}
      style={{ width, height }}
    >
      {logoUrl ? (
        // Show remote image if available
        <RemoteImage
          src={logoUrl}
          alt="App Logo"
          width={width}
          height={height}
          className="object-cover max-w-full max-h-full"
        />
      ) : (
        // Show default logo if nothing else
        <Image
          src={defaultLogo}
          alt="App Logo"
          width={width}
          height={height}
          className="object-cover max-w-full max-h-full"
        />
      )}

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <Spinner className="text-primary" />
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute bottom-1 right-1 rounded-full w-8 h-8 bg-background shadow-md hover:bg-muted border border-border"
            disabled={isUploading}
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => document.getElementById('logo-file-input')?.click()}>
            <UploadIcon className="h-4 w-4" />
            Upload image
          </DropdownMenuItem>
          {logoUrl && (
            <DropdownMenuItem
              onClick={async () => {
                setIsUploading(true)
                try {
                  await onLogoUrlChange?.('')
                } finally {
                  setIsUploading(false)
                }
              }}
            >
              <XIcon className="h-4 w-4" />
              Use default image
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        id="logo-file-input"
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  )
}
