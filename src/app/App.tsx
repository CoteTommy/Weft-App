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
  hasCompletedOnboarding,
  PREFERENCES_UPDATED_EVENT,
} from '../shared/runtime/preferences'

export default function App() {
  const [onboardingCompleted, setOnboardingCompleted] = useState(() => hasCompletedOnboarding())

  useEffect(() => {
    const handleUpdate = () => {
      setOnboardingCompleted(hasCompletedOnboarding())
    }
    window.addEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, handleUpdate)
    }
  }, [])

  return (
    <MotionConfig transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
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
