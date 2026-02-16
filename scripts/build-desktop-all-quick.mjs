import { spawnSync } from 'node:child_process'

const targets = ['mac', 'linux', 'windows']
const failed = []

for (const target of targets) {
  const script = `build:desktop:${target}`
  console.log(`\n==> Running ${script}`)

  const result = spawnSync('bun', ['run', script], { stdio: 'inherit' })
  if (result.error) {
    console.error(`FAILED: ${script} (${result.error.message})`)
    failed.push(script)
    continue
  }
  if (result.status !== 0) {
    console.error(`FAILED: ${script}`)
    failed.push(script)
  }
}

if (failed.length > 0) {
  console.error(`\nCompleted with failures: ${failed.join(', ')}`)
  process.exit(1)
}

console.log('\nAll desktop targets completed successfully.')
