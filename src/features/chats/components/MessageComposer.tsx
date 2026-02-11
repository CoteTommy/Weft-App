import { useState } from 'react'

interface MessageComposerProps {
  onSend?: (text: string) => void
}

export function MessageComposer({ onSend }: MessageComposerProps) {
  const [text, setText] = useState('')

  return (
    <form
      className="rounded-2xl border border-slate-200 bg-white p-2"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = text.trim()
        if (!trimmed) {
          return
        }
        onSend?.(trimmed)
        setText('')
      }}
    >
      <div className="flex items-center gap-2">
        <input
          className="h-11 flex-1 rounded-xl border border-transparent px-3 text-sm text-slate-800 outline-none transition focus:border-blue-200 focus:bg-blue-50/50"
          placeholder="Type a message..."
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
          aria-label="Attach file"
        >
          +
        </button>
        <button
          type="submit"
          className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </form>
  )
}
