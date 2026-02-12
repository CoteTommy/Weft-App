import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { ChatMessage } from '../../../shared/types/chat'

interface MessageTimelineProps {
  messages: ChatMessage[]
}

export function MessageTimeline({ messages }: MessageTimelineProps) {
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const holdTimeoutRef = useRef<number | null>(null)
  const holdTriggeredRef = useRef(false)
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null)
  const selectedMessage = useMemo(
    () => messages.find((message) => message.id === selectedMessageId) ?? null,
    [messages, selectedMessageId],
  )
  const latestMessageId = messages[messages.length - 1]?.id ?? null

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
    [],
  )

  useEffect(() => {
    if (!selectedMessage) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeModal, selectedMessage])

  useLayoutEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ block: 'end' })
  }, [latestMessageId, messages.length])

  return (
    <>
      <div className="space-y-3">
        {messages.map((message) => (
          <article
            key={message.id}
            className={clsx('flex', message.sender === 'self' ? 'justify-end' : 'justify-start')}
          >
            <button
              type="button"
              onPointerDown={() => startHold(message)}
              onPointerUp={clearHoldTimer}
              onPointerCancel={clearHoldTimer}
              onPointerLeave={clearHoldTimer}
              onClick={() => openDetails(message)}
              className={clsx(
                'max-w-[80%] rounded-2xl px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300',
                message.sender === 'self'
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'border border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50',
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
                {message.sender === 'self' && message.status ? <span>{renderStatus(message.status)}</span> : null}
              </div>
            </button>
          </article>
        ))}
        <div ref={bottomAnchorRef} aria-hidden className="h-0 w-full" />
      </div>

      {selectedMessage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Message details</h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{selectedMessage.body}</p>
            </div>

            <div className="space-y-1.5 text-xs text-slate-600">
              <DetailRow label="Author" value={selectedMessage.author} />
              <DetailRow label="Direction" value={selectedMessage.sender === 'self' ? 'Outgoing' : 'Incoming'} />
              <DetailRow label="Time" value={selectedMessage.sentAt} />
              <DetailRow label="Status" value={selectedMessage.status ? renderStatus(selectedMessage.status) : '—'} />
              <DetailRow label="Backend status" value={selectedMessage.statusDetail ?? '—'} />
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
                          disabled={!attachment.dataBase64}
                          onClick={() => openAttachment(attachment)}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          disabled={!attachment.dataBase64}
                          onClick={() => saveAttachment(attachment)}
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

            <div className="mt-3 flex items-center gap-2">
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
      <span className={clsx(mono ? 'break-all font-mono text-[11px]' : '')}>{value}</span>
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
