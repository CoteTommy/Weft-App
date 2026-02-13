import { type ReactNode,useCallback, useEffect, useMemo, useRef, useState } from 'react'

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
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const safeEstimate = Math.max(estimateItemHeight, 1)
  const safeOverscan = Math.max(overscan, 0)

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
    setViewportHeight(node?.clientHeight ?? 0)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const resizeObserver = new ResizeObserver(() => {
      setViewportHeight(node.clientHeight)
    })
    resizeObserver.observe(node)
    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  const visibleCount = Math.max(1, Math.ceil(viewportHeight / safeEstimate))
  const startIndex = Math.max(0, Math.floor(scrollTop / safeEstimate) - safeOverscan)
  const endIndex = Math.min(
    items.length,
    startIndex + visibleCount + safeOverscan * 2,
  )
  const topPadding = startIndex * safeEstimate
  const bottomPadding = Math.max(0, (items.length - endIndex) * safeEstimate)

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [endIndex, items, startIndex],
  )

  return (
    <div
      ref={setContainerRef}
      className={className}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div
        className={listClassName}
        style={{
          paddingTop: `${topPadding}px`,
          paddingBottom: `${bottomPadding}px`,
        }}
      >
        {visibleItems.map((item, index) => {
          const absoluteIndex = startIndex + index
          return <div key={getKey(item, absoluteIndex)}>{renderItem(item, absoluteIndex)}</div>
        })}
      </div>
    </div>
  )
}
