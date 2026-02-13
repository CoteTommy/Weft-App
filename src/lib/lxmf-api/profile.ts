import { invokeWithProbe, parseLxmfProfileInfo } from './common'
import type { LxmfProfileInfo, ProbeOptions } from './types'

export async function getLxmfProfile(options: ProbeOptions = {}): Promise<LxmfProfileInfo> {
  const payload = await invokeWithProbe<unknown>('lxmf_get_profile', options)
  return parseLxmfProfileInfo(payload)
}

export async function setLxmfDisplayName(
  displayName: string | null,
  options: ProbeOptions = {},
): Promise<LxmfProfileInfo> {
  const payload = await invokeWithProbe<unknown>('lxmf_set_display_name', options, {
    display_name: displayName,
  })
  return parseLxmfProfileInfo(payload)
}

