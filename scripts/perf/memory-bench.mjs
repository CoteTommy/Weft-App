#!/usr/bin/env bun
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_INPUT = resolve(process.cwd(), 'reports/perf/memory-checkpoints.json')
const DEFAULT_OUTPUT = resolve(process.cwd(), 'reports/perf/memory-bench.json')

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--input' && next) {
      args.input = resolve(next)
      index += 1
      continue
    }
    if (arg === '--output' && next) {
      args.output = resolve(next)
      index += 1
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
      'Usage: bun scripts/perf/memory-bench.mjs [options]',
      '',
      'Options:',
      `  --input <path>   Input checkpoints JSON (default: ${DEFAULT_INPUT})`,
      `  --output <path>  Output report JSON (default: ${DEFAULT_OUTPUT})`,
      '  --help           Show this help',
      '',
      'Expected input format:',
      '{',
      '  "checkpoints": [',
      '    { "name": "cold_start", "rssBytes": 0, "jsHeapUsedBytes": 0 },',
      '    { "name": "chats_open_idle_2m", "rssBytes": 0, "jsHeapUsedBytes": 0 },',
      '    { "name": "hidden_idle_5m", "rssBytes": 0, "jsHeapUsedBytes": 0 }',
      '  ]',
      '}',
      '',
    ].join('\n')
  )
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function percentDelta(from, to) {
  if (from === null || to === null || from <= 0) {
    return null
  }
  return ((to - from) / from) * 100
}

function requiredCheckpoint(checkpoints, name) {
  return checkpoints.find(entry => entry.name === name) ?? null
}

function run() {
  const args = parseArgs(process.argv.slice(2))
  const payload = JSON.parse(readFileSync(args.input, 'utf8'))
  const checkpoints = Array.isArray(payload?.checkpoints) ? payload.checkpoints : []

  const coldStart = requiredCheckpoint(checkpoints, 'cold_start')
  const chatsIdle = requiredCheckpoint(checkpoints, 'chats_open_idle_2m')
  const hiddenIdle = requiredCheckpoint(checkpoints, 'hidden_idle_5m')

  const rssCold = safeNumber(coldStart?.rssBytes)
  const rssChats = safeNumber(chatsIdle?.rssBytes)
  const rssHidden = safeNumber(hiddenIdle?.rssBytes)

  const heapCold = safeNumber(coldStart?.jsHeapUsedBytes)
  const heapChats = safeNumber(chatsIdle?.jsHeapUsedBytes)
  const heapHidden = safeNumber(hiddenIdle?.jsHeapUsedBytes)

  const output = {
    generatedAt: new Date().toISOString(),
    inputPath: args.input,
    checkpoints: checkpoints.map(entry => ({
      name: String(entry?.name ?? ''),
      rssBytes: safeNumber(entry?.rssBytes),
      jsHeapUsedBytes: safeNumber(entry?.jsHeapUsedBytes),
      jsHeapLimitBytes: safeNumber(entry?.jsHeapLimitBytes),
      notes: typeof entry?.notes === 'string' ? entry.notes : undefined,
    })),
    comparisons: {
      rssDeltaColdToChatsPct: percentDelta(rssCold, rssChats),
      rssDeltaChatsToHiddenPct: percentDelta(rssChats, rssHidden),
      heapDeltaColdToChatsPct: percentDelta(heapCold, heapChats),
      heapDeltaChatsToHiddenPct: percentDelta(heapChats, heapHidden),
    },
    targets: {
      jsHeapReductionPct: -35,
      rssReductionPct: -20,
    },
    pass: {
      jsHeap:
        percentDelta(heapCold, heapChats) !== null
          ? percentDelta(heapCold, heapChats) <= -35
          : false,
      rss:
        percentDelta(rssCold, rssChats) !== null
          ? percentDelta(rssCold, rssChats) <= -20
          : false,
    },
  }

  writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

run()
