const RETRY_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000, 600_000]

export const MAX_AUTO_RETRY_ATTEMPTS = 4

export function retryDelayMs(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt <= 0) {
    return RETRY_BACKOFF_MS[0]
  }
  const index = Math.min(RETRY_BACKOFF_MS.length - 1, Math.trunc(attempt))
  return RETRY_BACKOFF_MS[index]
}
