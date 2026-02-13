import {
  DEFAULT_MAIN_ROUTE,
  isRestorableMainRoute,
  sanitizeMainRoute as sanitizeMainRouteInternal,
} from '@app/config/routes'

export { DEFAULT_MAIN_ROUTE, isRestorableMainRoute }

export function normalizeMainRoute(route?: string | null): string {
  return sanitizeMainRouteInternal(route ?? DEFAULT_MAIN_ROUTE)
}
