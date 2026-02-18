/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react'

import { startLxmfEventPump, subscribeLxmfEvents } from '@lib/lxmf-api'
import type { LxmfRpcEvent } from '@lib/lxmf-payloads'

interface LxmfEventHubContextValue {
  subscribe: (listener: (event: LxmfRpcEvent) => void) => () => void
  getLastEventAtMs: () => number
}

const LxmfEventHubContext = createContext<LxmfEventHubContextValue | undefined>(undefined)

export function LxmfEventHubProvider({ children }: PropsWithChildren) {
  const listenersRef = useRef<Set<(event: LxmfRpcEvent) => void>>(new Set())
  const lastEventAtRef = useRef(0)

  const subscribe = useCallback((listener: (event: LxmfRpcEvent) => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let disposed = false
    const listeners = listenersRef.current

    void startLxmfEventPump().catch(() => {
      // Runtime event stream stays best-effort.
    })

    void subscribeLxmfEvents(event => {
      lastEventAtRef.current = Date.now()
      for (const listener of listeners) {
        listener(event)
      }
    })
      .then(stop => {
        if (disposed) {
          stop()
          return
        }
        unlisten = stop
      })
      .catch(() => {
        // Fallback polling paths still keep screens usable.
      })

    return () => {
      disposed = true
      unlisten?.()
      listeners.clear()
    }
  }, [])

  return (
    <LxmfEventHubContext.Provider
      value={{
        subscribe,
        getLastEventAtMs: () => lastEventAtRef.current,
      }}
    >
      {children}
    </LxmfEventHubContext.Provider>
  )
}

export function useLxmfEventHub(): LxmfEventHubContextValue {
  const value = useContext(LxmfEventHubContext)
  if (!value) {
    throw new Error('useLxmfEventHub must be used within LxmfEventHubProvider')
  }
  return value
}
