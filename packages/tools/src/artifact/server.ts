import type { ArtifactKind } from '@cared/db/schema'
import { eq } from '@cared/db'
import { getDb } from '@cared/db/client'
import { Artifact } from '@cared/db/schema'

import type { Context } from '../context'

export { artifactKinds } from '@cared/db/schema'

export interface CreateArtifactCallbackProps {
  id: string
  title: string
  ctx: Context
}

export interface UpdateArtifactCallbackProps {
  artifact: Artifact
  description: string
  ctx: Context
}

export interface ArtifactHandler<T = ArtifactKind> {
  kind: T
  onCreateArtifact: (args: CreateArtifactCallbackProps) => Promise<void>
  onUpdateArtifact: (args: UpdateArtifactCallbackProps) => Promise<void>
}

export function createArtifactHandler<T extends ArtifactKind>(config: {
  kind: T
  onCreateArtifact: (params: CreateArtifactCallbackProps) => Promise<string>
  onUpdateArtifact: (params: UpdateArtifactCallbackProps) => Promise<string>
}): ArtifactHandler<T> {
  return {
    kind: config.kind,
    onCreateArtifact: async (args: CreateArtifactCallbackProps) => {
      const draftContent = await config.onCreateArtifact(args)

      await getDb().insert(Artifact).values({
        id: args.id,
        version: Math.floor(Date.now() / 1000),
        userId: args.ctx.userId,
        chatId: args.ctx.chatId,
        kind: config.kind,
        title: args.title,
        content: draftContent,
      })
    },
    onUpdateArtifact: async (args: UpdateArtifactCallbackProps) => {
      const draftContent = await config.onUpdateArtifact(args)

      await getDb()
        .update(Artifact)
        .set({
          content: draftContent,
        })
        .where(eq(Artifact.id, args.artifact.id))
    },
  }
}

/*
 * Use this array to define the artifact handlers for each artifact kind.
 */
const artifactHandlersByArtifactKind = new Map<ArtifactKind, ArtifactHandler>()

export function getArtifactHandler<T extends ArtifactKind>(
  kind: T,
): ArtifactHandler<T> | undefined {
  return artifactHandlersByArtifactKind.get(kind) as ArtifactHandler<T> | undefined
}

export function addArtifactHandlers<T extends ArtifactKind>(...handlers: ArtifactHandler<T>[]) {
  for (const handler of handlers) {
    artifactHandlersByArtifactKind.set(handler.kind, handler)
  }
}
