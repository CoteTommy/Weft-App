import { useEffect, useRef } from 'react'
import { Outlet } from 'react-router-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { NotificationToasts } from './NotificationToasts'
import { SidebarNav } from './SidebarNav'
import { TopBar } from './TopBar'

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const pageMotion = useAnimationControls()
  const routeAnimationFrameRef = useRef<number | null>(null)

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

  useEffect(() => {
    if (reduceMotion) {
      return
    }
    if (routeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(routeAnimationFrameRef.current)
    }
    pageMotion.set({
      opacity: 0.97,
    })
    routeAnimationFrameRef.current = window.requestAnimationFrame(() => {
      void pageMotion.start({
        opacity: 1,
        transition: {
          duration: 0.14,
          ease: [0.22, 1, 0.36, 1],
        },
      })
    })
    return () => {
      if (routeAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(routeAnimationFrameRef.current)
        routeAnimationFrameRef.current = null
      }
    }
  }, [location.pathname, pageMotion, reduceMotion])

  return (
    <div className="relative h-screen overflow-hidden bg-[var(--app-bg)] text-slate-900 motion-gpu">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] gap-4 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <SidebarNav />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <motion.div
            className="min-h-0 flex-1 overflow-hidden motion-gpu"
            initial={false}
            animate={reduceMotion ? undefined : pageMotion}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <NotificationToasts />
    </div>
  )
}
