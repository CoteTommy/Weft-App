import { daemonStatus } from '../../../lib/lxmf-api'
import type { SettingsSnapshot } from '../../../shared/types/settings'

export async function fetchSettingsSnapshot(): Promise<SettingsSnapshot> {
  const status = await daemonStatus()
  return {
    displayName: 'You',
    connection: status.running ? 'Connected' : 'Offline',
    rpcEndpoint: status.rpc,
    profile: status.profile,
    backupStatus: 'Available',
  }
}
