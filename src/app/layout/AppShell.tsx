import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'

import {
  getWeftPreferences,
  type MotionPreference,
  PREFERENCES_UPDATED_EVENT,
  updateWeftPreferences,
} from '@shared/runtime/preferences'
import { isRestorableMainRoute } from '@shared/runtime/sessionRestore'
import { FOCUS_NEW_CHAT_EVENT } from '@shared/runtime/shortcuts'
import {
  getDesktopShellPreferences,
  setDesktopShellPreferences,
  subscribeTrayActions,
} from '@lib/desktop-shell-api'
import { OPEN_THREAD_EVENT } from '@app/config/events'
import { APP_ROUTES } from '@app/config/routes'

import { CommandPalette } from './CommandPalette'
import { NotificationToasts } from './NotificationToasts'
import { PerformanceHud } from './PerformanceHud'
import { SidebarNav } from './SidebarNav'
import { TopBar } from './TopBar'

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const pageMotion = useAnimationControls()
  const routeAnimationFrameRef = useRef<number | null>(null)
  const lastPersistedRouteRef = useRef<string>(
    getWeftPreferences().lastMainRoute ?? APP_ROUTES.chats
  )
  const desktopMuteSyncRef = useRef<boolean | null>(null)
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(
    () => getWeftPreferences().motionPreference
  )

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ threadId?: string }>
      const threadId = custom.detail?.threadId?.trim()
      if (!threadId) {
        return
      }
      void navigate(`${APP_ROUTES.chats}/${threadId}`)
    }
    window.addEventListener(OPEN_THREAD_EVENT, handler as EventListener)
    return () => {
      window.removeEventListener(OPEN_THREAD_EVENT, handler as EventListener)
    }
  }, [navigate])

  useEffect(() => {
    const syncPreferences = () => {
      setMotionPreference(getWeftPreferences().motionPreference)
    }
    window.addEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences)
    }
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      pageMotion.set({ opacity: 1 })
      return
    }
    if (motionPreference === 'off') {
      pageMotion.set({ opacity: 1 })
      return
    }
    if (routeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(routeAnimationFrameRef.current)
    }
    pageMotion.set({
      opacity: motionPreference === 'smooth' ? 0.955 : 0.975,
    })
    routeAnimationFrameRef.current = window.requestAnimationFrame(() => {
      void pageMotion.start({
        opacity: 1,
        transition: {
          duration: motionPreference === 'smooth' ? 0.2 : 0.12,
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
  }, [location.pathname, motionPreference, pageMotion, reduceMotion])

  useEffect(() => {
    const route = `${location.pathname}${location.search}`.trim()
    if (!isRestorableMainRoute(route)) {
      return
    }
    if (lastPersistedRouteRef.current === route) {
      return
    }
    lastPersistedRouteRef.current = route
    updateWeftPreferences({
      lastMainRoute: route,
    })
  }, [location.pathname, location.search])

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return
    }
    let unlisten: (() => void) | null = null
    let disposed = false
    void subscribeTrayActions(event => {
      if (event.action === 'new_message') {
        void navigate(APP_ROUTES.chats)
        window.setTimeout(() => {
          window.dispatchEvent(new Event(FOCUS_NEW_CHAT_EVENT))
        }, 110)
        return
      }
      if (event.action === 'notifications_muted' && typeof event.muted === 'boolean') {
        const nextNotificationsEnabled = !event.muted
        desktopMuteSyncRef.current = event.muted
        if (getWeftPreferences().notificationsEnabled !== nextNotificationsEnabled) {
          updateWeftPreferences({
            notificationsEnabled: nextNotificationsEnabled,
          })
        }
      }
    })
      .then(stop => {
        if (disposed) {
          stop()
          return
        }
        unlisten = stop
      })
      .catch(() => {
        // No-op in non-Tauri preview contexts.
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [navigate])

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return
    }
    const applyPlatformAndAppearance = (platform: string, appearance: string) => {
      document.documentElement.dataset.weftPlatform = platform
      document.documentElement.dataset.systemAppearance = appearance
    }

    let media: MediaQueryList | null = null
    const onMediaChange = (event: MediaQueryListEvent) => {
      const appearance = event.matches ? 'dark' : 'light'
      document.documentElement.dataset.systemAppearance = appearance
    }

    media = window.matchMedia('(prefers-color-scheme: dark)')
    const fallbackAppearance = media.matches ? 'dark' : 'light'
    applyPlatformAndAppearance('unknown', fallbackAppearance)
    void getDesktopShellPreferences()
      .then(prefs => {
        applyPlatformAndAppearance(prefs.platform, prefs.appearance)
      })
      .catch(() => {
        applyPlatformAndAppearance('unknown', fallbackAppearance)
      })

    document.documentElement.dataset.prefersColorScheme = fallbackAppearance
    media.addEventListener('change', onMediaChange)

    return () => {
      media?.removeEventListener('change', onMediaChange)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      return
    }
    const syncDesktopMuteState = () => {
      const preferences = getWeftPreferences()
      const muted = !preferences.notificationsEnabled
      if (desktopMuteSyncRef.current === muted) {
        return
      }
      desktopMuteSyncRef.current = muted
      void setDesktopShellPreferences({
        notificationsMuted: muted,
      }).catch(() => {
        desktopMuteSyncRef.current = null
        // Ignore sync failures; tray toggle still works.
      })
    }
    syncDesktopMuteState()
    window.addEventListener(PREFERENCES_UPDATED_EVENT, syncDesktopMuteState)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, syncDesktopMuteState)
    }
  }, [])

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
      <PerformanceHud />
      <CommandPalette />
      <NotificationToasts />
    </div>
  )
}
