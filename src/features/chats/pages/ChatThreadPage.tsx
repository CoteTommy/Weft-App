import { useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { MessageComposer } from '../components/MessageComposer'
import { MessageTimeline } from '../components/MessageTimeline'
import { ThreadList } from '../components/ThreadList'
import { useChatsState } from '../state/ChatsProvider'
import { filterThreads } from '../utils/filterThreads'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'
import { matchesQuery } from '../../../shared/utils/search'

export function ChatThreadPage() {
  const { chatId } = useParams()
  const { threads, loading, error, sendMessage, markThreadRead } = useChatsState()
  const [threadQuery, setThreadQuery] = useState('')
  const [messageQuery, setMessageQuery] = useState('')
  const filteredThreads = useMemo(
    () => filterThreads(threads, threadQuery),
    [threadQuery, threads],
  )
  const thread = useMemo(() => threads.find((candidate) => candidate.id === chatId), [chatId, threads])
  const filteredMessages = useMemo(() => {
    if (!thread) {
      return []
    }
    return thread.messages.filter((message) =>
      matchesQuery(messageQuery, [
        message.author,
        message.body,
        message.sentAt,
        message.status,
      ]),
    )
  }, [messageQuery, thread])

  useEffect(() => {
    if (thread && thread.unread > 0) {
      markThreadRead(thread.id)
    }
  }, [markThreadRead, thread])

  if (!loading && !thread) {
    return <Navigate to="/chats" replace />
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel className="flex min-h-0 flex-col">
        <PageHeading title="Chats" subtitle="Recent conversations" />
        <input
          value={threadQuery}
          onChange={(event) => setThreadQuery(event.target.value)}
          className="mb-3 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
          placeholder="Filter threads"
        />
        {!loading && filteredThreads.length === 0 ? (
          <p className="text-sm text-slate-500">No matching threads.</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ThreadList threads={filteredThreads} compact />
          </div>
        )}
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        {loading || !thread ? (
          <p className="text-sm text-slate-500">Loading thread...</p>
        ) : (
          <>
            <PageHeading
              title={thread.name}
              subtitle={`Destination ${thread.destination} • Messages auto-queue when offline`}
            />
            <input
              value={messageQuery}
              onChange={(event) => setMessageQuery(event.target.value)}
              className="mb-3 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
              placeholder="Search messages in this thread"
            />
            {error ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
            <div className="mb-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {thread.messages.length > 0 && filteredMessages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages match your search.</p>
              ) : (
                <MessageTimeline messages={filteredMessages} />
              )}
            </div>
            <MessageComposer
              onSend={(draft) => {
                return sendMessage(thread.id, draft)
              }}
            />
          </>
        )}
      </Panel>
    </div>
  )
}
