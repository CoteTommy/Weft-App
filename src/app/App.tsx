import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { APP_ROUTES } from '@app/config/routes'
import { AppShell } from '@app/layout/AppShell'
import { MAIN_ROUTES, sanitizeMainRoute } from '@app/routing/mainRoutes'
import { prefetchRouteChunks } from '@app/routing/prefetch'
import { DeepLinkBridge } from '@app/runtime/DeepLinkBridge'
import { LxmfEventHubProvider } from '@app/state/LxmfEventHubProvider'
import { NotificationCenterProvider } from '@app/state/NotificationCenterProvider'
import { RuntimeHealthProvider } from '@app/state/RuntimeHealthProvider'
import { ChatsStateLayout } from '@features/chats/state/ChatsProvider'
import {
  getWeftPreferences,
  hasCompletedOnboarding,
  PREFERENCES_UPDATED_EVENT,
} from '@shared/runtime/preferences'
import { normalizeMainRoute } from '@shared/runtime/sessionRestore'

const CHAT_ROUTE_PATHS = new Set<string>([APP_ROUTES.chats, APP_ROUTES.chatThread])

const WelcomePage = lazy(() =>
  import('@features/welcome/pages/WelcomePage').then(module => ({ default: module.WelcomePage }))
)

export default function App() {
  const initialPreferences = getWeftPreferences()
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => hasCompletedOnboarding())
  const [commandCenterEnabled, setCommandCenterEnabled] = useState(
    initialPreferences.commandCenterEnabled
  )
  const [lastMainRoute, setLastMainRoute] = useState(
    sanitizeMainRoute(normalizeMainRoute(initialPreferences.lastMainRoute))
  )
  const chatRoutes = MAIN_ROUTES.filter(route => CHAT_ROUTE_PATHS.has(route.path))
  const nonChatRoutes = MAIN_ROUTES.filter(route => !CHAT_ROUTE_PATHS.has(route.path))

  useEffect(() => {
    const handleUpdate = () => {
      const preferences = getWeftPreferences()
      setOnboardingCompleted(hasCompletedOnboarding())
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
    <LxmfEventHubProvider>
      <RuntimeHealthProvider>
        <NotificationCenterProvider>
          <DeepLinkBridge onboardingCompleted={onboardingCompleted} />
          <Suspense fallback={<AppRouteFallback />}>
            <Routes>
              <Route
                path={APP_ROUTES.welcome}
                element={
                  onboardingCompleted ? <Navigate to={lastMainRoute} replace /> : <WelcomePage />
                }
              />
              <Route
                element={
                  onboardingCompleted ? (
                    <ChatsStateLayout />
                  ) : (
                    <Navigate to={APP_ROUTES.welcome} replace />
                  )
                }
              >
                <Route element={<AppShell />}>
                  {chatRoutes.map(route => (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={route.element({ commandCenterEnabled })}
                    />
                  ))}
                </Route>
              </Route>
              <Route
                element={
                  onboardingCompleted ? <AppShell /> : <Navigate to={APP_ROUTES.welcome} replace />
                }
              >
                <Route index element={<Navigate to={lastMainRoute} replace />} />
                {nonChatRoutes.map(route => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={route.element({ commandCenterEnabled })}
                  />
                ))}
              </Route>
              <Route
                path="*"
                element={
                  <Navigate to={onboardingCompleted ? lastMainRoute : APP_ROUTES.welcome} replace />
                }
              />
            </Routes>
          </Suspense>
        </NotificationCenterProvider>
      </RuntimeHealthProvider>
    </LxmfEventHubProvider>
  )
}

function AppRouteFallback() {
  return <div className="p-6 text-sm text-zinc-500">Loading...</div>
}
