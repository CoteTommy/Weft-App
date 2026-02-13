import {
  Activity,
  Bell,
  Command,
  Folder,
  MapPin,
  MessageSquare,
  Route,
  Settings,
  Users,
} from 'lucide-react'
import type { ComponentType, SVGProps } from 'react'

import { isCommandCenterEnabled } from './features'

export const APP_ROUTES = {
  welcome: '/welcome',
  chats: '/chats',
  chatThread: '/chats/:chatId',
  people: '/people',
  map: '/map',
  network: '/network',
  commandCenter: '/command-center',
  interfaces: '/interfaces',
  announces: '/announces',
  files: '/files',
  settings: '/settings',
} as const

export type AppRoute = (typeof APP_ROUTES)[keyof typeof APP_ROUTES]

export const KNOWN_MAIN_ROUTES = [
  APP_ROUTES.chats,
  APP_ROUTES.people,
  APP_ROUTES.map,
  APP_ROUTES.network,
  APP_ROUTES.commandCenter,
  APP_ROUTES.interfaces,
  APP_ROUTES.announces,
  APP_ROUTES.files,
  APP_ROUTES.settings,
] as const

export const FALLBACK_MAIN_ROUTE = APP_ROUTES.chats
export const DEFAULT_MAIN_ROUTE = FALLBACK_MAIN_ROUTE
export const SETTINGS_ADVANCED_ROUTE = `${APP_ROUTES.settings}?section=advanced`
export const SETTINGS_CONNECTIVITY_ROUTE = `${APP_ROUTES.settings}?section=connectivity`

export const MAIN_NAV_ITEMS = [
  { to: APP_ROUTES.chats, label: 'Chats', icon: MessageSquare },
  { to: APP_ROUTES.people, label: 'People', icon: Users },
  { to: APP_ROUTES.map, label: 'Map', icon: MapPin },
  { to: APP_ROUTES.network, label: 'Network', icon: Activity },
  { to: APP_ROUTES.interfaces, label: 'Interfaces', icon: Route },
  { to: APP_ROUTES.announces, label: 'Announces', icon: Bell },
  { to: APP_ROUTES.files, label: 'Files', icon: Folder },
  { to: APP_ROUTES.settings, label: 'Settings', icon: Settings },
] as const

export const COMMAND_CENTER_NAV_ITEM = {
  to: APP_ROUTES.commandCenter,
  label: 'Command Center',
  icon: Command,
} as const

export type NavItem = {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export function getSidebarNavItems(commandCenterEnabled: boolean): NavItem[] {
  if (!isCommandCenterEnabled(commandCenterEnabled)) {
    return [...MAIN_NAV_ITEMS]
  }
  return [...MAIN_NAV_ITEMS.slice(0, 4), COMMAND_CENTER_NAV_ITEM, ...MAIN_NAV_ITEMS.slice(4)]
}

export type RoutePrefetchLoader = () => Promise<unknown>

export const ROUTE_PREFETCHERS: Record<string, RoutePrefetchLoader> = {
  [APP_ROUTES.chats]: () => import('@features/chats/pages/ChatsPage'),
  [APP_ROUTES.chatThread]: () => import('@features/chats/pages/ChatThreadPage'),
  [APP_ROUTES.people]: () => import('@features/people/pages/PeoplePage'),
  [APP_ROUTES.map]: () => import('@features/map/pages/MapPage'),
  [APP_ROUTES.network]: () => import('@features/network/pages/NetworkPage'),
  [APP_ROUTES.interfaces]: () => import('@features/interfaces/pages/InterfacesPage'),
  [APP_ROUTES.announces]: () => import('@features/announces/pages/AnnouncesPage'),
  [APP_ROUTES.files]: () => import('@features/files/pages/FilesPage'),
  [APP_ROUTES.settings]: () => import('@features/settings/pages/SettingsPage'),
  [APP_ROUTES.commandCenter]: () => import('@features/command-center/pages/CommandCenterPage'),
}

export const ROUTES_TO_PREFETCH = [
  APP_ROUTES.chats,
  APP_ROUTES.chatThread,
  APP_ROUTES.people,
  APP_ROUTES.settings,
] as const

export const DEFAULT_MAIN_ROUTE_PREFIXES = KNOWN_MAIN_ROUTES

export function getRoutePrefetchLoader(route: string): RoutePrefetchLoader | undefined {
  return ROUTE_PREFETCHERS[route]
}

export function isCommandCenterRouteEnabled(commandCenterEnabled: boolean): boolean {
  return isCommandCenterEnabled(commandCenterEnabled)
}

export function isMainRouteAllowed(route: string, commandCenterEnabled: boolean): boolean {
  if (route === APP_ROUTES.commandCenter) {
    return isCommandCenterRouteEnabled(commandCenterEnabled)
  }
  return true
}

export function sanitizeMainRoute(route: string): string {
  if (!route || !route.startsWith('/')) {
    return FALLBACK_MAIN_ROUTE
  }

  const basePath = route.split('?')[0]
  if (
    !KNOWN_MAIN_ROUTES.includes(basePath as (typeof KNOWN_MAIN_ROUTES)[number]) &&
    !basePath.startsWith(`${APP_ROUTES.chats}/`)
  ) {
    return FALLBACK_MAIN_ROUTE
  }

  return route
}

export function isRestorableMainRoute(route: string): boolean {
  const normalized = route.trim()
  if (!normalized.startsWith('/')) {
    return false
  }
  return DEFAULT_MAIN_ROUTE_PREFIXES.some(
    prefix =>
      normalized === prefix ||
      normalized.startsWith(`${prefix}/`) ||
      normalized.startsWith(`${prefix}?`)
  )
}
