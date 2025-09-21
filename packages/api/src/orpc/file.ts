import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod/v4'

import { s3Client } from '../client/s3'
import { env } from '../env'
import { getS3Key, s3KeyRequestSchema } from '../operation'
import { protectedProcedure } from '../orpc'

export const fileRouter = {
  s3PresignedUrl: protectedProcedure
    .route({
      method: 'POST',
      path: '/v1/files/s3-presigned-url',
      tags: ['files'],
      summary: 'Create a S3 presigned upload URL',
    })
    .input(s3KeyRequestSchema)
    .output(
      z.object({
        key: z.string(),
        bucket: z.string(),
        region: z.string(),
        endpoint: z.string(),
        url: z.string(),
      }),
    )
    .handler(async ({ context, input }) => {
      const { key, mimeType } = await getS3Key({
        auth: context.auth,
        headers: context.headers,
        location: input,
      })

      const url = await getSignedUrl(
        s3Client,
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          ContentType: mimeType,
          CacheControl: 'max-age=630720000',
        }),
        {
          expiresIn: 60 * 60,
        },
      )

      return {
        key,
        bucket: env.S3_BUCKET,
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        url,
      }
    }),
}
