#!/usr/bin/env bun
import { Database } from 'bun:sqlite'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const DEFAULT_THREAD_ITERATIONS = 220
const DEFAULT_SEARCH_ITERATIONS = 220
const DEFAULT_MESSAGE_LIMIT = 120
const DEFAULT_SEARCH_LIMIT = 120

function parseArgs(argv) {
  const args = {
    dbPath: resolveDefaultDbPath(),
    threadIterations: DEFAULT_THREAD_ITERATIONS,
    searchIterations: DEFAULT_SEARCH_ITERATIONS,
    messageLimit: DEFAULT_MESSAGE_LIMIT,
    searchLimit: DEFAULT_SEARCH_LIMIT,
    searchTerms: ['status', 'relay', 'receipt', 'retry', 'update'],
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--db' && next) {
      args.dbPath = resolve(next)
      i += 1
      continue
    }
    if (arg === '--thread-iterations' && next) {
      args.threadIterations = clampInt(next, 1, 10_000, DEFAULT_THREAD_ITERATIONS)
      i += 1
      continue
    }
    if (arg === '--search-iterations' && next) {
      args.searchIterations = clampInt(next, 1, 10_000, DEFAULT_SEARCH_ITERATIONS)
      i += 1
      continue
    }
    if (arg === '--message-limit' && next) {
      args.messageLimit = clampInt(next, 1, 1_000, DEFAULT_MESSAGE_LIMIT)
      i += 1
      continue
    }
    if (arg === '--search-limit' && next) {
      args.searchLimit = clampInt(next, 1, 1_000, DEFAULT_SEARCH_LIMIT)
      i += 1
      continue
    }
    if (arg === '--search-terms' && next) {
      const parsed = next
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(value => value.length >= 3)
      if (parsed.length > 0) {
        args.searchTerms = parsed
      }
      i += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return args
}

function resolveDefaultDbPath() {
  if (process.env.WEFT_INDEX_STORE_PATH && process.env.WEFT_INDEX_STORE_PATH.trim()) {
    return resolve(process.env.WEFT_INDEX_STORE_PATH)
  }
  if (process.env.XDG_STATE_HOME && process.env.XDG_STATE_HOME.trim()) {
    return resolve(process.env.XDG_STATE_HOME, 'weft-desktop', 'weft-index-v1.sqlite3')
  }
  if (process.platform === 'win32' && process.env.APPDATA && process.env.APPDATA.trim()) {
    return resolve(process.env.APPDATA, 'weft-desktop', 'weft-index-v1.sqlite3')
  }
  return resolve(homedir(), '.local', 'state', 'weft-desktop', 'weft-index-v1.sqlite3')
}

function clampInt(input, min, max, fallback) {
  const parsed = Number.parseInt(String(input), 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(min, Math.min(max, parsed))
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: bun scripts/perf/index-query-bench.mjs [options]',
      '',
      'Options:',
      '  --db <path>                SQLite file path (default follows backend logic)',
      '  --thread-iterations <n>    Number of thread-open samples (default: 220)',
      '  --search-iterations <n>    Number of search samples (default: 220)',
      '  --message-limit <n>        Thread message page size (default: 120)',
      '  --search-limit <n>         Search page size (default: 120)',
      '  --search-terms <csv>       Search terms, length >= 3',
      '  --help                     Show this help',
      '',
      'Example:',
      '  bun scripts/perf/index-query-bench.mjs --thread-iterations 300 --search-iterations 300',
      '',
    ].join('\n')
  )
}

function percentile(values, p) {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function summarize(values) {
  if (values.length === 0) {
    return {
      count: 0,
      minMs: null,
      maxMs: null,
      meanMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    }
  }
  const total = values.reduce((sum, value) => sum + value, 0)
  return {
    count: values.length,
    minMs: Math.min(...values),
    maxMs: Math.max(...values),
    meanMs: total / values.length,
    p50Ms: percentile(values, 50),
    p95Ms: percentile(values, 95),
    p99Ms: percentile(values, 99),
  }
}

function roundedSummary(values) {
  const base = summarize(values)
  return {
    ...base,
    minMs: base.minMs === null ? null : round(base.minMs),
    maxMs: base.maxMs === null ? null : round(base.maxMs),
    meanMs: base.meanMs === null ? null : round(base.meanMs),
    p50Ms: base.p50Ms === null ? null : round(base.p50Ms),
    p95Ms: base.p95Ms === null ? null : round(base.p95Ms),
    p99Ms: base.p99Ms === null ? null : round(base.p99Ms),
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000
}

function run() {
  const args = parseArgs(process.argv.slice(2))
  const db = new Database(args.dbPath, { readonly: true })

  const rowCount = Number(db.query('SELECT COUNT(*) AS c FROM messages').get().c ?? 0)
  const threadRows = db.query('SELECT thread_id FROM threads ORDER BY last_activity_ms DESC').all()
  const threadIds = threadRows.map(row => String(row.thread_id)).filter(Boolean)

  if (rowCount === 0 || threadIds.length === 0) {
    process.stderr.write('No indexed data found. Seed first with scripts/perf/seed-index.mjs\n')
    process.exit(2)
  }

  const threadQuery = db.query(`
SELECT message_id, ts_ms, title, body
FROM messages
WHERE thread_id = ?
ORDER BY ts_ms DESC, message_id DESC
LIMIT ?
`)

  const searchQuery = db.query(`
SELECT m.message_id, m.ts_ms
FROM messages_fts AS fts
JOIN messages AS m ON m.rowid = fts.rowid
WHERE messages_fts MATCH ?
ORDER BY m.ts_ms DESC, m.message_id DESC
LIMIT ?
`)

  const threadSamples = []
  const searchSamples = []

  for (let i = 0; i < args.threadIterations; i += 1) {
    const threadId = threadIds[i % threadIds.length]
    const startedAt = performance.now()
    threadQuery.all(threadId, args.messageLimit)
    threadSamples.push(performance.now() - startedAt)
  }

  for (let i = 0; i < args.searchIterations; i += 1) {
    const term = args.searchTerms[i % args.searchTerms.length]
    const startedAt = performance.now()
    searchQuery.all(term, args.searchLimit)
    searchSamples.push(performance.now() - startedAt)
  }

  const threadSummary = roundedSummary(threadSamples)
  const searchSummary = roundedSummary(searchSamples)

  const result = {
    dbPath: args.dbPath,
    generatedAt: new Date().toISOString(),
    dataset: {
      messages: rowCount,
      threads: threadIds.length,
    },
    threadOpen: {
      ...threadSummary,
      targetP95Ms: 100,
      pass: threadSummary.p95Ms !== null ? threadSummary.p95Ms < 100 : false,
    },
    search: {
      ...searchSummary,
      targetP95Ms: 100,
      pass: searchSummary.p95Ms !== null ? searchSummary.p95Ms < 100 : false,
      terms: args.searchTerms,
    },
  }

  db.close()
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

run()
