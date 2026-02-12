export function matchesQuery(
  query: string,
  values: Array<string | number | null | undefined>,
): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return values
    .map((value) => String(value ?? '').toLowerCase())
    .some((value) => value.includes(normalized))
}
