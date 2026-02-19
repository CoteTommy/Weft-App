import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..', '..')
const contractPath = resolve(repoRoot, 'docs/contracts/tauri-ipc.v2.json')
const outputPath = resolve(repoRoot, 'src/lib/lxmf-api/generated/tauriIpcV2.ts')

const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const v2Commands = Array.isArray(contract?.commands?.v2) ? contract.commands.v2 : []
const legacyCommands = Array.isArray(contract?.commands?.legacy) ? contract.commands.legacy : []
if (v2Commands.length === 0) {
  throw new Error('No v2 commands found in docs/contracts/tauri-ipc.v2.json')
}
if (legacyCommands.length === 0) {
  throw new Error('No legacy command names found in docs/contracts/tauri-ipc.v2.json')
}

const commandEntries = v2Commands
  .map(entry => {
    if (!entry || typeof entry.name !== 'string') {
      throw new Error('Each commands.v2 entry must include a string name')
    }
    return `  ${toConstName(entry.name)}: '${entry.name}',`
  })
  .join('\n')

const legacyCommandEntries = legacyCommands
  .filter(command => typeof command === 'string' && command.length > 0)
  .map(command => {
    const normalized = normalizeLegacyCommandName(command)
    return `  ${toConstName(command)}: '${normalized}',`
  })
  .join('\n')

const commandValues = v2Commands.map(entry => `'${entry.name}'`).join(' | ')
const legacyCommandValues = legacyCommands
  .filter(command => typeof command === 'string' && command.length > 0)
  .map(command => `'${normalizeLegacyCommandName(command)}'`)
  .join(' | ')

const output = `// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: docs/contracts/tauri-ipc.v2.json
// To regenerate: bun run contract:generate

import { invoke } from '@tauri-apps/api/core'

export type IpcV2ErrorCode =
  | 'validation'
  | 'runtime_unavailable'
  | 'upstream_timeout'
  | 'storage_quota'
  | 'internal'

export type IpcV2Meta = {
  request_id: string
  schema_version: 'v2'
}

export type IpcV2Error = {
  code: IpcV2ErrorCode
  message: string
  retryable: boolean
  request_id: string
}

export type IpcV2Envelope<TData> =
  | {
      ok: {
        data: TData
        meta: IpcV2Meta
      }
    }
  | {
      error: IpcV2Error
    }

export const TAURI_IPC_V2_COMMANDS = {
${commandEntries}
} as const

export type TauriIpcV2Command = typeof TAURI_IPC_V2_COMMANDS[keyof typeof TAURI_IPC_V2_COMMANDS]
export type TauriIpcV2CommandLiteral = ${commandValues}

export const TAURI_IPC_COMMANDS = {
${legacyCommandEntries}
} as const

export type TauriIpcCommand = typeof TAURI_IPC_COMMANDS[keyof typeof TAURI_IPC_COMMANDS]
export type TauriIpcCommandLiteral = ${legacyCommandValues}

export async function invokeIpcV2<TData>(
  command: TauriIpcV2Command,
  fields: Record<string, unknown> = {}
): Promise<IpcV2Envelope<TData>> {
  const payload = await invoke<unknown>(command, fields)
  return parseIpcV2Envelope<TData>(payload)
}

export async function invokeIpc<TData>(
  command: TauriIpcCommand,
  fields: Record<string, unknown> = {}
): Promise<TData> {
  return await invoke<unknown>(command, fields).then(payload => payload as TData)
}

export function parseIpcV2Envelope<TData>(payload: unknown): IpcV2Envelope<TData> {
  if (!isRecord(payload)) {
    throw new Error('v2 ipc payload must be an object')
  }

  if (isRecord(payload.ok) && isRecord(payload.ok.meta) && 'data' in payload.ok) {
    const requestId = payload.ok.meta.request_id
    const schemaVersion = payload.ok.meta.schema_version
    if (typeof requestId !== 'string' || typeof schemaVersion !== 'string') {
      throw new Error('v2 ipc ok payload meta is invalid')
    }
    if (schemaVersion !== 'v2') {
      throw new Error('v2 ipc schema_version is invalid')
    }
    return payload as IpcV2Envelope<TData>
  }

  if (isRecord(payload.error)) {
    const { code, message, retryable, request_id: requestId } = payload.error
    if (
      typeof code !== 'string' ||
      typeof message !== 'string' ||
      typeof retryable !== 'boolean' ||
      typeof requestId !== 'string'
    ) {
      throw new Error('v2 ipc error payload is invalid')
    }
    return payload as IpcV2Envelope<TData>
  }

  throw new Error('v2 ipc payload is neither ok nor error envelope')
}

export function unwrapIpcV2Envelope<TData>(payload: IpcV2Envelope<TData>): TData {
  if ('ok' in payload) {
    return payload.ok.data
  }
  throw new Error('[' + payload.error.code + '] ' + payload.error.message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
`

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, output)

console.log(`Generated ${outputPath}`)

function toConstName(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function normalizeLegacyCommandName(command) {
  const match = command.split('::')
  return match[match.length - 1]
}
