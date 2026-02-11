import clsx from 'clsx'
import { MessageSquare, Users, Folder, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/chats', label: 'Chats', icon: MessageSquare },
  { to: '/people', label: 'People', icon: Users },
  { to: '/files', label: 'Files', icon: Folder },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function SidebarNav() {
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
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-blue-600 text-white shadow-[0_12px_20px_-16px_rgba(37,99,235,0.9)]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-600">Connected as</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">You</p>
      </div>
    </aside>
  )
}
