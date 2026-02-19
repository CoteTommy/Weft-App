import { useCallback, useLayoutEffect, useRef } from 'react'

import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'

import type { ChatMessage } from '@shared/types/chat'

import { formatBytes, renderStatus } from '../messageTimelineFormatting'

type VirtualMessageListProps = {
  messages: ChatMessage[]
  className?: string
  stickToBottom: boolean
  onStickToBottomChange: (value: boolean) => void
  canLoadOlder?: boolean
  loadingOlder?: boolean
  onReachStart?: () => void
  onStartHold: (message: ChatMessage) => void
  onClearHoldTimer: () => void
  onOpenDetails: (message: ChatMessage) => void
}

export function VirtualMessageList({
  messages,
  className,
  stickToBottom,
  onStickToBottomChange,
  canLoadOlder = false,
  loadingOlder = false,
  onReachStart,
  onStartHold,
  onClearHoldTimer,
  onOpenDetails,
}: VirtualMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const estimatedMessageHeight = 118
  const overscan = 8
  const latestMessageId = messages[messages.length - 1]?.id ?? null
  const startReachCooldownRef = useRef(0)
  const prependAnchorRef = useRef<{
    totalSize: number
    scrollTop: number
    itemCount: number
  } | null>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimatedMessageHeight,
    overscan,
  })
  const virtualItems = virtualizer.getVirtualItems()

  const setTimelineContainerRef = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node
  }, [])

  useLayoutEffect(() => {
    if (!stickToBottom || messages.length === 0) {
      return
    }
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
  }, [latestMessageId, messages.length, stickToBottom, virtualizer])

  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current
    const node = scrollContainerRef.current
    if (!anchor || !node) {
      return
    }
    if (messages.length > anchor.itemCount) {
      const delta = virtualizer.getTotalSize() - anchor.totalSize
      node.scrollTop = Math.max(anchor.scrollTop + delta, 0)
      prependAnchorRef.current = null
      return
    }
    if (!loadingOlder) {
      prependAnchorRef.current = null
    }
  }, [loadingOlder, messages.length, virtualizer])

  return (
    <div
      ref={setTimelineContainerRef}
      data-weft-message-scroll-container="true"
      onScroll={event => {
        const node = event.currentTarget
        onStickToBottomChange(node.scrollHeight - node.clientHeight - node.scrollTop <= 96)
        if (!onReachStart || !canLoadOlder || loadingOlder) {
          return
        }
        if (node.scrollTop > 120) {
          return
        }
        const now = Date.now()
        if (now - startReachCooldownRef.current < 600) {
          return
        }
        startReachCooldownRef.current = now
        prependAnchorRef.current = {
          totalSize: virtualizer.getTotalSize(),
          scrollTop: node.scrollTop,
          itemCount: messages.length,
        }
        onReachStart()
      }}
      className={clsx('min-h-0 overflow-y-auto', className)}
    >
      <div
        className="relative"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualItems.map(virtualItem => {
          const message = messages[virtualItem.index]
          if (!message) {
            return null
          }
          return (
            <div
              key={message.id}
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
              <article
                className={clsx(
                  'flex pb-3',
                  message.sender === 'self' ? 'justify-end' : 'justify-start'
                )}
              >
                <button
                  type="button"
                  onPointerDown={() => onStartHold(message)}
                  onPointerUp={onClearHoldTimer}
                  onPointerCancel={onClearHoldTimer}
                  onPointerLeave={onClearHoldTimer}
                  onClick={() => onOpenDetails(message)}
                  className={clsx(
                    'max-w-[80%] rounded-2xl px-4 py-3 text-left transition focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:outline-none',
                    message.sender === 'self'
                      ? 'bg-blue-600 text-white hover:bg-blue-500'
                      : 'border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <p className="text-sm leading-relaxed">{message.body}</p>
                  {message.attachments.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {message.attachments.map((attachment, index) => (
                        <p
                          key={`${attachment.name}:${index}`}
                          className="truncate text-[11px] font-semibold opacity-80"
                        >
                          Attachment: {attachment.name} ({formatBytes(attachment.sizeBytes)})
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {message.paper ? (
                    <p className="mt-2 text-[11px] font-semibold opacity-80">
                      Paper note{message.paper.title ? `: ${message.paper.title}` : ''}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-end gap-2 text-[11px] opacity-75">
                    <span>{message.sentAt}</span>
                    {message.sender === 'self' && message.status ? (
                      <span>{renderStatus(message.status)}</span>
                    ) : null}
                  </div>
                </button>
              </article>
            </div>
          )
        })}
      </div>
    </div>
  )
}
