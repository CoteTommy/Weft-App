import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { MotionConfig } from 'framer-motion'

import { APP_ROUTES } from '@app/config/routes'
import { AppShell } from '@app/layout/AppShell'
import { MAIN_ROUTES, sanitizeMainRoute } from '@app/routing/mainRoutes'
import { prefetchRouteChunks } from '@app/routing/prefetch'
import { DeepLinkBridge } from '@app/runtime/DeepLinkBridge'
import { transitionForMotionPreference } from '@app/runtime/motion'
import { NotificationCenterProvider } from '@app/state/NotificationCenterProvider'
import { RuntimeHealthProvider } from '@app/state/RuntimeHealthProvider'
import { ChatsStateLayout } from '@features/chats/state/ChatsProvider'
import {
  getWeftPreferences,
  hasCompletedOnboarding,
  type MotionPreference,
  PREFERENCES_UPDATED_EVENT,
} from '@shared/runtime/preferences'
import { normalizeMainRoute } from '@shared/runtime/sessionRestore'

const WelcomePage = lazy(() =>
  import('@features/welcome/pages/WelcomePage').then(module => ({ default: module.WelcomePage }))
)

export default function App() {
  const initialPreferences = getWeftPreferences()
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => hasCompletedOnboarding())
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(
    initialPreferences.motionPreference
  )
  const [commandCenterEnabled, setCommandCenterEnabled] = useState(
    initialPreferences.commandCenterEnabled
  )
  const [lastMainRoute, setLastMainRoute] = useState(
    sanitizeMainRoute(normalizeMainRoute(initialPreferences.lastMainRoute))
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
                  <Route index element={<Navigate to={lastMainRoute} replace />} />
                  {MAIN_ROUTES.map(route => (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={route.element({ commandCenterEnabled })}
                    />
                  ))}
                </Route>
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
    </MotionConfig>
  )
}

function AppRouteFallback() {
  return <div className="p-6 text-sm text-zinc-500">Loading...</div>
}
