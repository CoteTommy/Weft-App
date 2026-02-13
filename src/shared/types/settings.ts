import type { ConnectivityMode, MotionPreference } from '../runtime/preferences'
import type { DesktopAppearance } from '@lib/desktop-shell-api'

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
  performance: {
    motionPreference: MotionPreference
    hudEnabled: boolean
  }
  desktop: {
    minimizeToTrayOnClose: boolean
    startInTray: boolean
    singleInstanceFocus: boolean
    notificationsMuted: boolean
    platform: string
    appearance: DesktopAppearance
  }
  features: {
    commandCenterEnabled: boolean
  }
  interop: {
    status: 'healthy' | 'warning' | 'critical'
    expectedProfile: string
    expectedRpc: string | null
    actualProfile: string
    actualRpc: string
    profileMatch: boolean
    rpcMatch: boolean
    rpcReachable: boolean
    eventsReachable: boolean
    sendPath: 'ok' | 'degraded' | 'blocked'
    receivePath: 'ok' | 'degraded' | 'unknown' | 'blocked'
    outboundPending: number
    outboundFailed: number
    lastInboundTs: number | null
    lastOutboundTs: number | null
    relaySelected: boolean
    propagationNodes: number
    findings: string[]
  }
}
