import type { ConnectivityMode, MotionPreference } from '@shared/runtime/preferences'
import type { SettingsSnapshot } from '@shared/types/settings'

export type SettingsSection = 'profile' | 'connectivity' | 'notifications' | 'data' | 'advanced'

export interface SettingsConfigPayload {
  mode?: ConnectivityMode
  profile?: string
  rpc?: string
  transport?: string
  autoStartDaemon?: boolean
  notificationsEnabled?: boolean
  notifications?: Partial<SettingsSnapshot['notifications']>
  performance?: Partial<SettingsSnapshot['performance']>
  desktop?: Partial<SettingsSnapshot['desktop']>
  features?: Partial<SettingsSnapshot['features']>
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
  performance?: {
    motionPreference?: MotionPreference
    hudEnabled?: boolean
  }
  desktop?: {
    minimizeToTrayOnClose?: boolean
    startInTray?: boolean
    singleInstanceFocus?: boolean
    notificationsMuted?: boolean
  }
  features?: {
    commandCenterEnabled?: boolean
  }
}
