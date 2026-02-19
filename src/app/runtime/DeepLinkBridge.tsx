import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { SINGLE_INSTANCE_EVENT } from '@app/config/events'
import { setPendingLaunchRoute } from '@shared/runtime/preferences'
import { buildNewChatHref, parseLxmfContactReference } from '@shared/utils/contactReference'
import { listenTauriEvent } from '@lib/tauri-runtime'

interface DeepLinkBridgeProps {
  onboardingCompleted: boolean
}

type Unlisten = () => void

export function DeepLinkBridge({ onboardingCompleted }: DeepLinkBridgeProps) {
  const navigate = useNavigate()

  useEffect(() => {
    if (typeof window === 'undefined' || !isTauriRuntime()) {
      return
    }

    let unlisten: Unlisten | null = null
    let unlistenSingleInstance: Unlisten | null = null
    let disposed = false
    const routeFromUrls = (urls: string[]) => {
      for (const url of urls) {
        const route = routeFromDeepLink(url)
        if (!route) {
          continue
        }
        if (onboardingCompleted) {
          void navigate(route)
        } else {
          setPendingLaunchRoute(route)
        }
        break
      }
    }

    void (async () => {
      try {
        const deepLink = await import('@tauri-apps/plugin-deep-link')
        const current = await deepLink.getCurrent()
        if (!disposed && current) {
          routeFromUrls(current)
        }
        unlisten = await deepLink.onOpenUrl(urls => {
          routeFromUrls(urls)
        })
        unlistenSingleInstance = await listenTauriEvent<unknown>(SINGLE_INSTANCE_EVENT, event => {
          const urls = extractUrlsFromSingleInstancePayload(event.payload)
          if (urls.length > 0) {
            routeFromUrls(urls)
          }
        })
      } catch {
        // Deep-link support is optional in non-Tauri contexts.
      }
    })()

    return () => {
      disposed = true
      if (unlisten) {
        unlisten()
      }
      if (unlistenSingleInstance) {
        unlistenSingleInstance()
      }
    }
  }, [navigate, onboardingCompleted])

  return null
}

function routeFromDeepLink(url: string): string | null {
  if (!url.toLowerCase().startsWith('lxma://')) {
    return null
  }
  const parsed = parseLxmfContactReference(url)
  if (!parsed.ok) {
    return null
  }
  return buildNewChatHref(parsed.value.destinationHash, readNameHint(url))
}

function readNameHint(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('name') ?? parsed.searchParams.get('n') ?? undefined
  } catch {
    return undefined
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function extractUrlsFromSingleInstancePayload(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return []
  }
  const record = payload as Record<string, unknown>
  const argv = Array.isArray(record.argv) ? record.argv : []
  const urls: string[] = []
  for (const arg of argv) {
    if (typeof arg !== 'string') {
      continue
    }
    const candidate = arg.trim()
    if (!candidate) {
      continue
    }
    if (candidate.toLowerCase().startsWith('lxma://')) {
      urls.push(candidate)
    }
  }
  return urls
}
