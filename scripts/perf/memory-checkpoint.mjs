#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DEFAULT_OUTPUT = resolve(process.cwd(), 'reports/perf/memory-checkpoints.json')

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    name: '',
    rssBytes: null,
    jsHeapUsedBytes: null,
    jsHeapLimitBytes: null,
    notes: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--output' && next) {
      args.output = resolve(next)
      index += 1
      continue
    }
    if (arg === '--name' && next) {
      args.name = next.trim()
      index += 1
      continue
    }
    if (arg === '--rss' && next) {
      args.rssBytes = parseFiniteNumber(next)
      index += 1
      continue
    }
    if (arg === '--heap-used' && next) {
      args.jsHeapUsedBytes = parseFiniteNumber(next)
      index += 1
      continue
    }
    if (arg === '--heap-limit' && next) {
      args.jsHeapLimitBytes = parseFiniteNumber(next)
      index += 1
      continue
    }
    if (arg === '--notes' && next) {
      args.notes = next
      index += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  if (!args.name) {
    throw new Error('missing required --name')
  }
  return args
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: bun scripts/perf/memory-checkpoint.mjs --name <checkpoint> [options]',
      '',
      'Options:',
      `  --output <path>       Output JSON path (default: ${DEFAULT_OUTPUT})`,
      '  --name <id>           Checkpoint id (e.g. cold_start)',
      '  --rss <bytes>         Native process RSS bytes',
      '  --heap-used <bytes>   JS used heap bytes',
      '  --heap-limit <bytes>  JS heap limit bytes',
      '  --notes <text>        Optional notes',
      '  --help                Show this help',
      '',
      'Example:',
      '  bun scripts/perf/memory-checkpoint.mjs --name chats_open_idle_2m --rss 240000000 --heap-used 110000000',
      '',
    ].join('\n')
  )
}

function parseFiniteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readPayload(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { checkpoints: [] }
    }
    const checkpoints = Array.isArray(parsed.checkpoints) ? parsed.checkpoints : []
    return { ...parsed, checkpoints }
  } catch {
    return { checkpoints: [] }
  }
}

function run() {
  const args = parseArgs(process.argv.slice(2))
  const payload = readPayload(args.output)
  const checkpoints = payload.checkpoints.filter(
    entry => typeof entry?.name === 'string' && entry.name !== args.name
  )
  checkpoints.push({
    name: args.name,
    rssBytes: args.rssBytes,
    jsHeapUsedBytes: args.jsHeapUsedBytes,
    jsHeapLimitBytes: args.jsHeapLimitBytes,
    notes: args.notes || undefined,
    capturedAt: new Date().toISOString(),
  })

  const output = {
    generatedAt: new Date().toISOString(),
    checkpoints,
  }

  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

run()
