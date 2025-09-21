import path from 'path'
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3ServiceException,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ORPCError } from '@orpc/server'
import { z } from 'zod/v4'

import { log } from '@cared/log'

import type { AppContext, BaseContext } from '../orpc'
import type { GetObjectCommandOutput, HeadObjectCommandOutput } from '@aws-sdk/client-s3'
import { s3Client } from '../client/s3'
import { env } from '../env'
import { appProtectedProcedure } from '../orpc'

function getKeyPrefixByApp(ctx: AppContext) {
  const appId = ctx.auth.appId
  return `${appId}/`
}

function getKeyWithPrefix(prefix: string, inputKey?: string) {
  if (inputKey?.startsWith(prefix)) {
    return inputKey
  }

  const key = path.posix.join(prefix, inputKey ?? '')
  if (!key.startsWith(prefix)) {
    throw new ORPCError('BAD_REQUEST', {
      message: 'Invalid key',
    })
  }
  return key
}

function getKeyByApp(ctx: AppContext, inputKey?: string) {
  const prefix = getKeyPrefixByApp(ctx)
  return getKeyWithPrefix(prefix, inputKey)
}

function getQueryHeaders(ctx: BaseContext) {
  return {
    IfMatch: ctx.headers.get('If-Match') ?? undefined,
    IfModifiedSince: z.coerce.date().safeParse(ctx.headers.get('If-Modified-Since') ?? undefined)
      .data,
    IfNoneMatch: ctx.headers.get('If-None-Match') ?? undefined,
    IfUnmodifiedSince: z.coerce
      .date()
      .safeParse(ctx.headers.get('If-Unmodified-Since') ?? undefined).data,
    Range: ctx.headers.get('Range') ?? undefined,
    // TODO: SSE-C
  }
}

function getMutateHeaders(ctx: BaseContext) {
  const metadata: Record<string, string> = {}
  for (const [key, value] of ctx.headers) {
    if (key.startsWith('x-amz-meta-')) {
      metadata[key] = value
    }
  }

  return {
    ContentType: ctx.headers.get('Content-Type') ?? undefined,
    CacheControl: ctx.headers.get('Cache-Control') ?? undefined,
    ContentDisposition: ctx.headers.get('Content-Disposition') ?? undefined,
    ContentEncoding: ctx.headers.get('Content-Encoding') ?? undefined,
    ContentLanguage: ctx.headers.get('Content-Language') ?? undefined,
    Expires: z.coerce.date().safeParse(ctx.headers.get('Expires') ?? undefined).data,
    ContentMD5: ctx.headers.get('Content-MD5') ?? undefined,
    Metadata: metadata,
    // TODO: SSE-C
  }
}

function setResponseHeaders(
  ctx: BaseContext,
  response: HeadObjectCommandOutput | GetObjectCommandOutput,
) {
  if (response.AcceptRanges) {
    ctx.resHeaders?.set('Accept-Ranges', response.AcceptRanges)
  }
  if (response.CacheControl) {
    ctx.resHeaders?.set('Cache-Control', response.CacheControl)
  }
  if (response.ContentDisposition) {
    ctx.resHeaders?.set('Content-Disposition', response.ContentDisposition)
  }
  if (response.ContentEncoding) {
    ctx.resHeaders?.set('Content-Encoding', response.ContentEncoding)
  }
  if (response.ContentLanguage) {
    ctx.resHeaders?.set('Content-Language', response.ContentLanguage)
  }
  if ((response as GetObjectCommandOutput).ContentRange) {
    ctx.resHeaders?.set('Content-Range', (response as GetObjectCommandOutput).ContentRange ?? '')
  }
  if (response.ContentType) {
    ctx.resHeaders?.set('Content-Type', response.ContentType)
  }
  if (response.ETag) {
    ctx.resHeaders?.set('ETag', response.ETag)
  }
  if (response.ExpiresString) {
    ctx.resHeaders?.set('Expires', response.ExpiresString)
  }
  if (response.LastModified) {
    ctx.resHeaders?.set('Last-Modified', response.LastModified.toUTCString())
  }
  if (response.ContentLength) {
    ctx.resHeaders?.set('Content-Length', response.ContentLength.toString())
  }
  if (response.Metadata) {
    for (const [key, value] of Object.entries(response.Metadata)) {
      if (key.startsWith('x-amz-meta-')) {
        ctx.resHeaders?.set(key, value)
      }
    }
  }
}

export const storageRouter = {
  /**
   * Lists objects in the storage bucket.
   */
  list: appProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/storage/list',
      tags: ['storage'],
      summary: 'List objects in storage bucket',
    })
    .input(
      z
        .object({
          prefix: z.string().optional(),
          delimiter: z.string().optional(),
          cursor: z.string().optional(),
          limit: z.number().int().positive().optional(),
          startAfter: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      const command = new ListObjectsV2Command({
        Bucket: env.S3_BUCKET,
        Prefix: getKeyByApp(context, input?.prefix),
        Delimiter: input?.delimiter,
        ContinuationToken: input?.cursor,
        MaxKeys: input?.limit,
        StartAfter: input?.startAfter,
      })
      const response = await s3Client.send(command)
      return {
        truncated: response.IsTruncated ?? false,
        cursor: response.NextContinuationToken,
        objects: (response.Contents ?? []).map((o) => ({
          key: o.Key!,
          size: o.Size!,
          uploadedAt: o.LastModified!,
          etag: o.ETag!,
          storageClass: o.StorageClass! as string,
        })),
        prefix: response.Prefix,
        delimiter: response.Delimiter,
        delimitedPrefixes: response.CommonPrefixes?.map((p) => p.Prefix).filter(
          (p): p is string => !p,
        ),
        count: response.KeyCount,
        limit: response.MaxKeys,
        startAfter: response.StartAfter,
      }
    }),

  /**
   * Retrieves metadata for an object without fetching the object itself.
   */
  head: appProtectedProcedure
    .route({
      method: 'HEAD',
      path: '/v1/storage/head',
      tags: ['storage'],
      summary: 'Get object metadata without fetching content',
    })
    .input(
      z.object({
        key: z.string().min(1, 'Key cannot be empty'),
      }),
    )
    .handler(async ({ context, input }) => {
      try {
        const command = new HeadObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: getKeyByApp(context, input.key),
          ...getQueryHeaders(context),
        })
        const response = await s3Client.send(command)

        setResponseHeaders(context, response)

        return {
          size: response.ContentLength!,
          uploadedAt: response.LastModified!,
          etag: response.ETag!,
          storageClass: response.StorageClass! as string,
          checksums: {
            sha1: response.ChecksumSHA1,
            sha256: response.ChecksumSHA256,
          },
        }
      } catch (error) {
        if (
          error instanceof S3ServiceException &&
          (error.name === 'NoSuchKey' || error.name === 'NotFound')
        ) {
          // Key not found is not an error for head, return null
          return null
        }
        // Handle other errors
        throw error
      }
    }),

  /**
   * Retrieves an object from the storage, including its metadata and content.
   */
  get: appProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/storage/get',
      tags: ['storage'],
      summary: 'Get object content and metadata',
    })
    .input(
      z.object({
        key: z.string().min(1, 'Key cannot be empty'),
      }),
    )
    .handler(async function* ({ context, input }) {
      const command = new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: getKeyByApp(context, input.key),
        ...getQueryHeaders(context),
      })

      const response = await s3Client.send(command)

      setResponseHeaders(context, response)

      yield {
        size: response.ContentLength!,
        uploadedAt: response.LastModified!,
        etag: response.ETag!,
        storageClass: response.StorageClass! as string,
        checksums: {
          sha1: response.ChecksumSHA1,
          sha256: response.ChecksumSHA256,
        },
      }

      const stream = response.Body?.transformToWebStream()
      if (stream) {
        for await (const chunk of stream) {
          yield chunk
        }
      }
    }),

  /**
   * Creates a presigned URL for downloading an object.
   * The URL grants temporary access to the object.
   */
  createPresignedDownloadUrl: appProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/storage/presigned-download-url',
      tags: ['storage'],
      summary: 'Create presigned URL for downloading an object',
    })
    .input(
      z.object({
        key: z.string().min(1, 'Key cannot be empty'),
        expiresIn: z.number().int().positive().optional().default(3600), // Default 1 hour
      }),
    )
    .handler(async ({ context, input }) => {
      const command = new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: getKeyByApp(context, input.key),
        ...getQueryHeaders(context),
      })
      const url = await getSignedUrl(s3Client, command, { expiresIn: input.expiresIn })
      return { url }
    }),

  /**
   * Uploads an object directly to the storage.
   */
  put: appProtectedProcedure
    .route({
      method: 'PUT',
      path: '/v1/storage/put',
      tags: ['storage'],
      summary: 'Upload an object directly to storage',
    })
    .input(
      z.object({
        key: z.string().min(1, 'Key cannot be empty'),
        file: z.file(),
      }),
    )
    .handler(async ({ context, input }) => {
      const command = new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: getKeyByApp(context, input.key),
        Body: input.file,
        ...getMutateHeaders(context),
      })
      const response = await s3Client.send(command)
      return {
        size: response.Size!,
        etag: response.ETag!,
        checksums: {
          sha1: response.ChecksumSHA1,
          sha256: response.ChecksumSHA256,
        },
      }
    }),

  /**
   * Creates a presigned URL for uploading an object (using PUT).put().
   * The URL grants temporary permission to upload data to the specified key.
   */
  createPresignedUploadUrl: appProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/storage/presigned-upload-url',
      tags: ['storage'],
      summary: 'Create presigned URL for uploading an object',
    })
    .input(
      z.object({
        key: z.string().min(1, 'Key cannot be empty'),
        expiresIn: z.number().int().positive().optional().default(3600), // Default 1 hour
      }),
    )
    .handler(async ({ context, input }) => {
      const command = new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: getKeyByApp(context, input.key),
        ...getMutateHeaders(context),
      })
      const url = await getSignedUrl(s3Client, command, { expiresIn: input.expiresIn })
      return { url }
    }),

  /**
   * Deletes one or more objects from the bucket.
   */
  delete: appProtectedProcedure
    .route({
      method: 'DELETE',
      path: '/v1/storage/delete',
      tags: ['storage'],
      summary: 'Delete one or more objects from the bucket',
    })
    .input(
      z.object({
        keys: z.union([
          z.string().min(1, 'Key cannot be empty'),
          z.array(z.string().min(1, 'Key cannot be empty')).min(1, 'Must provide at least one key'),
        ]),
      }),
    )
    .handler(async ({ context, input }) => {
      const prefix = getKeyPrefixByApp(context)
      const keysToDelete = (Array.isArray(input.keys) ? input.keys : [input.keys]).map((key) =>
        getKeyWithPrefix(prefix, key),
      )

      if (keysToDelete.length === 1) {
        const command = new DeleteObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: keysToDelete[0],
        })
        await s3Client.send(command)
        return { deleted: 1 }
      } else {
        const command = new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET,
          Delete: {
            Objects: keysToDelete.map((key) => ({ Key: key })),
            Quiet: false, // Set to false to get feedback on successful deletions
          },
        })
        const response = await s3Client.send(command)
        // Handle potential errors during bulk delete
        if (response.Errors?.length) {
          log.error('Bulk delete failed for some objects', response.Errors)
          // Decide how to report partial success/failure
          // Throwing an error indicating partial failure:
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            message: `Failed to delete ${response.Errors.length} object(s)`,
            // Optionally include error details if safe
            // cause: response.Errors,
          })
        }
        // Return the count of successfully deleted objects
        return { deleted: response.Deleted?.length ?? 0 }
      }
    }),

  // --- Multipart Upload Procedures ---

  /**
   * Lists ongoing multipart uploads for the application.
   * Supports prefix, limit (MaxUploads), and pagination markers (KeyMarker, UploadIdMarker).
   */
  listMultipartUploads: appProtectedProcedure
    .route({
      method: 'GET',
      path: '/v1/storage/multipart-uploads',
      tags: ['storage'],
      summary: 'List ongoing multipart uploads for the application',
    })
    .input(
      z
        .object({
          limit: z.number().int().positive().optional(),
          prefix: z.string().optional(),
          keyMarker: z.string().optional(), // Marker for pagination based on key
          uploadIdMarker: z.string().optional(), // Marker for pagination based on upload ID
          delimiter: z.string().optional(),
        })
        .optional(),
    )
    .handler(async ({ context, input }) => {
      const command = new ListMultipartUploadsCommand({
        Bucket: env.S3_BUCKET,
        Prefix: getKeyByApp(context, input?.prefix),
        Delimiter: input?.delimiter,
        MaxUploads: input?.limit,
        KeyMarker: input?.keyMarker,
        UploadIdMarker: input?.uploadIdMarker,
      })
      const response = await s3Client.send(command)

      return {
        prefix: response.Prefix,
        delimiter: response.Delimiter,
        limit: response.MaxUploads,
        keyMarker: response.KeyMarker,
        uploadIdMarker: response.UploadIdMarker,
        nextKeyMarker: response.NextKeyMarker,
        nextUploadIdMarker: response.NextUploadIdMarker,
        truncated: response.IsTruncated,
        delimitedPrefixes: response.CommonPrefixes?.map((p) => p.Prefix).filter(
          (p): p is string => !p,
        ),
        uploads: response.Uploads?.map((u) => ({
          uploadId: u.UploadId,
          key: u.Key,
          initiated: u.Initiated,
          storageClass: u.StorageClass as string,
        })),
      }
    }),

  /**
   * Initiates a multipart upload.
   * Returns an upload ID required for subsequent part uploads.
   */
  createMultipartUpload: appProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/storage/multipart-upload',
      tags: ['storage'],
      summary: 'Initiate a multipart upload',
    })
    .input(
      z.object({
        key: z.string().min(1, 'Key cannot be empty'),
      }),
    )
    .handler(async ({ context, input }) => {
      const command = new CreateMultipartUploadCommand({
        Bucket: env.S3_BUCKET,
        Key: getKeyByApp(context, input.key),
        ...getMutateHeaders(context),
      })
      const response = await s3Client.send(command)
      if (!response.Key || !response.UploadId) {
        throw new ORPCError('INTERNAL_SERVER_ERROR', {
          message: 'Failed to initiate multipart upload',
        })
      }
      return {
        key: response.Key,
        uploadId: response.UploadId,
      }
    }),

  /**
   * Uploads a part of a multipart upload.
   */
  uploadPart: appProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/storage/multipart-upload/part',
      tags: ['storage'],
      summary: 'Upload a part of a multipart upload',
    })
    .input(
      z.object({
        key: z.string().min(1),
        uploadId: z.string().min(1),
        partNumber: z.number().int().min(1).max(10000), // S3 part number limits
        expiresIn: z.number().int().positive().optional().default(900), // Shorter default (15 min)
        file: z.file(),
      }),
    )
    .handler(async ({ context, input }) => {
      const command = new UploadPartCommand({
        Bucket: env.S3_BUCKET,
        Key: getKeyByApp(context, input.key),
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        Body: input.file,
      })
      const response = await s3Client.send(command)
      return {
        etag: response.ETag!,
        checksums: {
          sha1: response.ChecksumSHA1,
          sha256: response.ChecksumSHA256,
        },
      }
    }),

  /**
   * Creates a presigned URL for uploading a part of a multipart upload.
   */
  createPresignedUploadPartUrl: appProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/storage/multipart-upload/presigned-part-url',
      tags: ['storage'],
      summary: 'Create presigned URL for uploading a part of a multipart upload',
    })
    .input(
      z.object({
        key: z.string().min(1),
        uploadId: z.string().min(1),
        partNumber: z.number().int().min(1).max(10000), // S3 part number limits
        expiresIn: z.number().int().positive().optional().default(900), // Shorter default (15 min)
      }),
    )
    .handler(async ({ context, input }) => {
      const command = new UploadPartCommand({
        Bucket: env.S3_BUCKET,
        Key: getKeyByApp(context, input.key),
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
      })
      const url = await getSignedUrl(s3Client, command, { expiresIn: input.expiresIn })
      return { url }
    }),

  /**
   * Completes a multipart upload after all parts have been uploaded.
   * Requires the upload ID and a list of parts with their ETags.
   */
  completeMultipartUpload: appProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/storage/multipart-upload/complete',
      tags: ['storage'],
      summary: 'Complete a multipart upload after all parts have been uploaded',
    })
    .input(
      z.object({
        key: z.string().min(1),
        uploadId: z.string().min(1),
        parts: z
          .array(
            z.object({
              PartNumber: z.number().int().min(1), // Match S3 structure
              ETag: z.string().min(1),
            }),
          )
          .min(1, 'Must provide at least one part'),
      }),
    )
    .handler(async ({ context, input }) => {
      const command = new CompleteMultipartUploadCommand({
        Bucket: env.S3_BUCKET,
        Key: getKeyByApp(context, input.key),
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: input.parts,
        },
      })
      const response = await s3Client.send(command)
      return {
        key: response.Key!,
        etag: response.ETag!,
        checksums: {
          sha1: response.ChecksumSHA1,
          sha256: response.ChecksumSHA256,
        },
      }
    }),

  /**
   * Aborts an ongoing multipart upload, deleting any uploaded parts.
   */
  abortMultipartUpload: appProtectedProcedure
    .route({
      method: 'POST',
      path: '/v1/storage/multipart-upload/abort',
      tags: ['storage'],
      summary: 'Abort an ongoing multipart upload, deleting any uploaded parts',
    })
    .input(
      z.object({
        key: z.string().min(1),
        uploadId: z.string().min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      const command = new AbortMultipartUploadCommand({
        Bucket: env.S3_BUCKET,
        Key: getKeyByApp(context, input.key), // Key needs prefix
        UploadId: input.uploadId,
      })
      await s3Client.send(command)
    }),
}
