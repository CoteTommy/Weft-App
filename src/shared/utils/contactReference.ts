const DESTINATION_HASH_RE = /^[0-9a-f]{32}$/i
const PUBLIC_KEY_RE = /^[0-9a-f]{128}$/i

export type ContactReferenceFormat = 'destination_hash' | 'lxma_uri'

export interface ParsedContactReference {
  format: ContactReferenceFormat
  destinationHash: string
  publicKeyHex: string | null
  canonical: string
}

export type ParseContactReferenceResult =
  | {
      ok: true
      value: ParsedContactReference
    }
  | {
      ok: false
      error: string
    }

export function parseLxmfContactReference(input: string): ParseContactReferenceResult {
  const compact = input.trim().replace(/\s+/g, '')
  if (!compact) {
    return {
      ok: false,
      error: 'Enter a destination hash or lxma:// identity link.',
    }
  }

  if (DESTINATION_HASH_RE.test(compact)) {
    const destinationHash = compact.toLowerCase()
    return {
      ok: true,
      value: {
        format: 'destination_hash',
        destinationHash,
        publicKeyHex: null,
        canonical: destinationHash,
      },
    }
  }

  const linkPayload = extractLxmaPayload(compact)
  if (!linkPayload) {
    return {
      ok: false,
      error: 'Invalid identity format. Use a 32-char destination hash or lxma://hash[:pubkey].',
    }
  }

  const [destinationRaw, publicKeyRaw] = linkPayload.split(':')
  if (!DESTINATION_HASH_RE.test(destinationRaw)) {
    return {
      ok: false,
      error: 'lxma:// destination hash must be 32 hexadecimal characters.',
    }
  }
  if (publicKeyRaw && !PUBLIC_KEY_RE.test(publicKeyRaw)) {
    return {
      ok: false,
      error: 'lxma:// public key must be 128 hexadecimal characters when provided.',
    }
  }

  const destinationHash = destinationRaw.toLowerCase()
  const publicKeyHex = publicKeyRaw ? publicKeyRaw.toLowerCase() : null
  const canonical = publicKeyHex
    ? `lxma://${destinationHash}:${publicKeyHex}`
    : `lxma://${destinationHash}`

  return {
    ok: true,
    value: {
      format: 'lxma_uri',
      destinationHash,
      publicKeyHex,
      canonical,
    },
  }
}

export function buildNewChatHref(destinationHash: string, displayName?: string): string {
  const params = new URLSearchParams()
  params.set('new_dest', destinationHash.trim())
  const normalizedName = displayName?.trim()
  if (normalizedName) {
    params.set('new_name', normalizedName)
  }
  return `/chats?${params.toString()}`
}

function extractLxmaPayload(value: string): string | null {
  if (!value.toLowerCase().startsWith('lxma://')) {
    return null
  }
  const payload = value.slice('lxma://'.length).split(/[?#]/, 1)[0]
  if (!payload) {
    return null
  }
  const parts = payload.split(':')
  if (parts.length < 1 || parts.length > 2) {
    return null
  }
  return payload
}
