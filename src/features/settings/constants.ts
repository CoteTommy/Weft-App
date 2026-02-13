import type { ConnectivityMode } from '@shared/runtime/preferences'
import type { SettingsSnapshot } from '@shared/types/settings'
import type { SettingsSection } from './types'

export const CONNECTIVITY_OPTIONS: Array<{ value: ConnectivityMode; label: string }> = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'local_only', label: 'Local only' },
  { value: 'lan_shared', label: 'LAN shared' },
  { value: 'custom', label: 'Custom' },
]

export const DEFAULT_NOTIFICATION_SETTINGS: SettingsSnapshot['notifications'] = {
  desktopEnabled: true,
  inAppEnabled: true,
  messageEnabled: true,
  systemEnabled: true,
  connectionEnabled: true,
  soundEnabled: false,
}

export const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'profile', label: 'Profile' },
  { id: 'connectivity', label: 'Connectivity' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'data', label: 'Data' },
  { id: 'advanced', label: 'Advanced' },
]

