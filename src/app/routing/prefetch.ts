import { APP_ROUTES, getRoutePrefetchLoader, ROUTES_TO_PREFETCH } from '@app/config/routes'

export function prefetchRouteChunks(commandCenterEnabled: boolean) {
  if (document.visibilityState !== 'visible') {
    return
  }
  if (isHighHeapPressure()) {
    return
  }

  const fallback = () => {
    const prioritizedRoutes = ROUTES_TO_PREFETCH.filter(
      route =>
        route === APP_ROUTES.chats || route === APP_ROUTES.settings || route === APP_ROUTES.people
    )
    for (const route of prioritizedRoutes) {
      const loader = getRoutePrefetchLoader(route)
      if (loader) {
        void loader()
      }
    }

    if (commandCenterEnabled) {
      const loader = getRoutePrefetchLoader(APP_ROUTES.commandCenter)
      if (loader) {
        void loader()
      }
    }
  }

  const idle = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number
    }
  ).requestIdleCallback
  if (typeof idle === 'function') {
    idle(fallback, { timeout: 1500 })
  } else {
    window.setTimeout(fallback, 1200)
  }
}

function isHighHeapPressure(): boolean {
  const withMemory = performance as Performance & {
    memory?: {
      usedJSHeapSize?: number
    }
  }
  const used = withMemory.memory?.usedJSHeapSize
  if (typeof used !== 'number' || !Number.isFinite(used)) {
    return false
  }
  return used > 120 * 1024 * 1024
}
