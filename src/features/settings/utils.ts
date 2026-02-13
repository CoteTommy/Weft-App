import type { ConnectivityMode } from '@shared/runtime/preferences'
import type { SettingsSnapshot } from '@shared/types/settings'
import type { SettingsConfigPayload, SettingsSection } from './types'

export function buildConfigPayload(input: {
  mode: ConnectivityMode
  profile?: string
  rpc: string
  transport: string
  autoStartDaemon: boolean
  notifications: SettingsSnapshot['notifications']
  performance: SettingsSnapshot['performance']
  desktop: SettingsSnapshot['desktop']
  features: SettingsSnapshot['features']
}): SettingsConfigPayload {
  return {
    mode: input.mode,
    profile: input.profile,
    rpc: input.rpc,
    transport: input.transport,
    autoStartDaemon: input.autoStartDaemon,
    notifications: input.notifications,
    performance: input.performance,
    desktop: input.desktop,
    features: input.features,
  }
}

export function mergeNotificationSettings(
  current: SettingsSnapshot['notifications'],
  patch?: Partial<SettingsSnapshot['notifications']>,
  legacyDesktopEnabled?: boolean,
): SettingsSnapshot['notifications'] {
  return {
    ...current,
    ...(patch ?? {}),
    ...(typeof legacyDesktopEnabled === 'boolean' ? { desktopEnabled: legacyDesktopEnabled } : {}),
  }
}

export function parseSettingsSection(value: string | null): SettingsSection {
  if (
    value === 'profile' ||
    value === 'connectivity' ||
    value === 'notifications' ||
    value === 'data' ||
    value === 'advanced'
  ) {
    return value
  }
  return 'profile'
}
