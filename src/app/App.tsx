import { lazy, Suspense, useEffect, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ChatsStateLayout } from '../features/chats/state/ChatsProvider'
import { DeepLinkBridge } from './runtime/DeepLinkBridge'
import { NotificationCenterProvider } from './state/NotificationCenterProvider'
import {
  getWeftPreferences,
  hasCompletedOnboarding,
  PREFERENCES_UPDATED_EVENT,
  type MotionPreference,
} from '../shared/runtime/preferences'
import { normalizeMainRoute } from '../shared/runtime/sessionRestore'

const AppShell = lazy(() =>
  import('./layout/AppShell').then((module) => ({ default: module.AppShell })),
)
const WelcomePage = lazy(() =>
  import('../features/welcome/pages/WelcomePage').then((module) => ({ default: module.WelcomePage })),
)
const ChatsPage = lazy(() =>
  import('../features/chats/pages/ChatsPage').then((module) => ({ default: module.ChatsPage })),
)
const ChatThreadPage = lazy(() =>
  import('../features/chats/pages/ChatThreadPage').then((module) => ({ default: module.ChatThreadPage })),
)
const PeoplePage = lazy(() =>
  import('../features/people/pages/PeoplePage').then((module) => ({ default: module.PeoplePage })),
)
const FilesPage = lazy(() =>
  import('../features/files/pages/FilesPage').then((module) => ({ default: module.FilesPage })),
)
const SettingsPage = lazy(() =>
  import('../features/settings/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
)
const AnnouncesPage = lazy(() =>
  import('../features/announces/pages/AnnouncesPage').then((module) => ({ default: module.AnnouncesPage })),
)
const InterfacesPage = lazy(() =>
  import('../features/interfaces/pages/InterfacesPage').then((module) => ({ default: module.InterfacesPage })),
)
const NetworkPage = lazy(() =>
  import('../features/network/pages/NetworkPage').then((module) => ({ default: module.NetworkPage })),
)
const MapPage = lazy(() =>
  import('../features/map/pages/MapPage').then((module) => ({ default: module.MapPage })),
)
const CommandCenterPage = lazy(() =>
  import('../features/command-center/pages/CommandCenterPage').then((module) => ({
    default: module.CommandCenterPage,
  })),
)

const KNOWN_MAIN_ROUTES = [
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

const FALLBACK_MAIN_ROUTE = '/chats'

function prefetchRouteChunks(commandCenterEnabled: boolean) {
  const fallback = () => {
    void import('../features/chats/pages/ChatsPage')
    void import('../features/chats/pages/ChatThreadPage')
    void import('../features/settings/pages/SettingsPage')
    void import('../features/people/pages/PeoplePage')
    if (commandCenterEnabled) {
      void import('../features/command-center/pages/CommandCenterPage')
    }
  }

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
  if (typeof idle === 'function') {
    idle(fallback, { timeout: 1500 })
  } else {
    window.setTimeout(fallback, 1200)
  }
}

export default function App() {
  const initialPreferences = getWeftPreferences()
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => hasCompletedOnboarding())
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(initialPreferences.motionPreference)
  const [commandCenterEnabled, setCommandCenterEnabled] = useState(initialPreferences.commandCenterEnabled)
  const [lastMainRoute, setLastMainRoute] = useState(
    sanitizeMainRoute(normalizeMainRoute(initialPreferences.lastMainRoute)),
  )

  useEffect(() => {
    const handleUpdate = () => {
      const preferences = getWeftPreferences()
      setOnboardingCompleted(hasCompletedOnboarding())
      setMotionPreference(preferences.motionPreference)
      setCommandCenterEnabled(preferences.commandCenterEnabled)
      setLastMainRoute(sanitizeMainRoute(normalizeMainRoute(preferences.lastMainRoute)))
    }
    window.addEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate)
    }
  }, [])

  useEffect(() => {
    prefetchRouteChunks(commandCenterEnabled)
  }, [commandCenterEnabled])

  return (
    <MotionConfig
      reducedMotion={motionPreference === 'off' ? 'always' : 'user'}
      transition={transitionForMotionPreference(motionPreference)}
    >
      <NotificationCenterProvider>
        <DeepLinkBridge onboardingCompleted={onboardingCompleted} />
        <Suspense fallback={<AppRouteFallback />}>
          <Routes>
            <Route
              path="/welcome"
              element={onboardingCompleted ? <Navigate to={lastMainRoute} replace /> : <WelcomePage />}
            />
            <Route
              element={onboardingCompleted ? <ChatsStateLayout /> : <Navigate to="/welcome" replace />}
            >
              <Route element={<AppShell />}>
                <Route index element={<Navigate to={lastMainRoute} replace />} />
                <Route path="/chats" element={<ChatsPage />} />
                <Route path="/chats/:chatId" element={<ChatThreadPage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/network" element={<NetworkPage />} />
                {commandCenterEnabled ? (
                  <Route path="/command-center" element={<CommandCenterPage />} />
                ) : (
                  <Route path="/command-center" element={<Navigate to="/settings?section=advanced" replace />} />
                )}
                <Route path="/interfaces" element={<InterfacesPage />} />
                <Route path="/announces" element={<AnnouncesPage />} />
                <Route path="/files" element={<FilesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route
              path="*"
              element={<Navigate to={onboardingCompleted ? lastMainRoute : '/welcome'} replace />}
            />
          </Routes>
        </Suspense>
      </NotificationCenterProvider>
    </MotionConfig>
  )
}

function AppRouteFallback() {
  return <div className="p-6 text-sm text-zinc-500">Loading...</div>
}

function sanitizeMainRoute(route: string): string {
  if (!route || !route.startsWith('/')) {
    return FALLBACK_MAIN_ROUTE
  }

  const basePath = route.split('?')[0]

  if (!KNOWN_MAIN_ROUTES.includes(basePath) && !basePath.startsWith('/chats/')) {
    return FALLBACK_MAIN_ROUTE
  }

  return route
}

function transitionForMotionPreference(motionPreference: MotionPreference): {
  duration: number
  ease: [number, number, number, number]
} {
  if (motionPreference === 'smooth') {
    return { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
  }
  if (motionPreference === 'off') {
    return { duration: 0, ease: [0.22, 1, 0.36, 1] }
  }
  return { duration: 0.14, ease: [0.22, 1, 0.36, 1] }
}
