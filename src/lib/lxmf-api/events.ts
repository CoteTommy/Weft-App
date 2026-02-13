import { listen, type UnlistenFn } from '@tauri-apps/api/event'

import { type LxmfRpcEvent, parseLxmfRpcEventOrNull } from '../lxmf-payloads'
import { invokeWithProbe, parseEventPumpStatus } from './common'
import type { LxmfEventPumpStatus, ProbeOptions } from './types'

export async function pollLxmfEvent(options: ProbeOptions = {}): Promise<LxmfRpcEvent | null> {
  const payload = await invokeWithProbe<unknown>('lxmf_poll_event', options)
  return parseLxmfRpcEventOrNull(payload)
}

export async function startLxmfEventPump(
  options: ProbeOptions & { intervalMs?: number } = {}
): Promise<LxmfEventPumpStatus> {
  const payload = await invokeWithProbe<unknown>('lxmf_start_event_pump', options, {
    interval_ms: options.intervalMs ?? null,
  })
  return parseEventPumpStatus(payload)
}

export async function stopLxmfEventPump(): Promise<LxmfEventPumpStatus> {
  const payload = await invokeWithProbe<unknown>('lxmf_stop_event_pump')
  return parseEventPumpStatus(payload)
}

export async function subscribeLxmfEvents(
  onEvent: (event: LxmfRpcEvent) => void
): Promise<UnlistenFn> {
  return await listen<unknown>('weft://lxmf-event', event => {
    const parsed = parseLxmfRpcEventOrNull(event.payload)
    if (parsed) {
      onEvent(parsed)
    }
  })
}
