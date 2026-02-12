import type { PropsWithChildren } from 'react'

interface PanelProps extends PropsWithChildren {
  className?: string
}

export function Panel({ children, className }: PanelProps) {
  return (
    <section
      className={`rounded-3xl border border-slate-200/70 bg-white/85 p-4 shadow-[0_18px_60px_-40px_rgba(22,45,83,0.35)] backdrop-blur ${className ?? ''}`}
    >
      {children}
    </section>
  )
}
