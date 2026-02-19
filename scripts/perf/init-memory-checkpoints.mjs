#!/usr/bin/env bun
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DEFAULT_SOURCE = resolve(process.cwd(), 'reports/perf/memory-checkpoints.sample.json')
const DEFAULT_DEST = resolve(process.cwd(), 'reports/perf/memory-checkpoints.json')

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    output: DEFAULT_DEST,
    force: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--source' && next) {
      args.source = resolve(next)
      index += 1
      continue
    }
    if (arg === '--output' && next) {
      args.output = resolve(next)
      index += 1
      continue
    }
    if (arg === '--force') {
      args.force = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return args
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: bun scripts/perf/init-memory-checkpoints.mjs [options]',
      '',
      'Options:',
      `  --source <path>   Source template path (default: ${DEFAULT_SOURCE})`,
      `  --output <path>   Output checkpoint path (default: ${DEFAULT_DEST})`,
      '  --force           Overwrite existing output',
      '  --help            Show this help',
      '',
    ].join('\n')
  )
}

function run() {
  const args = parseArgs(process.argv.slice(2))
  if (existsSync(args.output) && !args.force) {
    process.stdout.write(`already exists: ${args.output}\n`)
    return
  }
  mkdirSync(dirname(args.output), { recursive: true })
  copyFileSync(args.source, args.output)
  process.stdout.write(`wrote ${args.output}\n`)
}

run()
