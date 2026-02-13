import { type ReactNode, useRef } from 'react'

import { useVirtualizer } from '@tanstack/react-virtual'

interface VirtualizedListProps<T> {
  items: T[]
  estimateItemHeight: number
  overscan?: number
  className?: string
  listClassName?: string
  getKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
}

export function VirtualizedList<T>({
  items,
  estimateItemHeight,
  overscan = 6,
  className,
  listClassName,
  getKey,
  renderItem,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const safeEstimate = Math.max(estimateItemHeight, 1)
  const safeOverscan = Math.max(overscan, 0)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => safeEstimate,
    overscan: safeOverscan,
  })
  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div ref={containerRef} className={className}>
      <div
        className={listClassName}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualItems.map(virtualItem => {
          const item = items[virtualItem.index]
          return (
            <div
              key={getKey(item, virtualItem.index)}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
