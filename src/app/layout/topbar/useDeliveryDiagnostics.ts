import { useCallback, useState } from 'react'

import {
  daemonStatus,
  getLxmfMessageDeliveryTrace,
  getLxmfOutboundPropagationNode,
  getLxmfProfile,
  listLxmfInterfaces,
  listLxmfMessages,
  listLxmfPropagationNodes,
  probeLxmf,
} from '@lib/lxmf-api'
import type { LxmfMessageRecord } from '@lib/lxmf-payloads'

import type { DeliveryDiagnosticsSnapshot } from '../DeliveryDiagnosticsDrawer'

export interface DeliveryDiagnosticsState {
  diagnosticsOpen: boolean
  hasOpenedDiagnostics: boolean
  diagnosticsLoading: boolean
  diagnosticsError: string | null
  diagnosticsSnapshot: DeliveryDiagnosticsSnapshot | null
  openDiagnostics: () => void
  closeDiagnostics: () => void
  loadDiagnostics: () => Promise<void>
}

export function useDeliveryDiagnostics(): DeliveryDiagnosticsState {
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [hasOpenedDiagnostics, setHasOpenedDiagnostics] = useState(false)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] =
    useState<DeliveryDiagnosticsSnapshot | null>(null)

  const loadDiagnostics = useCallback(async () => {
    try {
      setDiagnosticsLoading(true)
      setDiagnosticsError(null)
      const [status, probe, profile, outboundNode, propagationNodes, interfaces, messages] =
        await Promise.all([
          daemonStatus(),
          probeLxmf(),
          getLxmfProfile().catch(() => null),
          getLxmfOutboundPropagationNode().catch(() => ({ peer: null, meta: null })),
          listLxmfPropagationNodes().catch(() => ({ nodes: [], meta: null })),
          listLxmfInterfaces().catch(() => ({ interfaces: [], meta: null })),
          listLxmfMessages().catch(() => ({ messages: [], meta: null })),
        ])
      const messageCandidates = selectDiagnosticsMessages(messages.messages)
      const traceResults = await Promise.all(
        messageCandidates.map(async message => {
          const trace = await getLxmfMessageDeliveryTrace(message.id).catch(() => null)
          return {
            id: message.id,
            destination: message.destination,
            timestamp: message.timestamp,
            receiptStatus: message.receipt_status,
            transitions: trace?.transitions ?? [],
          }
        })
      )
      setDiagnosticsSnapshot({
        capturedAtMs: Date.now(),
        status,
        probe,
        profile,
        outboundNode,
        propagationNodes,
        interfaces,
        outboundMessages: traceResults,
      })
    } catch (loadError) {
      setDiagnosticsError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setDiagnosticsLoading(false)
    }
  }, [])

  return {
    diagnosticsOpen,
    hasOpenedDiagnostics,
    diagnosticsLoading,
    diagnosticsError,
    diagnosticsSnapshot,
    openDiagnostics: () => {
      setHasOpenedDiagnostics(true)
      setDiagnosticsOpen(true)
    },
    closeDiagnostics: () => {
      setDiagnosticsOpen(false)
    },
    loadDiagnostics,
  }
}

function selectDiagnosticsMessages(messages: LxmfMessageRecord[]): LxmfMessageRecord[] {
  const outbound = messages
    .filter(message => message.direction === 'out')
    .sort((left, right) => right.timestamp - left.timestamp)
  const priority = outbound.filter(message => isActionableStatus(message.receipt_status))
  const selected: LxmfMessageRecord[] = []
  const seen = new Set<string>()
  for (const message of [...priority, ...outbound]) {
    if (seen.has(message.id)) {
      continue
    }
    seen.add(message.id)
    selected.push(message)
    if (selected.length >= 6) {
      break
    }
  }
  return selected
}

function isActionableStatus(status: string | null): boolean {
  if (!status) {
    return true
  }
  const normalized = status.trim().toLowerCase()
  return (
    normalized.startsWith('failed') ||
    normalized.startsWith('retrying') ||
    normalized.startsWith('sending') ||
    normalized.startsWith('queued')
  )
}
