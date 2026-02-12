import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import { TopBar } from './TopBar'

export function AppShell() {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ threadId?: string }>
      const threadId = custom.detail?.threadId?.trim()
      if (!threadId) {
        return
      }
      void navigate(`/chats/${threadId}`)
    }
    window.addEventListener('weft:open-thread', handler as EventListener)
    return () => {
      window.removeEventListener('weft:open-thread', handler as EventListener)
    }
  }, [navigate])

  return (
    <div className="relative h-screen overflow-hidden bg-[var(--app-bg)] text-slate-900">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] gap-4 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <SidebarNav />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
