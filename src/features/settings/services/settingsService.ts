import { clearAttachmentPreviewCache } from '@features/files/services/attachmentPreviewCache'
import {
  type AttachmentPreviewMode,
  type ConnectivityMode,
  getWeftPreferences,
  type MotionPreference,
  updateWeftPreferences,
} from '@shared/runtime/preferences'
import type { SettingsSnapshot } from '@shared/types/settings'
import { resolveDisplayName, setStoredDisplayName } from '@shared/utils/identity'
import { getDesktopShellPreferences, setDesktopShellPreferences } from '@lib/desktop-shell-api'
import {
  daemonRestart,
  daemonStatus,
  getLxmfOutboundPropagationNode,
  getLxmfProfile,
  getRuntimeMetrics,
  listLxmfMessages,
  listLxmfPropagationNodes,
  lxmfQueryThreadMessages,
  lxmfQueryThreads,
  probeLxmf,
  rebuildThreadSummaries,
  setLxmfDisplayName,
  setLxmfOutboundPropagationNode,
} from '@lib/lxmf-api'
import type { LxmfMessageRecord } from '@lib/lxmf-payloads'

import { buildInteropSnapshot } from './interopHealth'

export async function fetchSettingsSnapshot(): Promise<SettingsSnapshot> {
  const preferences = getWeftPreferences()
  const [
    status,
    probe,
    profile,
    propagationNodes,
    outboundPropagationNode,
    messages,
    desktop,
    runtimeMetrics,
  ] = await Promise.all([
    daemonStatus(),
    probeLxmf(),
    getLxmfProfile().catch(() => null),
    listLxmfPropagationNodes().catch(() => ({ nodes: [], meta: null })),
    getLxmfOutboundPropagationNode().catch(() => ({ peer: null, meta: null })),
    loadInteropMessages().catch(() => []),
    getDesktopShellPreferences().catch(() => ({
      minimizeToTrayOnClose: true,
      startInTray: false,
      singleInstanceFocus: true,
      notificationsMuted: !preferences.notificationsEnabled,
      platform: 'unknown',
      appearance: 'unknown' as const,
    })),
    getRuntimeMetrics().catch(() => ({
      rssBytes: null,
      dbSizeBytes: 0,
      queueSize: 0,
      messageCount: 0,
      threadCount: 0,
    })),
  ])
  const displayName = resolveDisplayName(
    status.profile,
    probe.rpc.identity_hash,
    profile?.displayName ?? null
  )
  const interop = buildInteropSnapshot({
    expectedProfile: preferences.profile,
    expectedRpc: preferences.rpc,
    actualProfile: status.profile,
    actualRpc: status.rpc,
    probe,
    relaySelected: Boolean(outboundPropagationNode.peer),
    propagationNodes: propagationNodes.nodes.length,
    messages,
    runtimeConnected: status.running,
  })
  return {
    displayName,
    connection: status.running ? 'Connected' : 'Offline',
    rpcEndpoint: status.rpc,
    profile: status.profile,
    backupStatus: 'Available',
    identityHash: probe.rpc.identity_hash ?? undefined,
    connectivity: {
      mode: preferences.connectivityMode,
      profile: preferences.profile,
      rpc: preferences.rpc,
      transport: preferences.transport,
      autoStartDaemon: preferences.autoStartDaemon,
      outboundPropagationPeer: outboundPropagationNode.peer,
      propagationNodes: propagationNodes.nodes,
    },
    notifications: {
      desktopEnabled: preferences.notificationsEnabled,
      inAppEnabled: preferences.inAppNotificationsEnabled,
      messageEnabled: preferences.messageNotificationsEnabled,
      systemEnabled: preferences.systemNotificationsEnabled,
      connectionEnabled: preferences.connectionNotificationsEnabled,
      soundEnabled: preferences.notificationSoundEnabled,
    },
    performance: {
      motionPreference: preferences.motionPreference,
      hudEnabled: preferences.performanceHudEnabled,
      threadPageSize: preferences.threadPageSize,
      messagePageSize: preferences.messagePageSize,
      attachmentPreviewMode: preferences.attachmentPreviewMode,
      runtimeMetrics,
    },
    desktop,
    features: {
      commandCenterEnabled: preferences.commandCenterEnabled,
    },
    interop,
  }
}

async function loadInteropMessages(): Promise<LxmfMessageRecord[]> {
  try {
    const threadPage = await lxmfQueryThreads({}, { limit: 50 })
    if (threadPage.items.length === 0) {
      return []
    }
    const batches = await Promise.all(
      threadPage.items.slice(0, 20).map(thread =>
        lxmfQueryThreadMessages(thread.threadId, {}, { limit: 120 }).catch(() => ({
          items: [],
          nextCursor: null,
        }))
      )
    )
    const out = batches.flatMap(batch =>
      batch.items.map(item => ({
        id: item.id,
        source: item.source,
        destination: item.destination,
        title: item.title,
        content: item.content,
        timestamp: item.timestamp,
        direction: item.direction,
        fields: item.fields,
        receipt_status: item.receiptStatus,
      }))
    )
    if (out.length > 0) {
      return out
    }
  } catch {
    // Fall through to legacy query path.
  }
  const legacy = await listLxmfMessages().catch(() => ({ messages: [], meta: null }))
  return legacy.messages
}

export async function saveOutboundPropagationNode(input: {
  peer: string | null
  profile?: string
  rpc?: string
}): Promise<string | null> {
  const profile = normalizeProfile(input.profile)
  const rpc = input.rpc?.trim() || undefined
  const response = await setLxmfOutboundPropagationNode(normalizePeer(input.peer), {
    profile,
    rpc,
  })
  return response.peer
}

export async function saveDisplayName(displayName: string): Promise<void> {
  const normalized = displayName.trim()
  const profile = await setLxmfDisplayName(normalized || null)
  setStoredDisplayName(profile.displayName ?? '')
}

export async function saveConnectivitySettings(input: {
  mode: ConnectivityMode
  profile?: string
  rpc?: string
  transport?: string
  autoStartDaemon: boolean
  restartDaemon?: boolean
}): Promise<void> {
  const normalizedProfile = normalizeProfile(input.profile)
  const normalizedRpc = input.rpc?.trim() || undefined
  const normalizedTransport = input.transport?.trim() || undefined
  updateWeftPreferences({
    connectivityMode: input.mode,
    profile: normalizedProfile,
    rpc: normalizedRpc,
    transport: normalizedTransport,
    autoStartDaemon: input.autoStartDaemon,
  })
  if (input.restartDaemon) {
    await daemonRestart({
      managed: true,
      profile: normalizedProfile,
      rpc: normalizedRpc,
      transport: normalizedTransport,
    })
  }
}

function normalizeProfile(value?: string): string | undefined {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }
  if (normalized.toLowerCase() === 'default') {
    return undefined
  }
  return normalized
}

function normalizePeer(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized ? normalized : null
}

export function saveNotificationSettings(input: {
  desktopEnabled?: boolean
  inAppEnabled?: boolean
  messageEnabled?: boolean
  systemEnabled?: boolean
  connectionEnabled?: boolean
  soundEnabled?: boolean
}): void {
  updateWeftPreferences({
    notificationsEnabled: input.desktopEnabled,
    inAppNotificationsEnabled: input.inAppEnabled,
    messageNotificationsEnabled: input.messageEnabled,
    systemNotificationsEnabled: input.systemEnabled,
    connectionNotificationsEnabled: input.connectionEnabled,
    notificationSoundEnabled: input.soundEnabled,
  })
}

export function savePerformanceSettings(input: {
  motionPreference?: MotionPreference
  hudEnabled?: boolean
  threadPageSize?: number
  messagePageSize?: number
  attachmentPreviewMode?: AttachmentPreviewMode
}): void {
  updateWeftPreferences({
    motionPreference: input.motionPreference,
    performanceHudEnabled: input.hudEnabled,
    threadPageSize: input.threadPageSize,
    messagePageSize: input.messagePageSize,
    attachmentPreviewMode: input.attachmentPreviewMode,
  })
}

export async function refreshRuntimeMetrics() {
  return await getRuntimeMetrics()
}

export async function runSettingsMaintenance(input: {
  action: 'clear_attachment_cache' | 'rebuild_thread_summaries'
}): Promise<{ ok: boolean; detail: string }> {
  if (input.action === 'clear_attachment_cache') {
    clearAttachmentPreviewCache()
    return { ok: true, detail: 'Attachment preview cache cleared.' }
  }
  const result = await rebuildThreadSummaries()
  return {
    ok: result.rebuilt,
    detail: result.rebuilt
      ? 'Thread summaries rebuilt from indexed messages.'
      : 'Thread summary rebuild did not complete.',
  }
}

export function saveFeatureSettings(input: { commandCenterEnabled?: boolean }): void {
  updateWeftPreferences({
    commandCenterEnabled: input.commandCenterEnabled,
  })
}

export async function saveDesktopShellSettings(input: {
  minimizeToTrayOnClose?: boolean
  startInTray?: boolean
  singleInstanceFocus?: boolean
  notificationsMuted?: boolean
}): Promise<SettingsSnapshot['desktop']> {
  const next = await setDesktopShellPreferences(input)
  if (typeof input.notificationsMuted === 'boolean') {
    updateWeftPreferences({
      notificationsEnabled: !input.notificationsMuted,
    })
  }
  return {
    minimizeToTrayOnClose: next.minimizeToTrayOnClose,
    startInTray: next.startInTray,
    singleInstanceFocus: next.singleInstanceFocus,
    notificationsMuted: next.notificationsMuted,
    platform: next.platform,
    appearance: next.appearance,
  }
}
