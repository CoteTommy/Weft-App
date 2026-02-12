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
    outboundPropagationPeer: string | null
    propagationNodes: Array<{
      peer: string
      name: string | null
      last_seen: number
      capabilities: string[]
      selected: boolean
    }>
  }
  notifications: {
    desktopEnabled: boolean
    inAppEnabled: boolean
    messageEnabled: boolean
    systemEnabled: boolean
    connectionEnabled: boolean
    soundEnabled: boolean
  }
}
