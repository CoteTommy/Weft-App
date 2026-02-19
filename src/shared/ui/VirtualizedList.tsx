import { type ReactNode, useEffect, useRef } from 'react'

import { useVirtualizer } from '@tanstack/react-virtual'

interface VirtualizedListProps<T> {
  items: T[]
  estimateItemHeight: number
  overscan?: number
  endReachedOffset?: number
  canLoadMore?: boolean
  loadingMore?: boolean
  onEndReached?: () => void
  className?: string
  listClassName?: string
  getKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
}

export function VirtualizedList<T>({
  items,
  estimateItemHeight,
  overscan = 6,
  endReachedOffset = 2,
  canLoadMore = false,
  loadingMore = false,
  onEndReached,
  className,
  listClassName,
  getKey,
  renderItem,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const safeEstimate = Math.max(estimateItemHeight, 1)
  const safeOverscan = Math.max(overscan, 0)
  const safeEndReachedOffset = Math.max(endReachedOffset, 0)
  const endReachCooldownRef = useRef(0)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => safeEstimate,
    overscan: safeOverscan,
  })
  const virtualItems = virtualizer.getVirtualItems()

  useEffect(() => {
    if (!onEndReached || !canLoadMore || loadingMore || items.length === 0) {
      return
    }
    const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? -1
    const triggerIndex = Math.max(items.length - 1 - safeEndReachedOffset, 0)
    if (lastVisibleIndex < triggerIndex) {
      return
    }
    const now = Date.now()
    if (now - endReachCooldownRef.current < 600) {
      return
    }
    endReachCooldownRef.current = now
    onEndReached()
  }, [canLoadMore, items.length, loadingMore, onEndReached, safeEndReachedOffset, virtualItems])

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
