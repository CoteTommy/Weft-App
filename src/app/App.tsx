import { useEffect, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { WelcomePage } from '../features/welcome/pages/WelcomePage'
import { ChatsPage } from '../features/chats/pages/ChatsPage'
import { ChatThreadPage } from '../features/chats/pages/ChatThreadPage'
import { ChatsStateLayout } from '../features/chats/state/ChatsProvider'
import { PeoplePage } from '../features/people/pages/PeoplePage'
import { FilesPage } from '../features/files/pages/FilesPage'
import { SettingsPage } from '../features/settings/pages/SettingsPage'
import { AnnouncesPage } from '../features/announces/pages/AnnouncesPage'
import { InterfacesPage } from '../features/interfaces/pages/InterfacesPage'
import { NetworkPage } from '../features/network/pages/NetworkPage'
import { MapPage } from '../features/map/pages/MapPage'
import { DeepLinkBridge } from './runtime/DeepLinkBridge'
import { NotificationCenterProvider } from './state/NotificationCenterProvider'
import {
  getWeftPreferences,
  hasCompletedOnboarding,
  PREFERENCES_UPDATED_EVENT,
  type MotionPreference,
} from '../shared/runtime/preferences'

export default function App() {
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => hasCompletedOnboarding())
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(
    () => getWeftPreferences().motionPreference,
  )

  useEffect(() => {
    const handleUpdate = () => {
      setOnboardingCompleted(hasCompletedOnboarding())
      setMotionPreference(getWeftPreferences().motionPreference)
    }
    window.addEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate)
    }
  }, [])

  return (
    <MotionConfig
      reducedMotion={motionPreference === 'off' ? 'always' : 'user'}
      transition={transitionForMotionPreference(motionPreference)}
    >
      <NotificationCenterProvider>
        <DeepLinkBridge onboardingCompleted={onboardingCompleted} />
        <Routes>
          <Route
            path="/welcome"
            element={onboardingCompleted ? <Navigate to="/chats" replace /> : <WelcomePage />}
          />
          <Route
            element={onboardingCompleted ? <ChatsStateLayout /> : <Navigate to="/welcome" replace />}
          >
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/chats" replace />} />
              <Route path="/chats" element={<ChatsPage />} />
              <Route path="/chats/:chatId" element={<ChatThreadPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/network" element={<NetworkPage />} />
              <Route path="/interfaces" element={<InterfacesPage />} />
              <Route path="/announces" element={<AnnouncesPage />} />
              <Route path="/files" element={<FilesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route
            path="*"
            element={<Navigate to={onboardingCompleted ? '/chats' : '/welcome'} replace />}
          />
        </Routes>
      </NotificationCenterProvider>
    </MotionConfig>
  )
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
