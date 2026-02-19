import { invokeWithProbe, parseLxmfProfileInfo } from './common'
import { TAURI_IPC_COMMANDS } from './generated/tauriIpcV2'
import type { LxmfProfileInfo, ProbeOptions } from './types'

export async function getLxmfProfile(options: ProbeOptions = {}): Promise<LxmfProfileInfo> {
  const payload = await invokeWithProbe<unknown>(TAURI_IPC_COMMANDS.LXMF_GET_PROFILE, options)
  return parseLxmfProfileInfo(payload)
}

export async function setLxmfDisplayName(
  displayName: string | null,
  options: ProbeOptions = {}
): Promise<LxmfProfileInfo> {
  const payload = await invokeWithProbe<unknown>(
    TAURI_IPC_COMMANDS.LXMF_SET_DISPLAY_NAME,
    options,
    {
      display_name: displayName,
    }
  )
  return parseLxmfProfileInfo(payload)
}
