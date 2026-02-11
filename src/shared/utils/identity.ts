export function shortHash(value: string, visible: number = 6): string {
  const trimmed = value.trim()
  if (trimmed.length <= visible * 2) {
    return trimmed
  }
  return `${trimmed.slice(0, visible)}...${trimmed.slice(-visible)}`
}
