import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type DesktopAppearance = 'light' | 'dark' | 'unknown'

export interface DesktopShellPreferences {
  minimizeToTrayOnClose: boolean
  startInTray: boolean
  singleInstanceFocus: boolean
  notificationsMuted: boolean
  platform: string
  appearance: DesktopAppearance
}

export interface DesktopTrayAction {
  action: 'new_message' | 'notifications_muted' | string
  muted?: boolean
}

export async function getDesktopShellPreferences(): Promise<DesktopShellPreferences> {
  const payload = await invoke<unknown>('desktop_get_shell_preferences')
  return parseDesktopShellPreferences(payload)
}

export async function setDesktopShellPreferences(
  patch: Partial<
    Pick<
      DesktopShellPreferences,
      'minimizeToTrayOnClose' | 'startInTray' | 'singleInstanceFocus' | 'notificationsMuted'
    >
  >
): Promise<DesktopShellPreferences> {
  const payload = await invoke<unknown>('desktop_set_shell_preferences', {
    minimize_to_tray_on_close: patch.minimizeToTrayOnClose ?? null,
    start_in_tray: patch.startInTray ?? null,
    single_instance_focus: patch.singleInstanceFocus ?? null,
    notifications_muted: patch.notificationsMuted ?? null,
  })
  return parseDesktopShellPreferences(payload)
}

export async function subscribeTrayActions(
  onAction: (action: DesktopTrayAction) => void
): Promise<UnlistenFn> {
  return await listen<unknown>('weft://tray-action', event => {
    const parsed = parseTrayAction(event.payload)
    if (parsed) {
      onAction(parsed)
    }
  })
}

function parseDesktopShellPreferences(value: unknown): DesktopShellPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('desktop shell preferences payload must be an object')
  }
  const record = value as Record<string, unknown>
  return {
    minimizeToTrayOnClose: asBoolean(
      record.minimize_to_tray_on_close,
      'desktop.minimize_to_tray_on_close'
    ),
    startInTray: asBoolean(record.start_in_tray, 'desktop.start_in_tray'),
    singleInstanceFocus: asBoolean(record.single_instance_focus, 'desktop.single_instance_focus'),
    notificationsMuted: asBoolean(record.notifications_muted, 'desktop.notifications_muted'),
    platform: asString(record.platform, 'desktop.platform'),
    appearance: asAppearance(record.appearance),
  }
}

function parseTrayAction(value: unknown): DesktopTrayAction | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (typeof record.action !== 'string' || record.action.trim().length === 0) {
    return null
  }
  const action = record.action.trim()
  const muted = typeof record.muted === 'boolean' ? record.muted : undefined
  return { action, muted }
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`)
  }
  return value
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a string`)
  }
  return value.trim()
}

function asAppearance(value: unknown): DesktopAppearance {
  if (value === 'dark' || value === 'light' || value === 'unknown') {
    return value
  }
  return 'unknown'
}
