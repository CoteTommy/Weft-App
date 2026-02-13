export type StorageWriteErrorCode = 'unavailable' | 'quota' | 'serialize' | 'unknown'

export type StorageWriteResult =
  | { ok: true }
  | {
      ok: false
      code: StorageWriteErrorCode
      message: string
    }

export function readStoredJson<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null
  }
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeStoredJson(key: string, value: unknown): StorageWriteResult {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      code: 'unavailable',
      message: 'window is unavailable',
    }
  }
  try {
    const payload = JSON.stringify(value)
    window.localStorage.setItem(key, payload)
    return { ok: true }
  } catch (error) {
    return normalizeStorageError(error)
  }
}

export function removeStoredKey(key: string): StorageWriteResult {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      code: 'unavailable',
      message: 'window is unavailable',
    }
  }
  try {
    window.localStorage.removeItem(key)
    return { ok: true }
  } catch (error) {
    return normalizeStorageError(error)
  }
}

function normalizeStorageError(error: unknown): StorageWriteResult {
  if (isQuotaExceededError(error)) {
    return {
      ok: false,
      code: 'quota',
      message: 'storage quota exceeded',
    }
  }
  if (error instanceof TypeError) {
    return {
      ok: false,
      code: 'serialize',
      message: error.message,
    }
  }
  return {
    ok: false,
    code: 'unknown',
    message: error instanceof Error ? error.message : String(error),
  }
}

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false
  }
  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  )
}
