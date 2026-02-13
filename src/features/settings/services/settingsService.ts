import {
  type ConnectivityMode,
  getWeftPreferences,
  type MotionPreference,
  updateWeftPreferences,
} from '@shared/runtime/preferences'
import type { SettingsSnapshot } from '@shared/types/settings'
import { resolveDisplayName, setStoredDisplayName } from '@shared/utils/identity'
import {
  getDesktopShellPreferences,
  setDesktopShellPreferences,
} from '@lib/desktop-shell-api'
import {
  daemonRestart,
  daemonStatus,
  getLxmfOutboundPropagationNode,
  getLxmfProfile,
  listLxmfMessages,
  listLxmfPropagationNodes,
  probeLxmf,
  setLxmfDisplayName,
  setLxmfOutboundPropagationNode,
} from '@lib/lxmf-api'

import { buildInteropSnapshot } from './interopHealth'

export async function fetchSettingsSnapshot(): Promise<SettingsSnapshot> {
  const preferences = getWeftPreferences()
  const [status, probe, profile, propagationNodes, outboundPropagationNode, messages, desktop] =
    await Promise.all([
      daemonStatus(),
      probeLxmf(),
      getLxmfProfile().catch(() => null),
      listLxmfPropagationNodes().catch(() => ({ nodes: [], meta: null })),
      getLxmfOutboundPropagationNode().catch(() => ({ peer: null, meta: null })),
      listLxmfMessages().catch(() => ({ messages: [], meta: null })),
      getDesktopShellPreferences().catch(() => ({
        minimizeToTrayOnClose: true,
        startInTray: false,
        singleInstanceFocus: true,
        notificationsMuted: !preferences.notificationsEnabled,
        platform: 'unknown',
        appearance: 'unknown' as const,
      })),
    ])
  const displayName = resolveDisplayName(
    status.profile,
    probe.rpc.identity_hash,
    profile?.displayName ?? null,
  )
  const interop = buildInteropSnapshot({
    expectedProfile: preferences.profile,
    expectedRpc: preferences.rpc,
    actualProfile: status.profile,
    actualRpc: status.rpc,
    probe,
    relaySelected: Boolean(outboundPropagationNode.peer),
    propagationNodes: propagationNodes.nodes.length,
    messages: messages.messages,
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
    },
    desktop,
    features: {
      commandCenterEnabled: preferences.commandCenterEnabled,
    },
    interop,
  }
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
}): void {
  updateWeftPreferences({
    motionPreference: input.motionPreference,
    performanceHudEnabled: input.hudEnabled,
  })
}

export function saveFeatureSettings(input: {
  commandCenterEnabled?: boolean
}): void {
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
