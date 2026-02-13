import { APP_ROUTES, getRoutePrefetchLoader, ROUTES_TO_PREFETCH } from '@app/config/routes'

export function prefetchRouteChunks(commandCenterEnabled: boolean) {
  const fallback = () => {
    for (const route of ROUTES_TO_PREFETCH) {
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

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback
  if (typeof idle === 'function') {
    idle(fallback, { timeout: 1500 })
  } else {
    window.setTimeout(fallback, 1200)
  }
}
