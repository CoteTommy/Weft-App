export function formatClockTime(timestampMs: number): string {
  const date = new Date(timestampMs)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatRelativeFromNow(timestampMs: number): string {
  const deltaMs = Date.now() - timestampMs
  const minutes = Math.max(1, Math.floor(deltaMs / 60_000))
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }
  const days = Math.floor(hours / 24)
  return `${days}d`
}
