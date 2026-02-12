export type ConnectivityMode = 'automatic' | 'local_only' | 'lan_shared' | 'custom'

export interface WeftPreferences {
  onboardingCompleted: boolean
  connectivityMode: ConnectivityMode
  profile?: string
  rpc?: string
  transport?: string
  autoStartDaemon: boolean
  pendingRoute?: string
}

const PREFERENCES_KEY = 'weft.preferences.v1'
export const PREFERENCES_UPDATED_EVENT = 'weft:preferences-updated'

const DEFAULT_PREFERENCES: WeftPreferences = {
  onboardingCompleted: false,
  connectivityMode: 'automatic',
  autoStartDaemon: true,
}

export function getWeftPreferences(): WeftPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFERENCES }
  }
  const raw = window.localStorage.getItem(PREFERENCES_KEY)
  if (!raw) {
    return { ...DEFAULT_PREFERENCES }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WeftPreferences>
    return {
      ...DEFAULT_PREFERENCES,
      ...sanitizePreferences(parsed),
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function updateWeftPreferences(patch: Partial<WeftPreferences>): WeftPreferences {
  const next = {
    ...getWeftPreferences(),
    ...sanitizePreferences(patch),
  }
  persist(next)
  return next
}

export function hasCompletedOnboarding(): boolean {
  return getWeftPreferences().onboardingCompleted
}

export function getRuntimeConnectionOptions(): { profile?: string; rpc?: string } {
  const preferences = getWeftPreferences()
  return {
    profile: normalizeOptional(preferences.profile),
    rpc: normalizeOptional(preferences.rpc),
  }
}

export function getRuntimeTransportOption(): string | undefined {
  return normalizeOptional(getWeftPreferences().transport)
}

export function setPendingLaunchRoute(route: string): void {
  const normalized = route.trim()
  if (!normalized) {
    return
  }
  updateWeftPreferences({
    pendingRoute: normalized,
  })
}

export function consumePendingLaunchRoute(): string | null {
  const current = getWeftPreferences()
  const route = normalizeOptional(current.pendingRoute)
  if (!route) {
    return null
  }
  updateWeftPreferences({ pendingRoute: undefined })
  return route
}

function persist(value: WeftPreferences): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value))
  window.dispatchEvent(new Event(PREFERENCES_UPDATED_EVENT))
}

function sanitizePreferences(value: Partial<WeftPreferences>): Partial<WeftPreferences> {
  const connectivityMode = parseConnectivityMode(value.connectivityMode)
  return {
    onboardingCompleted: Boolean(value.onboardingCompleted),
    connectivityMode,
    profile: normalizeOptional(value.profile),
    rpc: normalizeOptional(value.rpc),
    transport: normalizeOptional(value.transport),
    autoStartDaemon: value.autoStartDaemon ?? true,
    pendingRoute: normalizeOptional(value.pendingRoute),
  }
}

function parseConnectivityMode(value: unknown): ConnectivityMode {
  if (
    value === 'automatic' ||
    value === 'local_only' ||
    value === 'lan_shared' ||
    value === 'custom'
  ) {
    return value
  }
  return 'automatic'
}

function normalizeOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized ? normalized : undefined
}
