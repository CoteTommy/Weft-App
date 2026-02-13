import { describe, expect, test } from 'bun:test'

import {
  buildSearchText,
  filterIndexedItems,
  indexSearchItems,
  matchesQuery,
  tokenizeQuery,
} from './search'

describe('search utils', () => {
  test('tokenizes query into lowercased terms', () => {
    expect(tokenizeQuery('  Alice   Relay  ')).toEqual(['alice', 'relay'])
  })

  test('matches query across normalized values', () => {
    expect(matchesQuery('alice relay', ['Alice Node', 'relay online'])).toBe(true)
    expect(matchesQuery('alice missing', ['Alice Node', 'relay online'])).toBe(false)
  })

  test('indexes and filters items with token matching', () => {
    const items = [
      { id: 'a', name: 'Alice', status: 'online' },
      { id: 'b', name: 'Bob', status: 'offline' },
    ]
    const indexed = indexSearchItems(items, item => [item.name, item.status], {
      cacheKey: 'people',
    })
    expect(filterIndexedItems(indexed, 'alice online').map(item => item.id)).toEqual(['a'])
    expect(filterIndexedItems(indexed, 'offline').map(item => item.id)).toEqual(['b'])
  })

  test('buildSearchText flattens nullable values safely', () => {
    expect(buildSearchText(['Alice', null, undefined, 42])).toBe('alice 42')
  })
})
