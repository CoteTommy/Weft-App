import { Outlet } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div className="relative min-h-screen bg-[var(--app-bg)] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] gap-4 px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
        <SidebarNav />
        <main className="min-w-0 flex-1">
          <TopBar />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
