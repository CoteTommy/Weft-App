import { convertFileSrc, isTauri } from '@tauri-apps/api/core'
import { type Event, listen, type UnlistenFn } from '@tauri-apps/api/event'

export function toTauriFileUrl(path: string): string {
  if (isTauri()) {
    return convertFileSrc(path)
  }
  return `file://${path}`
}

export async function listenTauriEvent<TPayload>(
  eventName: string,
  handler: (event: Event<TPayload>) => void
): Promise<UnlistenFn> {
  return await listen<TPayload>(eventName, handler)
}
