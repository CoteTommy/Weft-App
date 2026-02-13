import { useEffect, useRef, useState } from 'react'
import { Paperclip, StickyNote, X } from 'lucide-react'
import type {
  OutboundAttachmentDraft,
  OutboundMessageDraft,
  OutboundSendOutcome,
} from '../../../shared/types/chat'

interface MessageComposerProps {
  onSend?: (draft: OutboundMessageDraft) => Promise<OutboundSendOutcome> | void
  focusToken?: number
}

export function MessageComposer({ onSend, focusToken = 0 }: MessageComposerProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<OutboundAttachmentDraft[]>([])
  const [paperEnabled, setPaperEnabled] = useState(false)
  const [paperTitle, setPaperTitle] = useState('')
  const [paperCategory, setPaperCategory] = useState('')
  const [sending, setSending] = useState(false)
  const [sendFeedback, setSendFeedback] = useState<{
    text: string
    paperUri?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    textInputRef.current?.focus()
    textInputRef.current?.select()
  }, [focusToken])

  return (
    <form
      className="rounded-2xl border border-slate-200 bg-white p-2"
      onSubmit={(event) => {
        event.preventDefault()
        void (async () => {
          const trimmed = text.trim()
          const fallbackText =
            paperEnabled && paperTitle.trim()
              ? paperTitle.trim()
              : attachments.length > 0
                ? `Shared ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}`
                : ''
          const resolvedText = trimmed || fallbackText
          if (!resolvedText) {
            return
          }
          try {
            setSending(true)
            const outcome = await onSend?.({
              text: resolvedText,
              attachments,
              paper: paperEnabled
                ? {
                    title: paperTitle.trim() || undefined,
                    category: paperCategory.trim() || undefined,
                  }
                : undefined,
            })
            setText('')
            setAttachments([])
            setPaperEnabled(false)
            setPaperTitle('')
            setPaperCategory('')
            setError(null)
            if (outcome?.paperUri) {
              setSendFeedback({
                text: 'Paper URI generated.',
                paperUri: outcome.paperUri,
              })
            } else if (outcome?.backendStatus) {
              setSendFeedback({
                text: outcome.backendStatus,
              })
            } else {
              setSendFeedback(null)
            }
          } catch (sendError) {
            setError(sendError instanceof Error ? sendError.message : String(sendError))
          } finally {
            setSending(false)
          }
        })()
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files
          if (!files || files.length === 0) {
            return
          }
          void (async () => {
            try {
              const incoming: OutboundAttachmentDraft[] = []
              for (const file of Array.from(files)) {
                if (file.size > 2 * 1024 * 1024) {
                  throw new Error(`"${file.name}" is larger than 2MB.`)
                }
                incoming.push({
                  name: file.name,
                  mime: file.type || undefined,
                  sizeBytes: file.size,
                  dataBase64: await fileToBase64(file),
                })
              }
              setAttachments((previous) => [...previous, ...incoming])
              setError(null)
              setSendFeedback(null)
            } catch (loadError) {
              setError(loadError instanceof Error ? loadError.message : String(loadError))
            } finally {
              event.target.value = ''
            }
          })()
        }}
      />
      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {attachments.map((attachment, index) => (
            <span
              key={`${attachment.name}:${index}`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
            >
              {attachment.name}
              <button
                type="button"
                onClick={() =>
                  setAttachments((previous) =>
                    previous.filter((_, attachmentIndex) => attachmentIndex !== index),
                  )
                }
                className="rounded-full p-0.5 text-slate-500 transition hover:bg-slate-200"
                aria-label={`Remove ${attachment.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {paperEnabled ? (
        <div className="mb-2 grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2">
          <input
            value={paperTitle}
            onChange={(event) => setPaperTitle(event.target.value)}
            className="h-9 rounded-lg border border-amber-200 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-amber-300"
            placeholder="Paper title (optional)"
          />
          <input
            value={paperCategory}
            onChange={(event) => setPaperCategory(event.target.value)}
            className="h-9 rounded-lg border border-amber-200 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-amber-300"
            placeholder="Paper category (optional)"
          />
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          ref={textInputRef}
          className="h-11 flex-1 rounded-xl border border-transparent px-3 text-sm text-slate-800 outline-none transition focus:border-blue-200 focus:bg-blue-50/50"
          placeholder="Type a message..."
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setSendFeedback(null)
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
          aria-label="Attach files"
          disabled={sending}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPaperEnabled((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
          aria-label="Toggle paper metadata"
          disabled={sending}
        >
          <StickyNote className="h-4 w-4" />
        </button>
        <button
          type="submit"
          disabled={sending}
          className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>
      {error ? <p className="px-1 pt-2 text-xs text-rose-700">{error}</p> : null}
      {sendFeedback ? (
        <div className="flex items-center gap-2 px-1 pt-2 text-xs text-slate-600">
          <p>{sendFeedback.text}</p>
          {sendFeedback.paperUri ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(sendFeedback.paperUri ?? '')
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Copy paper URI
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}
