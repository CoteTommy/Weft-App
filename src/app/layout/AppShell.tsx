import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { NotificationToasts } from './NotificationToasts'
import { SidebarNav } from './SidebarNav'
import { TopBar } from './TopBar'

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const reduceMotion = useReducedMotion()

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
    <div className="relative h-screen overflow-hidden bg-[var(--app-bg)] text-slate-900 motion-gpu">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] gap-4 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <SidebarNav />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={location.pathname}
              className="min-h-0 flex-1 overflow-hidden"
              initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.995 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.995 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <NotificationToasts />
    </div>
  )
}
