import type { ConnectivityMode } from '../runtime/preferences'

export interface SettingsSnapshot {
  displayName: string
  connection: 'Connected' | 'Offline'
  rpcEndpoint: string
  profile: string
  backupStatus: 'Available' | 'Unavailable'
  identityHash?: string
  connectivity: {
    mode: ConnectivityMode
    profile?: string
    rpc?: string
    transport?: string
    autoStartDaemon: boolean
  }
  notificationsEnabled: boolean
}
