import clsx from 'clsx'

interface ListSkeletonProps {
  rows?: number
  className?: string
  rowClassName?: string
}

export function ListSkeleton({ rows = 6, className, rowClassName }: ListSkeletonProps) {
  const count = Number.isFinite(rows) ? Math.max(1, Math.floor(rows)) : 6
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={clsx(
            'h-16 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/80',
            rowClassName
          )}
        />
      ))}
    </div>
  )
}
