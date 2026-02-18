import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'

import { APP_ROUTES } from '@app/config/routes'
import type { ChatMessage } from '@shared/types/chat'
import { getLxmfMessageDeliveryTrace, lxmfGetAttachmentBlob } from '@lib/lxmf-api'

interface MessageTimelineProps {
  messages: ChatMessage[]
  className?: string
  onRetry?: (message: ChatMessage) => Promise<void> | void
}

export function MessageTimeline({ messages, className, onRetry }: MessageTimelineProps) {
  const navigate = useNavigate()
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [fetchedDeliveryTrace, setFetchedDeliveryTrace] = useState<
    NonNullable<ChatMessage['deliveryTrace']>
  >([])
  const [deliveryTraceLoading, setDeliveryTraceLoading] = useState(false)
  const holdTimeoutRef = useRef<number | null>(null)
  const holdTriggeredRef = useRef(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const detailsDialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const attachmentPayloadCacheRef = useRef<Map<string, string>>(new Map())
  const [stickToBottom, setStickToBottom] = useState(true)
  const estimatedMessageHeight = 118
  const overscan = 8
  const selectedMessage = useMemo(
    () => messages.find(message => message.id === selectedMessageId) ?? null,
    [messages, selectedMessageId]
  )
  const deliveryTrace = useMemo(() => {
    if (!selectedMessage) {
      return []
    }
    const fromMessage = selectedMessage.deliveryTrace ?? []
    if (fromMessage.length > 0) {
      return fromMessage
    }
    if (selectedMessage.sender !== 'self') {
      return []
    }
    return fetchedDeliveryTrace
  }, [fetchedDeliveryTrace, selectedMessage])
  const selectedReasonCode = useMemo(() => {
    if (!selectedMessage) {
      return undefined
    }
    if (selectedMessage.statusReasonCode) {
      return selectedMessage.statusReasonCode
    }
    for (let index = deliveryTrace.length - 1; index >= 0; index -= 1) {
      const value = deliveryTrace[index]?.reasonCode
      if (value) {
        return value
      }
    }
    return undefined
  }, [deliveryTrace, selectedMessage])
  const failureGuidance = useMemo(
    () => buildFailureGuidance(selectedReasonCode),
    [selectedReasonCode]
  )
  const latestMessageId = messages[messages.length - 1]?.id ?? null
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

  const closeModal = useCallback(() => {
    setSelectedMessageId(null)
    setCopyFeedback(null)
  }, [])

  const clearHoldTimer = () => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }
  }

  const startHold = (message: ChatMessage) => {
    holdTriggeredRef.current = false
    clearHoldTimer()
    holdTimeoutRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = true
      setSelectedMessageId(message.id)
      setCopyFeedback(null)
    }, 420)
  }

  const openDetails = (message: ChatMessage) => {
    if (holdTriggeredRef.current) {
      holdTriggeredRef.current = false
      return
    }
    setSelectedMessageId(message.id)
    setCopyFeedback(null)
  }

  useEffect(
    () => () => {
      if (holdTimeoutRef.current !== null) {
        window.clearTimeout(holdTimeoutRef.current)
      }
    },
    []
  )

  useEffect(() => {
    if (!selectedMessage) {
      return
    }
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeModal()
        return
      }
      if (event.key !== 'Tab') {
        return
      }
      const root = detailsDialogRef.current
      if (!root) {
        return
      }
      const focusable = getFocusableElements(root)
      if (focusable.length === 0) {
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }
      if (active === last || !root.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeModal, selectedMessage])

  useEffect(() => {
    if (!selectedMessage) {
      return
    }
    const fromMessage = selectedMessage.deliveryTrace ?? []
    if (fromMessage.length > 0) {
      return
    }
    if (selectedMessage.sender !== 'self') {
      return
    }
    let disposed = false
    queueMicrotask(() => {
      if (!disposed) {
        setFetchedDeliveryTrace([])
        setDeliveryTraceLoading(true)
      }
    })
    void getLxmfMessageDeliveryTrace(selectedMessage.id)
      .then(trace => {
        if (disposed) {
          return
        }
        setFetchedDeliveryTrace(
          trace.transitions.map(entry => ({
            status: entry.status,
            timestamp: entry.timestamp,
            reasonCode: entry.reason_code,
          }))
        )
      })
      .catch(() => {
        if (!disposed) {
          setFetchedDeliveryTrace([])
        }
      })
      .finally(() => {
        if (!disposed) {
          setDeliveryTraceLoading(false)
        }
      })
    return () => {
      disposed = true
    }
  }, [selectedMessage])

  useLayoutEffect(() => {
    if (!stickToBottom || messages.length === 0) {
      return
    }
    virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
  }, [latestMessageId, messages.length, stickToBottom, virtualizer])

  const withAttachmentBlob = useCallback(
    async (
      messageId: string,
      attachment: ChatMessage['attachments'][number],
      action: (value: ChatMessage['attachments'][number]) => void
    ) => {
      let dataBase64 = attachment.dataBase64
      const cacheKey = `${messageId}:${attachment.name}`

      if (!dataBase64) {
        const cached = attachmentPayloadCacheRef.current.get(cacheKey)
        if (cached) {
          dataBase64 = cached
        }
      }

      if (!dataBase64) {
        try {
          const blob = await lxmfGetAttachmentBlob(messageId, attachment.name)
          dataBase64 = blob.dataBase64
        } catch (blobError) {
          setCopyFeedback(blobError instanceof Error ? blobError.message : String(blobError))
          return
        }
      }

      if (!dataBase64) {
        setCopyFeedback('Attachment payload unavailable.')
        return
      }

      attachmentPayloadCacheRef.current.set(cacheKey, dataBase64)

      action({
        ...attachment,
        dataBase64,
      })
    },
    []
  )

  return (
    <>
      <div
        ref={setTimelineContainerRef}
        data-weft-message-scroll-container="true"
        onScroll={event => {
          const node = event.currentTarget
          setStickToBottom(node.scrollHeight - node.clientHeight - node.scrollTop <= 96)
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
                    onPointerDown={() => startHold(message)}
                    onPointerUp={clearHoldTimer}
                    onPointerCancel={clearHoldTimer}
                    onPointerLeave={clearHoldTimer}
                    onClick={() => openDetails(message)}
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

      {selectedMessage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          onClick={closeModal}
        >
          <div
            ref={detailsDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-details-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="message-details-title" className="text-base font-semibold text-slate-900">
                Message details
              </h3>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm break-words whitespace-pre-wrap text-slate-800">
                {selectedMessage.body}
              </p>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600">
              <DetailRow label="Author" value={selectedMessage.author} />
              <DetailRow
                label="Direction"
                value={selectedMessage.sender === 'self' ? 'Outgoing' : 'Incoming'}
              />
              <DetailRow label="Time" value={selectedMessage.sentAt} />
              <DetailRow
                label="Status"
                value={selectedMessage.status ? renderStatus(selectedMessage.status) : '—'}
              />
              <DetailRow label="Backend status" value={selectedMessage.statusDetail ?? '—'} />
              <DetailRow label="Reason code" value={selectedMessage.statusReasonCode ?? '—'} />
              <DetailRow
                label="Delivery trace"
                value={
                  deliveryTraceLoading ? 'Loading...' : `${deliveryTrace.length} transition(s)`
                }
              />
              <DetailRow label="Attachments" value={String(selectedMessage.attachments.length)} />
              <DetailRow label="Paper" value={selectedMessage.paper ? 'Yes' : 'No'} />
              <DetailRow label="Message ID" value={selectedMessage.id} mono />
              <DetailRow label="Length" value={`${selectedMessage.body.length} chars`} />
            </div>

            {selectedMessage.paper ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-slate-700">
                <p className="font-semibold text-amber-800">Paper metadata</p>
                <p className="mt-1">Title: {selectedMessage.paper.title ?? '—'}</p>
                <p>Category: {selectedMessage.paper.category ?? '—'}</p>
              </div>
            ) : null}

            {selectedMessage.attachments.length > 0 ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">Attachments</p>
                <ul className="space-y-2">
                  {selectedMessage.attachments.map((attachment, index) => (
                    <li
                      key={`${attachment.name}:${index}`}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                    >
                      <p className="text-xs font-semibold text-slate-800">{attachment.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {formatBytes(attachment.sizeBytes)}
                        {attachment.mime ? ` • ${attachment.mime}` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            void withAttachmentBlob(selectedMessage.id, attachment, loaded => {
                              openAttachment(loaded)
                            })
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void withAttachmentBlob(selectedMessage.id, attachment, loaded => {
                              saveAttachment(loaded)
                            })
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          Save
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {deliveryTrace.length > 0 ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-700">Delivery trace</p>
                <ul className="space-y-1.5">
                  {deliveryTrace.map((entry, index) => (
                    <li
                      key={`${entry.status}:${entry.timestamp}:${index}`}
                      className="text-[11px] text-slate-600"
                    >
                      <span className="font-semibold text-slate-700">{entry.status}</span>{' '}
                      <span>({formatTraceTimestamp(entry.timestamp)})</span>
                      {entry.reasonCode ? (
                        <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                          {entry.reasonCode}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {selectedMessage.sender === 'self' &&
            selectedMessage.status === 'failed' &&
            failureGuidance
              ? // Local narrowing is required so navigate only receives a guaranteed path.
                (() => {
                  const actionPath = failureGuidance.actionPath

                  return (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <p className="font-semibold">{failureGuidance.title}</p>
                      <p className="mt-1">{failureGuidance.body}</p>
                      {actionPath ? (
                        <button
                          type="button"
                          onClick={() => {
                            void navigate(actionPath)
                            closeModal()
                          }}
                          className="mt-2 rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 transition hover:bg-amber-100"
                        >
                          {failureGuidance.actionLabel}
                        </button>
                      ) : null}
                    </div>
                  )
                })()
              : null}

            <div className="mt-3 flex items-center gap-2">
              {selectedMessage.sender === 'self' && selectedMessage.status === 'failed' ? (
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      try {
                        await onRetry?.(selectedMessage)
                        setCopyFeedback('Retry queued.')
                      } catch (retryError) {
                        setCopyFeedback(
                          retryError instanceof Error ? retryError.message : String(retryError)
                        )
                      }
                    })()
                  }}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                >
                  Retry send
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(selectedMessage.body)
                  setCopyFeedback('Message copied.')
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Copy message
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(selectedMessage.id)
                  setCopyFeedback('Message ID copied.')
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Copy ID
              </button>
            </div>
            {copyFeedback ? <p className="mt-2 text-xs text-slate-500">{copyFeedback}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

interface DetailRowProps {
  label: string
  value: string
  mono?: boolean
}

function DetailRow({ label, value, mono = false }: DetailRowProps) {
  return (
    <p>
      <span className="font-semibold text-slate-700">{label}:</span>{' '}
      <span className={clsx(mono ? 'font-mono text-[11px] break-all' : '')}>{value}</span>
    </p>
  )
}

function renderStatus(status: ChatMessage['status']): string {
  switch (status) {
    case 'sending':
      return 'Sending'
    case 'sent':
      return 'Sent'
    case 'delivered':
      return 'Delivered'
    case 'failed':
      return 'Failed'
    default:
      return ''
  }
}

function buildFailureGuidance(reasonCode: string | undefined): {
  title: string
  body: string
  actionLabel?: string
  actionPath?: string
} | null {
  if (!reasonCode) {
    return {
      title: 'Delivery failed',
      body: 'Retry now or keep Weft online while routes and announcements converge.',
    }
  }
  if (reasonCode === 'relay_unset') {
    return {
      title: 'No relay selected',
      body: 'This message requires propagated delivery. Select an outbound propagation relay first.',
      actionLabel: 'Open settings',
      actionPath: APP_ROUTES.settings,
    }
  }
  if (reasonCode === 'no_path') {
    return {
      title: 'No route to destination',
      body: 'A path to this peer is not known yet. Wait for announces or check network connectivity.',
      actionLabel: 'Open network',
      actionPath: APP_ROUTES.network,
    }
  }
  if (reasonCode === 'timeout' || reasonCode === 'receipt_timeout') {
    return {
      title: 'Delivery timed out',
      body: 'The recipient might be offline or out of range. Keep the app running and retry shortly.',
    }
  }
  if (reasonCode === 'retry_budget_exhausted') {
    return {
      title: 'Retries exhausted',
      body: 'All configured retries were used. Check relay selection and connectivity before retrying.',
      actionLabel: 'Open settings',
      actionPath: APP_ROUTES.settings,
    }
  }
  return {
    title: 'Delivery failed',
    body: `Backend reason: ${reasonCode}`,
  }
}

function formatTraceTimestamp(value: number): string {
  if (!Number.isFinite(value)) {
    return 'unknown'
  }
  const timestampMs = value > 1_000_000_000_000 ? value : value * 1000
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function openAttachment(attachment: ChatMessage['attachments'][number]): void {
  if (!attachment.dataBase64) {
    return
  }
  const blob = decodeAttachmentBlob(attachment)
  if (!blob) {
    return
  }
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function saveAttachment(attachment: ChatMessage['attachments'][number]): void {
  if (!attachment.dataBase64) {
    return
  }
  const blob = decodeAttachmentBlob(attachment)
  if (!blob) {
    return
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = attachment.name
  anchor.click()
  URL.revokeObjectURL(url)
}

function decodeAttachmentBlob(attachment: ChatMessage['attachments'][number]): Blob | null {
  if (!attachment.dataBase64) {
    return null
  }
  try {
    const binary = atob(attachment.dataBase64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], {
      type: attachment.mime || 'application/octet-stream',
    })
  } catch {
    return null
  }
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return '—'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(
    element => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden')
  )
}
