export type ConnectivityMode = 'automatic' | 'local_only' | 'lan_shared' | 'custom'
export type MotionPreference = 'smooth' | 'snappy' | 'off'

export interface WeftPreferences {
  onboardingCompleted: boolean
  connectivityMode: ConnectivityMode
  profile?: string
  rpc?: string
  transport?: string
  autoStartDaemon: boolean
  notificationsEnabled: boolean
  inAppNotificationsEnabled: boolean
  messageNotificationsEnabled: boolean
  systemNotificationsEnabled: boolean
  connectionNotificationsEnabled: boolean
  notificationSoundEnabled: boolean
  motionPreference: MotionPreference
  performanceHudEnabled: boolean
  pendingRoute?: string
}

const PREFERENCES_KEY = 'weft.preferences.v1'
export const PREFERENCES_UPDATED_EVENT = 'weft:preferences-updated'

const DEFAULT_PREFERENCES: WeftPreferences = {
  onboardingCompleted: false,
  connectivityMode: 'automatic',
  autoStartDaemon: true,
  notificationsEnabled: true,
  inAppNotificationsEnabled: true,
  messageNotificationsEnabled: true,
  systemNotificationsEnabled: true,
  connectionNotificationsEnabled: true,
  notificationSoundEnabled: false,
  motionPreference: 'snappy',
  performanceHudEnabled: false,
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
    profile: normalizeProfile(preferences.profile),
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
  const out: Partial<WeftPreferences> = {}
  if ('onboardingCompleted' in value) {
    out.onboardingCompleted = parseBoolean(value.onboardingCompleted, false)
  }
  if ('connectivityMode' in value) {
    out.connectivityMode = parseConnectivityMode(value.connectivityMode)
  }
  if ('profile' in value) {
    out.profile = normalizeProfile(value.profile)
  }
  if ('rpc' in value) {
    out.rpc = normalizeOptional(value.rpc)
  }
  if ('transport' in value) {
    out.transport = normalizeOptional(value.transport)
  }
  if ('autoStartDaemon' in value) {
    out.autoStartDaemon = parseBoolean(value.autoStartDaemon, true)
  }
  if ('notificationsEnabled' in value) {
    out.notificationsEnabled = parseBoolean(value.notificationsEnabled, true)
  }
  if ('inAppNotificationsEnabled' in value) {
    out.inAppNotificationsEnabled = parseBoolean(value.inAppNotificationsEnabled, true)
  }
  if ('messageNotificationsEnabled' in value) {
    out.messageNotificationsEnabled = parseBoolean(value.messageNotificationsEnabled, true)
  }
  if ('systemNotificationsEnabled' in value) {
    out.systemNotificationsEnabled = parseBoolean(value.systemNotificationsEnabled, true)
  }
  if ('connectionNotificationsEnabled' in value) {
    out.connectionNotificationsEnabled = parseBoolean(value.connectionNotificationsEnabled, true)
  }
  if ('notificationSoundEnabled' in value) {
    out.notificationSoundEnabled = parseBoolean(value.notificationSoundEnabled, false)
  }
  if ('motionPreference' in value) {
    out.motionPreference = parseMotionPreference(value.motionPreference)
  }
  if ('performanceHudEnabled' in value) {
    out.performanceHudEnabled = parseBoolean(value.performanceHudEnabled, false)
  }
  if ('pendingRoute' in value) {
    out.pendingRoute = normalizeOptional(value.pendingRoute)
  }
  return out
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

function parseMotionPreference(value: unknown): MotionPreference {
  if (value === 'smooth' || value === 'snappy' || value === 'off') {
    return value
  }
  return 'snappy'
}

function normalizeOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

function normalizeProfile(value: unknown): string | undefined {
  const normalized = normalizeOptional(value)
  if (!normalized) {
    return undefined
  }
  if (normalized.toLowerCase() === 'default') {
    return undefined
  }
  return normalized
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
