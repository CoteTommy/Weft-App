import type { ChatAttachment, ChatMessage, ChatPaperMeta } from '@shared/types/chat'
import type { LxmfMessageRecord } from '@lib/lxmf-payloads'

export interface ParsedMessageAssets {
  attachments: ChatAttachment[]
  paper?: ChatPaperMeta
  kind?: ChatMessage['kind']
  replyToId?: string
  reaction?: ChatMessage['reaction']
  location?: ChatMessage['location']
}

export function parseMessageAssets(fields: LxmfMessageRecord['fields']): ParsedMessageAssets {
  const root = asObject(fields)
  if (!root) {
    return { attachments: [] }
  }
  const structured = parseStructuredAttachments(root.attachments)
  const canonical = parseCanonicalAttachments(root['5'])
  const attachments = mergeAttachments(structured, canonical)
  const paper = parsePaperMeta(root.paper)
  const extensions = parseAppExtensions(root)
  const refs = parseReferenceMeta(root)
  const location = parseLocationMeta(root)
  const hasCommands = parseCommandEntries(root).length > 0
  const replyToId =
    asNonEmptyString(extensions.reply_to) ??
    asNonEmptyString(extensions.replyTo) ??
    asNonEmptyString(extensions.reply_id) ??
    refs.replyToId
  const reactionTo =
    asNonEmptyString(extensions.reaction_to) ??
    asNonEmptyString(extensions.reactionTo) ??
    refs.reactionTo
  const reactionEmoji =
    asNonEmptyString(extensions.emoji) ??
    asNonEmptyString(extensions.reaction_emoji) ??
    refs.reactionEmoji
  const reactionSender =
    asNonEmptyString(extensions.sender) ??
    asNonEmptyString(extensions.reaction_sender) ??
    refs.reactionSender
  const reaction =
    reactionTo && reactionEmoji
      ? {
          to: reactionTo,
          emoji: reactionEmoji,
          sender: reactionSender,
        }
      : undefined

  let kind: ChatMessage['kind'] | undefined
  if (reaction) {
    kind = 'reaction'
  } else if (location) {
    kind = 'location'
  } else if (hasCommands) {
    kind = 'command'
  } else {
    kind = 'message'
  }

  return {
    attachments,
    paper,
    kind,
    replyToId,
    reaction,
    location,
  }
}

function parseStructuredAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: ChatAttachment[] = []
  for (const entry of value) {
    const attachment = asObject(entry)
    if (!attachment) {
      continue
    }
    const name = asNonEmptyString(attachment.name)
    if (!name) {
      continue
    }
    const dataBase64 = asNonEmptyString(attachment.inline_base64)
    const sizeFromPayload =
      typeof attachment.size_bytes === 'number' && Number.isFinite(attachment.size_bytes)
        ? Math.max(0, Math.trunc(attachment.size_bytes))
        : undefined
    out.push({
      name,
      mime: asNonEmptyString(attachment.mime),
      sizeBytes: sizeFromPayload ?? estimateBase64Size(dataBase64),
      dataBase64: dataBase64 ?? undefined,
    })
  }
  return out
}

function parseCanonicalAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: ChatAttachment[] = []
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue
    }
    const name = decodeWireText(entry[0]) ?? `Attachment ${out.length + 1}`
    const bytes = decodeWireBytes(entry[1])
    if (!bytes || bytes.length === 0) {
      continue
    }
    out.push({
      name,
      sizeBytes: bytes.length,
      dataBase64: bytesToBase64(bytes),
    })
  }
  return out
}

function mergeAttachments(
  structured: ChatAttachment[],
  canonical: ChatAttachment[]
): ChatAttachment[] {
  if (structured.length === 0) {
    return canonical
  }
  if (canonical.length === 0) {
    return structured
  }
  const seen = new Set(structured.map(attachment => `${attachment.name}:${attachment.sizeBytes}`))
  const out = [...structured]
  for (const entry of canonical) {
    const key = `${entry.name}:${entry.sizeBytes}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(entry)
  }
  return out
}

function parsePaperMeta(value: unknown): ChatPaperMeta | undefined {
  const paper = asObject(value)
  if (!paper) {
    return undefined
  }
  const title = asNonEmptyString(paper.title)
  const category = asNonEmptyString(paper.category)
  if (!title && !category) {
    return undefined
  }
  return {
    title,
    category,
  }
}

function parseAppExtensions(root: Record<string, unknown>): Record<string, unknown> {
  const field16 = asObject(root['16']) ?? asObject(root.app_extensions)
  if (!field16) {
    return {}
  }
  const nested = asObject(field16.extensions)
  if (!nested) {
    return field16
  }
  return {
    ...field16,
    ...nested,
  }
}

function parseLocationMeta(root: Record<string, unknown>): ChatMessage['location'] | undefined {
  const location = asObject(root.location)
  const lat = asNumber(location?.lat) ?? asNumber(location?.latitude)
  const lon = asNumber(location?.lon) ?? asNumber(location?.lng) ?? asNumber(location?.longitude)
  if (lat !== undefined && lon !== undefined) {
    return { lat, lon }
  }
  const telemetry = asObject(root['2'])
  const telemetryNested = asObject(telemetry?.location)
  const telemetryLat =
    asNumber(telemetry?.lat) ??
    asNumber(telemetry?.latitude) ??
    asNumber(telemetryNested?.lat) ??
    asNumber(telemetryNested?.latitude)
  const telemetryLon =
    asNumber(telemetry?.lon) ??
    asNumber(telemetry?.lng) ??
    asNumber(telemetry?.longitude) ??
    asNumber(telemetryNested?.lon) ??
    asNumber(telemetryNested?.lng) ??
    asNumber(telemetryNested?.longitude)
  if (telemetryLat !== undefined && telemetryLon !== undefined) {
    return { lat: telemetryLat, lon: telemetryLon }
  }
  const telemetryArray = Array.isArray(root['2']) ? root['2'] : null
  if (telemetryArray && telemetryArray.length >= 2) {
    const latFromArray = asNumber(telemetryArray[0])
    const lonFromArray = asNumber(telemetryArray[1])
    if (latFromArray !== undefined && lonFromArray !== undefined) {
      return { lat: latFromArray, lon: lonFromArray }
    }
  }
  return undefined
}

function parseCommandEntries(root: Record<string, unknown>): unknown[] {
  const value = root['9']
  if (!Array.isArray(value)) {
    return []
  }
  return value
}

function parseReferenceMeta(root: Record<string, unknown>): {
  replyToId?: string
  reactionTo?: string
  reactionEmoji?: string
  reactionSender?: string
} {
  const refs = asObject(root['14'])
  if (!refs) {
    return {}
  }
  const reaction = asObject(refs.reaction)
  return {
    replyToId:
      asNonEmptyString(refs.reply_to) ??
      asNonEmptyString(refs.reply) ??
      asNonEmptyString(refs.reply_id) ??
      asNonEmptyString(asObject(refs.reply_ref)?.id),
    reactionTo: asNonEmptyString(reaction?.to) ?? asNonEmptyString(refs.reaction_to),
    reactionEmoji: asNonEmptyString(reaction?.emoji) ?? asNonEmptyString(refs.reaction_emoji),
    reactionSender: asNonEmptyString(reaction?.sender) ?? asNonEmptyString(refs.reaction_sender),
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return value
}

function decodeWireText(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }
  const bytes = decodeWireBytes(value)
  if (!bytes || bytes.length === 0) {
    return null
  }
  try {
    return new TextDecoder().decode(bytes).trim() || null
  } catch {
    return null
  }
}

function decodeWireBytes(value: unknown): Uint8Array | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null
  }
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index]
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 || entry > 255) {
      return null
    }
    bytes[index] = entry
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function estimateBase64Size(value: string | undefined): number {
  if (!value) {
    return 0
  }
  const trimmed = value.trim().replace(/=+$/, '')
  if (!trimmed) {
    return 0
  }
  return Math.max(0, Math.floor((trimmed.length * 3) / 4))
}
