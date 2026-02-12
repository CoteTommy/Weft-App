import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildNewChatHref, parseLxmfContactReference } from '../../shared/utils/contactReference'
import { setPendingLaunchRoute } from '../../shared/runtime/preferences'

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
        unlisten = await deepLink.onOpenUrl((urls) => {
          routeFromUrls(urls)
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
