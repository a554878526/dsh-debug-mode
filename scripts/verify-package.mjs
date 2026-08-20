import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (manifest.name !== 'dsh-debug-mode') throw new Error('package name must be dsh-debug-mode')
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('missing dsh.bundle patch')
if (manifest.dsh?.client?.platform !== 'web') throw new Error('missing dsh.client web declaration')

for (const relative of [
  'lib/index.js',
  'lib/client.js',
  'scripts/new_debug_session.py',
  'scripts/debug_ingest_server.py',
  'scripts/summarize_debug_log.py',
  'scripts/find_instrumentation.py',
  'scripts/repair_debug_mode_sessions.py',
  'cordis.patch.yml',
]) {
  if (!existsSync(join(root, relative))) throw new Error(`missing release artifact: ${relative}`)
}

const plugin = await import(pathToFileURL(join(root, 'lib/index.js')).href)
const resourceBase = plugin.internals.resolveResourceBase()
if (basename(resourceBase) !== 'scripts') throw new Error(`unexpected resource base: ${resourceBase}`)
for (const helper of [
  'new_debug_session.py',
  'debug_ingest_server.py',
  'summarize_debug_log.py',
  'find_instrumentation.py',
]) {
  if (!existsSync(join(resourceBase, helper))) throw new Error(`installed helper is not resolvable: ${helper}`)
}

const client = readFileSync(join(root, 'lib/client.js'), 'utf8')
if (!client.includes('id: "dsh-debug-mode"') && !client.includes('id:"dsh-debug-mode"')) {
  throw new Error('client bundle does not register dsh-debug-mode')
}
if (!client.includes('data-plugin-css')) throw new Error('client bundle does not include its dock stylesheet')

console.log(`verified DSH bundle and helper resource base: ${resourceBase}`)
