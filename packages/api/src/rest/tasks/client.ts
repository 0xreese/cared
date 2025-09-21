import * as path from 'path'
import { Client } from '@upstash/workflow'

import type { TriggerOptions } from '@upstash/workflow'
import { env } from '../../env'

class WorkflowClient extends Client {
  trigger(options: TriggerOptions): Promise<{
    workflowRunId: string
  }>
  trigger(options: TriggerOptions[]): Promise<
    {
      workflowRunId: string
    }[]
  >

  override async trigger(options: TriggerOptions | TriggerOptions[]) {
    if (!Array.isArray(options)) {
      return await super.trigger({
        ...options,
        url: new URL(
          path.posix.join(tasksApiRoutePath, options.url),
          env.UPSTASH_WORKFLOW_URL,
        ).toString(),
      })
    } else {
      return await super.trigger(
        options.map((config) => ({
          ...config,
          url: new URL(
            path.posix.join(tasksApiRoutePath, config.url),
            env.UPSTASH_WORKFLOW_URL,
          ).toString(),
        })),
      )
    }
  }
}

export function getWorkflowClient() {
  return new WorkflowClient({})
}

let tasksApiRoutePath = '/api/v1/webhooks/tasks'

export function setRoutePath(path: string) {
  tasksApiRoutePath = path
}
