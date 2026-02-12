import type { ConnectivityMode } from '../../shared/runtime/preferences'
import type { SettingsSnapshot } from '../../shared/types/settings'

export type SettingsSection = 'profile' | 'connectivity' | 'notifications' | 'data' | 'advanced'

export interface SettingsConfigPayload {
  mode?: ConnectivityMode
  profile?: string
  rpc?: string
  transport?: string
  autoStartDaemon?: boolean
  notificationsEnabled?: boolean
  notifications?: Partial<SettingsSnapshot['notifications']>
}

export interface BackupPayload {
  schema?: string
  displayName?: string
  connectivity?: {
    mode?: ConnectivityMode
    profile?: string
    rpc?: string
    transport?: string
    autoStartDaemon?: boolean
    notificationsEnabled?: boolean
  }
  notifications?: Partial<SettingsSnapshot['notifications']>
}

