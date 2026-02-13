import { DISPLAY_NAME_UPDATED_EVENT } from '@app/config/events'

export function shortHash(value: string, visible: number = 6): string {
  const trimmed = value.trim()
  if (trimmed.length <= visible * 2) {
    return trimmed
  }
  return `${trimmed.slice(0, visible)}...${trimmed.slice(-visible)}`
}

const DISPLAY_NAME_KEY = 'weft.display_name'

export { DISPLAY_NAME_UPDATED_EVENT }

export function getStoredDisplayName(): string | null {
  if (typeof window === 'undefined') {
    return null
  }
  const stored = window.localStorage.getItem(DISPLAY_NAME_KEY)
  if (!stored) {
    return null
  }
  const normalized = stored.trim()
  return normalized.length > 0 ? normalized : null
}

export function setStoredDisplayName(value: string): void {
  if (typeof window === 'undefined') {
    return
  }
  const normalized = value.trim()
  if (!normalized) {
    window.localStorage.removeItem(DISPLAY_NAME_KEY)
    window.dispatchEvent(new Event(DISPLAY_NAME_UPDATED_EVENT))
    return
  }
  window.localStorage.setItem(DISPLAY_NAME_KEY, normalized)
  window.dispatchEvent(new Event(DISPLAY_NAME_UPDATED_EVENT))
}

export function resolveDisplayName(
  profile: string,
  identityHash?: string | null,
  lxmfDisplayName?: string | null
): string {
  const normalizedLxmfDisplayName = lxmfDisplayName?.trim()
  if (normalizedLxmfDisplayName) {
    return normalizedLxmfDisplayName
  }

  const stored = getStoredDisplayName()
  if (stored) {
    return stored
  }

  const normalizedProfile = profile.trim()
  if (normalizedProfile) {
    return normalizedProfile
  }

  const normalizedIdentity = identityHash?.trim()
  if (normalizedIdentity) {
    return shortHash(normalizedIdentity, 8)
  }

  return 'Unknown'
}
