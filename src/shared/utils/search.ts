export type SearchValue = string | number | null | undefined

export interface IndexedSearchItem<T> {
  item: T
  searchText: string
}

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function tokenizeQuery(query: string): string[] {
  const normalized = normalizeSearchText(query)
  if (!normalized) {
    return []
  }
  return normalized.split(' ')
}

export function buildSearchText(values: SearchValue[]): string {
  return values
    .map((value) => normalizeSearchText(String(value ?? '')))
    .filter(Boolean)
    .join(' ')
}

export function matchesSearchTokens(tokens: string[], searchText: string): boolean {
  if (tokens.length === 0) {
    return true
  }
  const normalizedText = normalizeSearchText(searchText)
  if (!normalizedText) {
    return false
  }
  return tokens.every((token) => normalizedText.includes(token))
}

export function matchesQuery(query: string, values: SearchValue[]): boolean {
  return matchesSearchTokens(tokenizeQuery(query), buildSearchText(values))
}

export function indexSearchItems<T>(
  items: T[],
  toSearchValues: (item: T) => SearchValue[],
): IndexedSearchItem<T>[] {
  return items.map((item) => ({
    item,
    searchText: buildSearchText(toSearchValues(item)),
  }))
}

export function filterIndexedItems<T>(
  items: IndexedSearchItem<T>[],
  query: string,
): T[] {
  const tokens = tokenizeQuery(query)
  if (tokens.length === 0) {
    return items.map((entry) => entry.item)
  }
  return items
    .filter((entry) => matchesSearchTokens(tokens, entry.searchText))
    .map((entry) => entry.item)
}
