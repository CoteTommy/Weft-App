import type { ReactNode } from 'react'

interface PageHeadingProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeading({ title, subtitle, action }: PageHeadingProps) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  )
}
