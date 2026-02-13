import { lazy, type ReactElement } from 'react'
import { Navigate } from 'react-router-dom'

/* eslint-disable react-refresh/only-export-components */
import {
  APP_ROUTES,
  FALLBACK_MAIN_ROUTE,
  isMainRouteAllowed,
  KNOWN_MAIN_ROUTES,
  sanitizeMainRoute,
  SETTINGS_ADVANCED_ROUTE,
} from '@app/config/routes'

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

export const MAIN_ROUTES: MainRouteEntry[] = [
  {
    path: APP_ROUTES.chats,
    element: () => <ChatsPage />,
  },
  {
    path: APP_ROUTES.chatThread,
    element: () => <ChatThreadPage />,
  },
  {
    path: APP_ROUTES.people,
    element: () => <PeoplePage />,
  },
  {
    path: APP_ROUTES.map,
    element: () => <MapPage />,
  },
  {
    path: APP_ROUTES.network,
    element: () => <NetworkPage />,
  },
  {
    path: APP_ROUTES.commandCenter,
    element: ({ commandCenterEnabled }) => {
      if (isMainRouteAllowed(APP_ROUTES.commandCenter, commandCenterEnabled)) {
        return <CommandCenterPage />
      }
      return <Navigate to={SETTINGS_ADVANCED_ROUTE} replace />
    },
  },
  {
    path: APP_ROUTES.interfaces,
    element: () => <InterfacesPage />,
  },
  {
    path: APP_ROUTES.announces,
    element: () => <AnnouncesPage />,
  },
  {
    path: APP_ROUTES.files,
    element: () => <FilesPage />,
  },
  {
    path: APP_ROUTES.settings,
    element: () => <SettingsPage />,
  },
]

export { FALLBACK_MAIN_ROUTE, KNOWN_MAIN_ROUTES, sanitizeMainRoute }
