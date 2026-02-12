import {
  daemonRestart,
  daemonStatus,
  getLxmfProfile,
  probeLxmf,
  setLxmfDisplayName,
} from '../../../lib/lxmf-api'
import type { SettingsSnapshot } from '../../../shared/types/settings'
import {
  type ConnectivityMode,
  getWeftPreferences,
  updateWeftPreferences,
} from '../../../shared/runtime/preferences'
import { resolveDisplayName, setStoredDisplayName } from '../../../shared/utils/identity'

export async function fetchSettingsSnapshot(): Promise<SettingsSnapshot> {
  const preferences = getWeftPreferences()
  const [status, probe, profile] = await Promise.all([
    daemonStatus(),
    probeLxmf(),
    getLxmfProfile().catch(() => null),
  ])
  const displayName = resolveDisplayName(
    status.profile,
    probe.rpc.identity_hash,
    profile?.displayName ?? null,
  )
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
    },
    notificationsEnabled: preferences.notificationsEnabled,
  }
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
  const normalizedProfile = input.profile?.trim() || 'default'
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

export function saveNotificationSettings(enabled: boolean): void {
  updateWeftPreferences({
    notificationsEnabled: enabled,
  })
}
