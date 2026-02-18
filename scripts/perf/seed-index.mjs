#!/usr/bin/env bun
import { Database } from 'bun:sqlite'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

const DEFAULT_MESSAGE_COUNT = 100_000
const DEFAULT_THREAD_COUNT = 450

function parseArgs(argv) {
  const args = {
    messages: DEFAULT_MESSAGE_COUNT,
    threads: DEFAULT_THREAD_COUNT,
    attachmentRate: 0.08,
    paperRate: 0.03,
    mapRate: 0.04,
    force: false,
    dbPath: resolveDefaultDbPath(),
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--messages' && next) {
      args.messages = clampInt(next, 1, 5_000_000, DEFAULT_MESSAGE_COUNT)
      i += 1
      continue
    }
    if (arg === '--threads' && next) {
      args.threads = clampInt(next, 1, 100_000, DEFAULT_THREAD_COUNT)
      i += 1
      continue
    }
    if (arg === '--attachment-rate' && next) {
      args.attachmentRate = clampFloat(next, 0, 1, args.attachmentRate)
      i += 1
      continue
    }
    if (arg === '--paper-rate' && next) {
      args.paperRate = clampFloat(next, 0, 1, args.paperRate)
      i += 1
      continue
    }
    if (arg === '--map-rate' && next) {
      args.mapRate = clampFloat(next, 0, 1, args.mapRate)
      i += 1
      continue
    }
    if (arg === '--db' && next) {
      args.dbPath = resolve(next)
      i += 1
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

function clampFloat(input, min, max, fallback) {
  const parsed = Number.parseFloat(String(input))
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(min, Math.min(max, parsed))
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: bun scripts/perf/seed-index.mjs [options]',
      '',
      'Options:',
      '  --messages <n>         Total message rows (default: 100000)',
      '  --threads <n>          Total threads (default: 450)',
      '  --attachment-rate <f>  Fraction of messages with attachments (0..1)',
      '  --paper-rate <f>       Fraction of messages with paper metadata (0..1)',
      '  --map-rate <f>         Fraction of messages with map telemetry (0..1)',
      '  --db <path>            SQLite file path (default follows backend logic)',
      '  --force                Remove any existing DB before seeding',
      '  --help                 Show this help',
      '',
      'Examples:',
      '  bun scripts/perf/seed-index.mjs --messages 100000 --threads 500 --force',
      '  WEFT_INDEX_STORE_PATH=/tmp/weft-bench.sqlite3 bun scripts/perf/seed-index.mjs --force',
      '',
    ].join('\n')
  )
}

function makeThreadId(index) {
  return `thread-${String(index + 1).padStart(4, '0')}`
}

function makePeerHash(index) {
  return `peer${String(index + 1).padStart(8, '0')}ffffffffffffffffffffffffffffffff`
}

function chance(rate, seed) {
  const x = Math.sin(seed * 12_989.0) * 43_758.5453
  return x - Math.floor(x) < rate
}

function sampleMessageBody(index, threadName) {
  const phrases = [
    'status update acknowledged',
    'relay route stable and healthy',
    'delivery receipt observed',
    'path discovery completed',
    'retry requested due to timeout',
    'heartbeat nominal',
  ]
  const phrase = phrases[index % phrases.length]
  return `${threadName} ${phrase} message-${index}`
}

function sampleReceiptStatus(direction, index) {
  if (direction !== 'out') {
    return null
  }
  const bucket = index % 20
  if (bucket < 16) {
    return 'delivered'
  }
  if (bucket < 18) {
    return 'sent'
  }
  if (bucket === 18) {
    return 'retrying:timeout'
  }
  return 'failed:no_path'
}

function buildFieldsJson({
  hasMap,
  hasPaper,
  hasAttachment,
  threadName,
  messageIndex,
  attachmentName,
  lat,
  lon,
}) {
  const root = {}
  if (hasMap) {
    root.location = { lat, lon }
    root['2'] = { lat, lon }
  }
  if (hasPaper) {
    root.paper = {
      title: `Paper ${threadName} ${messageIndex}`,
      category: messageIndex % 2 === 0 ? 'Ops' : 'Logistics',
    }
  }
  if (hasAttachment) {
    root.attachments = [
      {
        name: attachmentName,
        mime: messageIndex % 2 === 0 ? 'image/png' : 'application/pdf',
        size_bytes: 18_432 + (messageIndex % 12_000),
      },
    ]
  }
  return JSON.stringify(root)
}

function ensureSchema(db) {
  db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS messages (
  message_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  source TEXT NOT NULL,
  destination TEXT NOT NULL,
  ts_ms INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  receipt_status TEXT,
  status_reason_code TEXT,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  has_paper INTEGER NOT NULL DEFAULT 0,
  fields_json TEXT,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  name TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER NOT NULL,
  inline_base64 TEXT,
  FOREIGN KEY(message_id) REFERENCES messages(message_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);

CREATE TABLE IF NOT EXISTS threads (
  thread_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  preview TEXT NOT NULL,
  last_message_id TEXT,
  last_activity_ms INTEGER NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_ts ON messages(thread_id, ts_ms DESC, message_id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts_ms DESC, message_id DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  message_id UNINDEXED,
  title,
  body,
  content='messages',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, message_id, title, body)
  VALUES (new.rowid, new.message_id, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, message_id, title, body)
  VALUES('delete', old.rowid, old.message_id, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, message_id, title, body)
  VALUES('delete', old.rowid, old.message_id, old.title, old.body);
  INSERT INTO messages_fts(rowid, message_id, title, body)
  VALUES (new.rowid, new.message_id, new.title, new.body);
END;
`)
}

function clearData(db) {
  db.exec(`
DELETE FROM attachments;
DELETE FROM threads;
DELETE FROM messages;
DELETE FROM sync_state;
DELETE FROM sqlite_sequence WHERE name = 'attachments';
`)
}

function formatMs(value) {
  return `${Math.round(value)}ms`
}

const args = parseArgs(process.argv.slice(2))
mkdirSync(dirname(args.dbPath), { recursive: true })
if (args.force) {
  try {
    rmSync(args.dbPath)
  } catch {
    // Ignore when the target file does not yet exist.
  }
}

const db = new Database(args.dbPath)
ensureSchema(db)
clearData(db)

const messageInsert = db.query(`
INSERT INTO messages (
  message_id,
  thread_id,
  direction,
  source,
  destination,
  ts_ms,
  title,
  body,
  receipt_status,
  status_reason_code,
  has_attachments,
  has_paper,
  fields_json,
  updated_at_ms
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const attachmentInsert = db.query(`
INSERT INTO attachments (
  message_id,
  ordinal,
  name,
  mime,
  size_bytes,
  inline_base64
) VALUES (?, ?, ?, ?, ?, ?)
`)

const threadInsert = db.query(`
INSERT INTO threads (
  thread_id,
  display_name,
  preview,
  last_message_id,
  last_activity_ms,
  unread_count,
  pinned,
  muted
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const syncStateInsert = db.query(`
INSERT INTO sync_state(key, value) VALUES(?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value
`)

const startedAt = performance.now()
const now = Date.now()
const firstTimestamp = now - 14 * 24 * 60 * 60 * 1000
const selfSource = 'self00000000000000000000000000000000ffffffffffffffffffffffffffff'

const threadMeta = Array.from({ length: args.threads }, (_, index) => {
  const threadId = makeThreadId(index)
  const peerHash = makePeerHash(index)
  return {
    threadId,
    displayName: `Bench Thread ${String(index + 1).padStart(3, '0')}`,
    peerHash,
    unreadCount: 0,
    preview: 'No messages yet',
    lastMessageId: '',
    lastActivityMs: 0,
  }
})

const txn = db.transaction(() => {
  for (let index = 0; index < args.messages; index += 1) {
    const thread = threadMeta[index % threadMeta.length]
    const messageId = `msg-${String(index + 1).padStart(8, '0')}`
    const direction = index % 2 === 0 ? 'in' : 'out'
    const source = direction === 'in' ? thread.peerHash : selfSource
    const destination = direction === 'in' ? selfSource : thread.peerHash
    const tsMs = firstTimestamp + index * 1200
    const title = direction === 'in' ? 'Inbound' : 'Outbound'
    const body = sampleMessageBody(index, thread.displayName)
    const receiptStatus = sampleReceiptStatus(direction, index)
    const statusReasonCode = receiptStatus?.startsWith('failed') ? 'no_path' : null
    const hasAttachment = chance(args.attachmentRate, index + 11)
    const hasPaper = chance(args.paperRate, index + 23)
    const hasMap = chance(args.mapRate, index + 37)

    const lat = 34.8 + ((index % 1200) / 1200) * 0.9
    const lon = -117.6 + ((index % 1600) / 1600) * 0.9
    const attachmentName = `attachment-${String(index + 1).padStart(6, '0')}${index % 2 === 0 ? '.png' : '.pdf'}`
    const fieldsJson = buildFieldsJson({
      hasMap,
      hasPaper,
      hasAttachment,
      threadName: thread.displayName,
      messageIndex: index,
      attachmentName,
      lat,
      lon,
    })

    messageInsert.run(
      messageId,
      thread.threadId,
      direction,
      source,
      destination,
      tsMs,
      title,
      body,
      receiptStatus,
      statusReasonCode,
      hasAttachment ? 1 : 0,
      hasPaper ? 1 : 0,
      fieldsJson,
      tsMs
    )

    if (hasAttachment) {
      attachmentInsert.run(
        messageId,
        0,
        attachmentName,
        index % 2 === 0 ? 'image/png' : 'application/pdf',
        18_432 + (index % 12_000),
        null
      )
    }

    thread.lastActivityMs = tsMs
    thread.lastMessageId = messageId
    thread.preview = body.slice(0, 140)
    if (direction === 'in') {
      thread.unreadCount += 1
    }
  }

  for (let index = 0; index < threadMeta.length; index += 1) {
    const thread = threadMeta[index]
    threadInsert.run(
      thread.threadId,
      thread.displayName,
      thread.preview,
      thread.lastMessageId || null,
      thread.lastActivityMs,
      thread.unreadCount,
      index % 23 === 0 ? 1 : 0,
      index % 29 === 0 ? 1 : 0
    )
  }

  const lastMessageId = `msg-${String(args.messages).padStart(8, '0')}`
  const lastSyncMs = firstTimestamp + args.messages * 1200
  syncStateInsert.run('last_sync_ms', String(lastSyncMs))
  syncStateInsert.run('last_sync_message_id', lastMessageId)
})

txn()
db.exec('ANALYZE;')
const elapsedMs = performance.now() - startedAt

const rowCounts = {
  messages: db.query('SELECT COUNT(*) AS c FROM messages').get().c,
  threads: db.query('SELECT COUNT(*) AS c FROM threads').get().c,
  attachments: db.query('SELECT COUNT(*) AS c FROM attachments').get().c,
}

db.close()

const output = {
  dbPath: args.dbPath,
  rows: rowCounts,
  generatedAt: new Date().toISOString(),
  elapsedMs: Math.round(elapsedMs),
}

process.stdout.write(JSON.stringify(output, null, 2) + '\n')
process.stderr.write(`Seeded index in ${formatMs(elapsedMs)}\n`)
