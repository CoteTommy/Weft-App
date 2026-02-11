export interface SettingsSnapshot {
  displayName: string
  connection: 'Connected' | 'Offline'
  rpcEndpoint: string
  profile: string
  backupStatus: 'Available' | 'Unavailable'
}
