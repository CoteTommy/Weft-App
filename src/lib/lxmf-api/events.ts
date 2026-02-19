import { listen, type UnlistenFn } from '@tauri-apps/api/event'

import { type LxmfRpcEvent, parseLxmfRpcEventOrNull } from '../lxmf-payloads'
import { invokeWithProbe, parseEventPumpStatus } from './common'
import { TAURI_IPC_COMMANDS } from './generated/tauriIpcV2'
import type { LxmfEventPumpStatus, ProbeOptions } from './types'

export async function pollLxmfEvent(options: ProbeOptions = {}): Promise<LxmfRpcEvent | null> {
  const payload = await invokeWithProbe<unknown>(TAURI_IPC_COMMANDS.LXMF_POLL_EVENT, options)
  return parseLxmfRpcEventOrNull(payload)
}

export async function startLxmfEventPump(
  options: ProbeOptions & { intervalMs?: number } = {}
): Promise<LxmfEventPumpStatus> {
  const payload = await invokeWithProbe<unknown>(
    TAURI_IPC_COMMANDS.LXMF_START_EVENT_PUMP,
    options,
    {
      interval_ms: options.intervalMs ?? null,
    }
  )
  return parseEventPumpStatus(payload)
}

export async function setLxmfEventPumpPolicy(
  mode: 'foreground' | 'background' | 'hidden',
  options: ProbeOptions & { intervalMs?: number } = {}
): Promise<LxmfEventPumpStatus> {
  const payload = await invokeWithProbe<unknown>(
    TAURI_IPC_COMMANDS.LXMF_SET_EVENT_PUMP_POLICY,
    options,
    {
      mode,
      interval_ms: options.intervalMs ?? null,
    }
  )
  return parseEventPumpStatus(payload)
}

export async function stopLxmfEventPump(): Promise<LxmfEventPumpStatus> {
  const payload = await invokeWithProbe<unknown>(TAURI_IPC_COMMANDS.LXMF_STOP_EVENT_PUMP)
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
