import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { MessageComposer } from '../components/MessageComposer'
import { MessageTimeline } from '../components/MessageTimeline'
import { ThreadList } from '../components/ThreadList'
import { useChatsState } from '../state/ChatsProvider'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'

export function ChatThreadPage() {
  const { chatId } = useParams()
  const { threads, loading, error, sendMessage } = useChatsState()
  const thread = useMemo(() => threads.find((candidate) => candidate.id === chatId), [chatId, threads])

  if (!loading && !thread) {
    return <Navigate to="/chats" replace />
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel>
        <PageHeading title="Chats" subtitle="Recent conversations" />
        <ThreadList threads={threads} compact />
      </Panel>

      <Panel>
        {loading || !thread ? (
          <p className="text-sm text-slate-500">Loading thread...</p>
        ) : (
          <>
            <PageHeading title={thread.name} subtitle="Connected • Messages auto-queue when offline" />
            {error ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
            <div className="mb-4 max-h-[52vh] overflow-y-auto pr-1">
              <MessageTimeline messages={thread.messages} />
            </div>
            <MessageComposer
              onSend={(text) => {
                void sendMessage(thread.id, text)
              }}
            />
          </>
        )}
      </Panel>
    </div>
  )
}
