import { tool } from 'ai'
import { z } from 'zod/v4'

import { eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { Artifact } from '@cared/db/schema'

import type { Context } from '../context'
import { getArtifactHandler } from './server'

export const updateArtifact = (ctx: Context) =>
  tool({
    description: 'Update a artifact with the given description.',
    inputSchema: z.object({
      id: z.string().describe('The ID of the artifact to update'),
      description: z.string().describe('The description of changes that need to be made'),
    }),
    execute: async ({ id, description }) => {
      const dataStream = ctx.dataStream!

      const artifact = await getDb().query.Artifact.findFirst({
        where: eq(Artifact.id, id),
      })
      if (!artifact) {
        return {
          error: 'Artifact not found',
        }
      }

      dataStream.write({
        type: 'data-clear',
        data: null,
        transient: true,
      })

      const artifactHandler = getArtifactHandler(artifact.kind)
      if (!artifactHandler) {
        throw new Error(`No artifact handler found for kind: ${artifact.kind}`)
      }

      await artifactHandler.onUpdateArtifact({
        artifact,
        description,
        ctx,
      })

      dataStream.write({ type: 'data-finish', data: null, transient: true })

      return {
        id,
        title: artifact.title,
        kind: artifact.kind,
        content: 'The artifact has been updated successfully.',
      }
    },
  })
