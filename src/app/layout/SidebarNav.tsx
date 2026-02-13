import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  Activity,
  Bell,
  Folder,
  MapPin,
  MessageSquare,
  Route,
  Settings,
  Users,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useChatsState } from '../../features/chats/state/ChatsProvider'
import { getLxmfProfile, probeLxmf } from '../../lib/lxmf-api'
import {
  DISPLAY_NAME_UPDATED_EVENT,
  getStoredDisplayName,
  resolveDisplayName,
  shortHash,
} from '../../shared/utils/identity'

const navItems = [
  { to: '/chats', label: 'Chats', icon: MessageSquare },
  { to: '/people', label: 'People', icon: Users },
  { to: '/map', label: 'Map', icon: MapPin },
  { to: '/network', label: 'Network', icon: Activity },
  { to: '/interfaces', label: 'Interfaces', icon: Route },
  { to: '/announces', label: 'Announces', icon: Bell },
  { to: '/files', label: 'Files', icon: Folder },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function SidebarNav() {
  const { threads } = useChatsState()
  const [displayName, setDisplayName] = useState(() => getStoredDisplayName() ?? 'Loading...')
  const [identityHint, setIdentityHint] = useState<string | null>(null)
  const totalUnread = threads.reduce(
    (sum, thread) => sum + (thread.muted ? 0 : thread.unread),
    0,
  )

  const refreshIdentity = useCallback(async () => {
    try {
      const [probe, profile] = await Promise.all([
        probeLxmf(),
        getLxmfProfile().catch(() => null),
      ])
      setDisplayName(
        resolveDisplayName(probe.profile, probe.rpc.identity_hash, profile?.displayName ?? null),
      )
      const identityHash = probe.rpc.identity_hash?.trim()
      setIdentityHint(identityHash ? shortHash(identityHash, 8) : probe.profile)
    } catch {
      setDisplayName((current) => (current === 'Loading...' ? 'Unknown' : current))
      setIdentityHint(null)
    }
  }, [])

  useEffect(() => {
    const onDisplayNameUpdate = () => {
      void refreshIdentity()
    }
    const timeoutId = window.setTimeout(() => {
      void refreshIdentity()
    }, 0)
    const intervalId = window.setInterval(() => {
      void refreshIdentity()
    }, 20_000)
    window.addEventListener(DISPLAY_NAME_UPDATED_EVENT, onDisplayNameUpdate)

    return () => {
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
      window.removeEventListener(DISPLAY_NAME_UPDATED_EVENT, onDisplayNameUpdate)
    }
  }, [refreshIdentity])

  return (
    <aside className="hidden w-64 shrink-0 rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-[0_16px_50px_-35px_rgba(29,58,113,0.5)] backdrop-blur lg:flex lg:flex-col">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Weft</p>
        <h2 className="mt-2 font-heading text-2xl text-slate-900">Chat</h2>
      </div>

      <nav className="space-y-1.5">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'ui-transition flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium',
                isActive
                  ? 'bg-blue-600 text-white shadow-[0_12px_20px_-16px_rgba(37,99,235,0.9)]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
            {item.to === '/chats' && totalUnread > 0 ? (
              <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-current">
                {totalUnread}
              </span>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-600">Connected as</p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-900">{displayName}</p>
        {identityHint ? <p className="mt-0.5 truncate text-[11px] text-slate-500">{identityHint}</p> : null}
      </div>
    </aside>
  )
}
