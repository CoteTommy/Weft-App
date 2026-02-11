import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { WelcomePage } from '../features/welcome/pages/WelcomePage'
import { ChatsPage } from '../features/chats/pages/ChatsPage'
import { ChatThreadPage } from '../features/chats/pages/ChatThreadPage'
import { ChatsStateLayout } from '../features/chats/state/ChatsProvider'
import { PeoplePage } from '../features/people/pages/PeoplePage'
import { FilesPage } from '../features/files/pages/FilesPage'
import { SettingsPage } from '../features/settings/pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/chats" replace />} />
        <Route element={<ChatsStateLayout />}>
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/chats/:chatId" element={<ChatThreadPage />} />
        </Route>
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chats" replace />} />
    </Routes>
  )
}
