import { spawnSync } from 'node:child_process'

run('node', ['scripts/build-clean.mjs'])
run('node', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'])
run('node', ['node_modules/tsdown/dist/run.mjs', '--config', 'tsdown.config.ts'])

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`)
}
