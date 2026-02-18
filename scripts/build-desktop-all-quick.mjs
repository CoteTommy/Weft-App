import { spawnSync } from 'node:child_process'

const VALID_TARGETS = ['mac', 'linux', 'windows']
const args = process.argv.slice(2)

const options = {
  targets: [...VALID_TARGETS],
  failFast: false,
}

function printHelp() {
  console.log(`Usage: bun scripts/build-desktop-all-quick.mjs [options]

Options:
  --targets=mac,linux,windows  Comma-separated build targets (default: all)
  --fail-fast                  Stop after the first failed target
  -h, --help                   Show this help
`)
}

function parseTargets(raw) {
  const parsed = raw
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)

  if (parsed.length === 0) {
    throw new Error('No targets provided. Expected at least one target.')
  }

  const unique = [...new Set(parsed)]
  const invalid = unique.filter(target => !VALID_TARGETS.includes(target))
  if (invalid.length > 0) {
    throw new Error(
      `Invalid target(s): ${invalid.join(', ')}. Valid targets: ${VALID_TARGETS.join(', ')}`
    )
  }
  return unique
}

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    printHelp()
    process.exit(0)
  }
  if (arg === '--fail-fast') {
    options.failFast = true
    continue
  }
  if (arg.startsWith('--targets=')) {
    try {
      options.targets = parseTargets(arg.slice('--targets='.length))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(message)
      process.exit(2)
    }
    continue
  }
  console.error(`Unknown argument: ${arg}`)
  printHelp()
  process.exit(2)
}

const bunExecutable = process.versions.bun ? process.execPath : 'bun'
const results = []
const failed = []

for (const target of options.targets) {
  const script = `build:desktop:${target}`
  const start = Date.now()
  console.log(`\n==> Running ${script}`)

  const result = spawnSync(bunExecutable, ['run', script], { stdio: 'inherit' })
  const durationSec = ((Date.now() - start) / 1000).toFixed(1)

  let outcome = 'ok'
  if (result.error) {
    console.error(`FAILED: ${script} (${result.error.message})`)
    failed.push(script)
    outcome = `error: ${result.error.message}`
  }
  if (result.status !== 0 || result.signal) {
    console.error(`FAILED: ${script}`)
    failed.push(script)
    outcome = result.signal
      ? `signal: ${result.signal}`
      : `exit code: ${result.status ?? 'unknown'}`
  }

  results.push({ script, outcome, durationSec })

  if (outcome !== 'ok' && options.failFast) {
    console.error('\nStopping early due to --fail-fast.')
    break
  }
}

console.log('\nBuild summary:')
for (const result of results) {
  const status = result.outcome === 'ok' ? 'OK' : 'FAIL'
  console.log(`- ${status} ${result.script} (${result.durationSec}s)`)
}

if (failed.length > 0) {
  console.error(`\nCompleted with failures: ${failed.join(', ')}`)
  process.exit(1)
}

console.log('\nAll desktop targets completed successfully.')
