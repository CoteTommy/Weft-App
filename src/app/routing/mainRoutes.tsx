import { lazy, type ReactElement } from 'react'
import { Navigate } from 'react-router-dom'

export type MainRouteContext = {
  commandCenterEnabled: boolean
}

export type MainRouteEntry = {
  path: string
  element: ({ commandCenterEnabled }: MainRouteContext) => ReactElement
}

const ChatsPage = lazy(() =>
  import('@features/chats/pages/ChatsPage').then(module => ({ default: module.ChatsPage }))
)
const ChatThreadPage = lazy(() =>
  import('@features/chats/pages/ChatThreadPage').then(module => ({
    default: module.ChatThreadPage,
  }))
)
const PeoplePage = lazy(() =>
  import('@features/people/pages/PeoplePage').then(module => ({ default: module.PeoplePage }))
)
const MapPage = lazy(() =>
  import('@features/map/pages/MapPage').then(module => ({ default: module.MapPage }))
)
const NetworkPage = lazy(() =>
  import('@features/network/pages/NetworkPage').then(module => ({ default: module.NetworkPage }))
)
const CommandCenterPage = lazy(() =>
  import('@features/command-center/pages/CommandCenterPage').then(module => ({
    default: module.CommandCenterPage,
  }))
)
const InterfacesPage = lazy(() =>
  import('@features/interfaces/pages/InterfacesPage').then(module => ({
    default: module.InterfacesPage,
  }))
)
const AnnouncesPage = lazy(() =>
  import('@features/announces/pages/AnnouncesPage').then(module => ({
    default: module.AnnouncesPage,
  }))
)
const FilesPage = lazy(() =>
  import('@features/files/pages/FilesPage').then(module => ({ default: module.FilesPage }))
)
const SettingsPage = lazy(() =>
  import('@features/settings/pages/SettingsPage').then(module => ({
    default: module.SettingsPage,
  }))
)

export const KNOWN_MAIN_ROUTES = [
  '/chats',
  '/people',
  '/map',
  '/network',
  '/command-center',
  '/interfaces',
  '/announces',
  '/files',
  '/settings',
]

export const FALLBACK_MAIN_ROUTE = '/chats'

export const MAIN_ROUTES: MainRouteEntry[] = [
  {
    path: '/chats',
    element: () => <ChatsPage />,
  },
  {
    path: '/chats/:chatId',
    element: () => <ChatThreadPage />,
  },
  {
    path: '/people',
    element: () => <PeoplePage />,
  },
  {
    path: '/map',
    element: () => <MapPage />,
  },
  {
    path: '/network',
    element: () => <NetworkPage />,
  },
  {
    path: '/command-center',
    element: ({ commandCenterEnabled }) =>
      commandCenterEnabled ? (
        <CommandCenterPage />
      ) : (
        <Navigate to="/settings?section=advanced" replace />
      ),
  },
  {
    path: '/interfaces',
    element: () => <InterfacesPage />,
  },
  {
    path: '/announces',
    element: () => <AnnouncesPage />,
  },
  {
    path: '/files',
    element: () => <FilesPage />,
  },
  {
    path: '/settings',
    element: () => <SettingsPage />,
  },
]

export function sanitizeMainRoute(route: string): string {
  if (!route || !route.startsWith('/')) {
    return FALLBACK_MAIN_ROUTE
  }

  const basePath = route.split('?')[0]
  if (!KNOWN_MAIN_ROUTES.includes(basePath) && !basePath.startsWith('/chats/')) {
    return FALLBACK_MAIN_ROUTE
  }

  return route
}
