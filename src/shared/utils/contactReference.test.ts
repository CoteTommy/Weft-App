import { describe, expect, test } from 'bun:test'

import { buildNewChatHref, parseLxmfContactReference } from './contactReference'

describe('parseLxmfContactReference', () => {
  test('parses a destination hash from Sideband copy-address', () => {
    const parsed = parseLxmfContactReference('AABBCCDDEEFF00112233445566778899')
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.destinationHash).toBe('aabbccddeeff00112233445566778899')
      expect(parsed.value.publicKeyHex).toBeNull()
      expect(parsed.value.format).toBe('destination_hash')
    }
  })

  test('parses lxma:// with destination and public key', () => {
    const parsed = parseLxmfContactReference(
      'lxma://00112233445566778899aabbccddeeff:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    )
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.destinationHash).toBe('00112233445566778899aabbccddeeff')
      expect(parsed.value.publicKeyHex).toHaveLength(128)
      expect(parsed.value.format).toBe('lxma_uri')
    }
  })

  test('accepts lxma:// with destination only', () => {
    const parsed = parseLxmfContactReference(
      'lxma://00112233445566778899aabbccddeeff?name=Example',
    )
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.value.destinationHash).toBe('00112233445566778899aabbccddeeff')
      expect(parsed.value.publicKeyHex).toBeNull()
    }
  })

  test('rejects invalid formats', () => {
    const parsed = parseLxmfContactReference('not-a-valid-hash')
    expect(parsed.ok).toBe(false)
  })
})

describe('buildNewChatHref', () => {
  test('builds a chat link with destination and optional name', () => {
    expect(buildNewChatHref('00112233445566778899aabbccddeeff')).toBe(
      '/chats?new_dest=00112233445566778899aabbccddeeff',
    )
    expect(buildNewChatHref('00112233445566778899aabbccddeeff', 'Alice')).toBe(
      '/chats?new_dest=00112233445566778899aabbccddeeff&new_name=Alice',
    )
  })
})
