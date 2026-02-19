import { useEffect, useRef } from 'react'

import clsx from 'clsx'

import type { ChatMessage } from '@shared/types/chat'

import { formatBytes, formatTraceTimestamp, renderStatus } from '../messageTimelineFormatting'

type FailureGuidance = {
  title: string
  body: string
  actionLabel?: string
  actionPath?: string
} | null

type MessageDetailsDialogProps = {
  message: ChatMessage | null
  deliveryTrace: NonNullable<ChatMessage['deliveryTrace']>
  deliveryTraceLoading: boolean
  failureGuidance: FailureGuidance
  copyFeedback: string | null
  setCopyFeedback: (value: string | null) => void
  onClose: () => void
  onRetry?: (message: ChatMessage) => Promise<void> | void
  onOpenAttachment: (messageId: string, attachment: ChatMessage['attachments'][number]) => void
  onSaveAttachment: (messageId: string, attachment: ChatMessage['attachments'][number]) => void
  onNavigate: (path: string) => void
}

export function MessageDetailsDialog({
  message,
  deliveryTrace,
  deliveryTraceLoading,
  failureGuidance,
  copyFeedback,
  setCopyFeedback,
  onClose,
  onRetry,
  onOpenAttachment,
  onSaveAttachment,
  onNavigate,
}: MessageDetailsDialogProps) {
  const detailsDialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!message) {
      return
    }
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
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
  }, [message, onClose])

  if (!message) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
      onClick={onClose}
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
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm break-words whitespace-pre-wrap text-slate-800">{message.body}</p>
        </div>

        <div className="space-y-1.5 text-xs text-slate-600">
          <DetailRow label="Author" value={message.author} />
          <DetailRow
            label="Direction"
            value={message.sender === 'self' ? 'Outgoing' : 'Incoming'}
          />
          <DetailRow label="Time" value={message.sentAt} />
          <DetailRow label="Status" value={message.status ? renderStatus(message.status) : '—'} />
          <DetailRow label="Backend status" value={message.statusDetail ?? '—'} />
          <DetailRow label="Reason code" value={message.statusReasonCode ?? '—'} />
          <DetailRow
            label="Delivery trace"
            value={deliveryTraceLoading ? 'Loading...' : `${deliveryTrace.length} transition(s)`}
          />
          <DetailRow label="Attachments" value={String(message.attachments.length)} />
          <DetailRow label="Paper" value={message.paper ? 'Yes' : 'No'} />
          <DetailRow label="Message ID" value={message.id} mono />
          <DetailRow label="Length" value={`${message.body.length} chars`} />
        </div>

        {message.paper ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-slate-700">
            <p className="font-semibold text-amber-800">Paper metadata</p>
            <p className="mt-1">Title: {message.paper.title ?? '—'}</p>
            <p>Category: {message.paper.category ?? '—'}</p>
          </div>
        ) : null}

        {message.attachments.length > 0 ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-700">Attachments</p>
            <ul className="space-y-2">
              {message.attachments.map((attachment, index) => (
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
                        onOpenAttachment(message.id, attachment)
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSaveAttachment(message.id, attachment)
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

        {message.sender === 'self' && message.status === 'failed' && failureGuidance
          ? (() => {
              const actionPath = failureGuidance.actionPath

              return (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">{failureGuidance.title}</p>
                  <p className="mt-1">{failureGuidance.body}</p>
                  {actionPath ? (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(actionPath)
                        onClose()
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
          {message.sender === 'self' && message.status === 'failed' ? (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    await onRetry?.(message)
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
              void navigator.clipboard.writeText(message.body)
              setCopyFeedback('Message copied.')
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Copy message
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(message.id)
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
  )
}

type DetailRowProps = {
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
