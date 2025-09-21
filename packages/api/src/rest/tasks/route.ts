import type { Context } from 'hono'

import * as processDocument from './processDocument'

export const POST = async (c: Context): Promise<Response> => {
  const taskName = c.req.param('task')

  switch (taskName) {
    case processDocument.name:
      return processDocument.POST(c)
    default:
      return c.json({ message: 'Invalid task name' }, 400)
  }
}

export const taskTrigger = {
  processDocument: processDocument.trigger,
}
