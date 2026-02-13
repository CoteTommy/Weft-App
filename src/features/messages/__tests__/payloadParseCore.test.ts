import { describe, expect, test } from 'bun:test'

import type { LxmfMessageRecord } from '@lib/lxmf-payloads'

import {
  extractFilesFromMessages,
  extractMapPointsFromMessages,
} from '../services/payloadParseCore'

function message(overrides: Partial<LxmfMessageRecord>): LxmfMessageRecord {
  return {
    id: 'm1',
    source: '1234567890abcdef1234567890abcdef',
    destination: 'abcdef1234567890abcdef1234567890',
    title: '',
    content: '',
    timestamp: 1_700_000_000,
    direction: 'in',
    fields: null,
    receipt_status: null,
    ...overrides,
  }
}

describe('payload parse core', () => {
  test('extracts map points from telemetry fields', () => {
    const points = extractMapPointsFromMessages([
      message({
        id: 'loc1',
        content: 'hello',
        fields: {
          '2': {
            lat: 40.7128,
            lon: -74.006,
          },
        },
      }),
    ])
    expect(points).toHaveLength(1)
    expect(points[0].lat).toBeCloseTo(40.7128, 4)
    expect(points[0].lon).toBeCloseTo(-74.006, 4)
    expect(points[0].source).toContain('...')
  })

  test('extracts file items from canonical attachment field 0x05', () => {
    const bytes = [104, 101, 108, 108, 111] // "hello"
    const files = extractFilesFromMessages([
      message({
        id: 'file1',
        fields: {
          '5': [['note.txt', bytes]],
        },
      }),
    ])
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('note.txt')
    expect(files[0].sizeLabel).toBe('5 B')
    expect(files[0].dataBase64).toBeDefined()
  })
})
