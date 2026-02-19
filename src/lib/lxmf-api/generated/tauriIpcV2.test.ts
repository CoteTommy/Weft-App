import { describe, expect, test } from 'bun:test'

import { parseIpcV2Envelope, unwrapIpcV2Envelope } from './tauriIpcV2'

describe('tauri ipc v2 envelope parser', () => {
  test('parses ok envelope payloads', () => {
    const parsed = parseIpcV2Envelope<{ running: boolean }>({
      ok: {
        data: { running: true },
        meta: {
          request_id: 'weft-abc',
          schema_version: 'v2',
        },
      },
    })

    expect('ok' in parsed).toBe(true)
    expect(unwrapIpcV2Envelope(parsed)).toEqual({ running: true })
  })

  test('parses error envelope payloads', () => {
    const parsed = parseIpcV2Envelope<{ running: boolean }>({
      error: {
        code: 'runtime_unavailable',
        message: 'runtime not started',
        retryable: true,
        request_id: 'weft-def',
      },
    })

    expect('error' in parsed).toBe(true)
    expect(() => unwrapIpcV2Envelope(parsed)).toThrow('[runtime_unavailable] runtime not started')
  })

  test('rejects malformed payloads', () => {
    expect(() => parseIpcV2Envelope(null)).toThrow('v2 ipc payload must be an object')
    expect(() => parseIpcV2Envelope({ ok: { data: { running: true } } })).toThrow(
      'v2 ipc payload is neither ok nor error envelope'
    )
  })
})
