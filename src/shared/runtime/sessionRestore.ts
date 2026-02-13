const RESTORABLE_PREFIXES = [
  '/chats',
  '/people',
  '/map',
  '/network',
  '/interfaces',
  '/announces',
  '/files',
  '/settings',
  '/command-center',
] as const

export const DEFAULT_MAIN_ROUTE = '/chats'

export function isRestorableMainRoute(route: string): boolean {
  const normalized = route.trim()
  if (!normalized.startsWith('/')) {
    return false
  }
  return RESTORABLE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`) || normalized.startsWith(`${prefix}?`))
}

export function normalizeMainRoute(route: string | undefined | null): string {
  if (!route) {
    return DEFAULT_MAIN_ROUTE
  }
  const normalized = route.trim()
  if (!isRestorableMainRoute(normalized)) {
    return DEFAULT_MAIN_ROUTE
  }
  return normalized
}
