import { useCallback, useRef, useState } from 'react'

import type { OfflineQueueEntry } from '@features/chats/state/offlineQueue'
import { publishAppNotification } from '@shared/runtime/notifications'
import {
  getLxmfOutboundPropagationNode,
  listLxmfPropagationNodes,
  setLxmfOutboundPropagationNode,
} from '@lib/lxmf-api'

import type { RecoveryEvent } from '../DeliveryDiagnosticsDrawer'

export interface RelayRecoveryState {
  recoveryEvents: RecoveryEvent[]
  appendRecoveryEvent: (entry: Omit<RecoveryEvent, 'id' | 'atMs'>) => void
  attemptRelayRecovery: (manual: boolean) => Promise<void>
}

export function useRelayRecovery(offlineQueue: OfflineQueueEntry[]): RelayRecoveryState {
  const [recoveryEvents, setRecoveryEvents] = useState<RecoveryEvent[]>([])
  const relayRecoveryAtMsRef = useRef(0)

  const appendRecoveryEvent = useCallback((entry: Omit<RecoveryEvent, 'id' | 'atMs'>) => {
    setRecoveryEvents(previous =>
      [
        {
          ...entry,
          id: `${entry.category}:${entry.status}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
          atMs: Date.now(),
        },
        ...previous,
      ].slice(0, 24)
    )
  }, [])

  const attemptRelayRecovery = useCallback(
    async (manual: boolean) => {
      const nowMs = Date.now()
      if (!manual && nowMs - relayRecoveryAtMsRef.current < 60_000) {
        return
      }
      const requiresRelay = offlineQueue.some(
        entry => entry.reasonCode === 'relay_unset' && entry.status !== 'paused'
      )
      if (!manual && !requiresRelay) {
        return
      }
      relayRecoveryAtMsRef.current = nowMs
      try {
        const [outboundNode, propagationNodes] = await Promise.all([
          getLxmfOutboundPropagationNode().catch(() => ({ peer: null, meta: null })),
          listLxmfPropagationNodes().catch(() => ({ nodes: [], meta: null })),
        ])
        if (outboundNode.peer) {
          appendRecoveryEvent({
            category: 'relay',
            status: 'info',
            detail: `Relay already selected (${shortenValue(outboundNode.peer)}).`,
          })
          return
        }
        const candidate = [...propagationNodes.nodes].sort(
          (left, right) => right.last_seen - left.last_seen
        )[0]
        if (!candidate) {
          appendRecoveryEvent({
            category: 'relay',
            status: 'failed',
            detail: 'No propagation nodes available for automatic relay selection.',
          })
          return
        }
        await setLxmfOutboundPropagationNode(candidate.peer)
        appendRecoveryEvent({
          category: 'relay',
          status: 'success',
          detail: `Selected relay ${shortenValue(candidate.peer)} automatically.`,
        })
        publishAppNotification({
          kind: 'system',
          title: 'Relay selected automatically',
          body: `Using ${shortenValue(candidate.peer)} for propagated delivery.`,
        })
      } catch (relayError) {
        appendRecoveryEvent({
          category: 'relay',
          status: 'failed',
          detail: relayError instanceof Error ? relayError.message : String(relayError),
        })
      }
    },
    [appendRecoveryEvent, offlineQueue]
  )

  return {
    recoveryEvents,
    appendRecoveryEvent,
    attemptRelayRecovery,
  }
}

function shortenValue(value: string | null): string {
  if (!value) {
    return '—'
  }
  if (value.length <= 20) {
    return value
  }
  return `${value.slice(0, 10)}...${value.slice(-8)}`
}
