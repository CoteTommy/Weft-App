import type { LxmfDeliveryPolicy, LxmfPropagationState, LxmfStampPolicy } from '../lxmf-payloads'

export type ProbeOptions = {
  profile?: string
  rpc?: string
}

export type DaemonControlOptions = ProbeOptions & {
  managed?: boolean
  reticulumd?: string
  transport?: string
}

export type LxmfSendMessageOptions = ProbeOptions & {
  destination: string
  content: string
  title?: string
  source?: string
  id?: string
  fields?: unknown
  method?: string
  stampCost?: number
  includeTicket?: boolean
  replyToId?: string
  reaction?: {
    to: string
    emoji: string
    sender?: string
  }
  telemetryLocation?: {
    lat: number
    lon: number
    alt?: number
    speed?: number
    accuracy?: number
  }
}

export type LxmfSendCommandOptions = ProbeOptions & {
  destination: string
  commands?: string[]
  commandsHex?: string[]
  content?: string
  title?: string
  source?: string
  id?: string
  method?: string
  stampCost?: number
  includeTicket?: boolean
}

export type LxmfRichAttachment = {
  name: string
  dataBase64: string
  mime?: string
  sizeBytes?: number
}

export type LxmfSendRichMessageOptions = ProbeOptions & {
  destination: string
  content: string
  title?: string
  source?: string
  id?: string
  attachments?: LxmfRichAttachment[]
  method?: string
  stampCost?: number
  includeTicket?: boolean
  replyToId?: string
  reaction?: {
    to: string
    emoji: string
    sender?: string
  }
  telemetryLocation?: {
    lat: number
    lon: number
    alt?: number
    speed?: number
    accuracy?: number
  }
}

export type LxmfSendMessageResponse = {
  result: unknown
  resolved: {
    source: string
    destination: string
  }
}

export type LxmfProfileInfo = {
  profile: string
  displayName: string | null
  rpc: string
  managed: boolean
}

export type LxmfEventPumpStatus = {
  running: boolean
  intervalMs?: number
}

export type LxmfIndexStatus = {
  ready: boolean
  messageCount: number
  threadCount: number
  lastSyncMs: number | null
}

export interface LxmfClearResponse {
  cleared: string
}

export interface LxmfSetInterfacesInput {
  kind: string
  enabled: boolean
  host?: string | null
  port?: number | null
}

export interface LxmfSetInterfacesResponse {
  updated: boolean
}

export interface LxmfReloadConfigResponse {
  reloaded: boolean
  timestamp: number
}

export interface LxmfPeerSyncResponse {
  peer: string
  synced: boolean
}

export interface LxmfPeerUnpeerResponse {
  removed: boolean
}

export interface LxmfDeliveryPolicyUpdate {
  authRequired?: boolean
  allowedDestinations?: string[]
  deniedDestinations?: string[]
  ignoredDestinations?: string[]
  prioritisedDestinations?: string[]
}

export interface LxmfDeliveryPolicyResponse {
  policy: LxmfDeliveryPolicy
}

export interface LxmfPropagationStatusResponse {
  propagation: LxmfPropagationState
}

export interface LxmfPropagationEnableInput {
  enabled: boolean
  storeRoot?: string
  targetCost?: number
}

export interface LxmfPropagationIngestInput {
  transientId?: string
  payloadHex?: string
}

export interface LxmfPropagationIngestResponse {
  ingestedCount: number
  transientId: string
}

export interface LxmfPropagationFetchInput {
  transientId: string
}

export interface LxmfPropagationFetchResponse {
  transientId: string
  payloadHex: string
}

export interface LxmfStampPolicyUpdate {
  targetCost?: number
  flexibility?: number
}

export interface LxmfStampPolicyResponse {
  stampPolicy: LxmfStampPolicy
}

export interface LxmfTicketGenerateInput {
  destination: string
  ttlSecs?: number
}

export interface LxmfTicketGenerateResponse {
  ticket: string
  destination: string
  expiresAt: number
  ttlSecs: number
}

export type LxmfThreadQueryItem = {
  threadId: string
  name: string
  destination: string
  preview: string
  unread: number
  pinned: boolean
  muted: boolean
  lastMessageId: string | null
  lastActivityMs: number
}

export type LxmfThreadQueryResponse = {
  items: LxmfThreadQueryItem[]
  nextCursor: string | null
}

export type LxmfIndexedMessage = {
  id: string
  source: string
  destination: string
  title: string
  content: string
  timestamp: number
  direction: string
  fields: Record<string, unknown> | null
  receiptStatus: string | null
}

export type LxmfThreadMessageQueryResponse = {
  items: LxmfIndexedMessage[]
  nextCursor: string | null
}

export type LxmfSearchResponse = {
  items: LxmfIndexedMessage[]
  nextCursor: string | null
}

export type LxmfIndexedFileItem = {
  id: string
  name: string
  kind: string
  sizeLabel: string
  owner: string
  mime?: string
  dataBase64?: string
  paperUri?: string
  paperTitle?: string
  paperCategory?: string
}

export type LxmfFilesQueryResponse = {
  items: LxmfIndexedFileItem[]
  nextCursor: string | null
}

export type LxmfIndexedMapPoint = {
  id: string
  label: string
  lat: number
  lon: number
  source: string
  when: string
  direction: 'in' | 'out' | 'unknown'
}

export type LxmfMapPointsQueryResponse = {
  items: LxmfIndexedMapPoint[]
  nextCursor: string | null
}

export type LxmfAttachmentBlobResponse = {
  mime: string | null
  sizeBytes: number
  dataBase64: string
}
