import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

rmSync(resolve(process.cwd(), 'lib'), { recursive: true, force: true })
