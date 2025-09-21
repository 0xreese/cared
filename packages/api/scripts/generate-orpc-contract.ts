import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { minifyContractRouter } from '@orpc/contract'

import { appRouter } from '../src'

// @ts-ignore
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const minifiedRouter = minifyContractRouter(appRouter)

fs.writeFileSync(
  path.resolve(__dirname, '../src/orpc/contract.json'),
  JSON.stringify(minifiedRouter),
)
