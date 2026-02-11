import clsx from 'clsx'
import type { ChatMessage } from '../../../shared/types/chat'

interface MessageTimelineProps {
  messages: ChatMessage[]
}

export function MessageTimeline({ messages }: MessageTimelineProps) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <article
          key={message.id}
          className={clsx('flex', message.sender === 'self' ? 'justify-end' : 'justify-start')}
        >
          <div
            className={clsx(
              'max-w-[80%] rounded-2xl px-4 py-3',
              message.sender === 'self'
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 bg-white text-slate-800',
            )}
          >
            <p className="text-sm leading-relaxed">{message.body}</p>
            <div className="mt-2 flex items-center justify-end gap-2 text-[11px] opacity-75">
              <span>{message.sentAt}</span>
              {message.sender === 'self' && message.status ? <span>{renderStatus(message.status)}</span> : null}
            </div>
          </div>
        </article>
      ))}
    </div>
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
