import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { MessageComposer } from '../components/MessageComposer'
import { MessageTimeline } from '../components/MessageTimeline'
import { ThreadList } from '../components/ThreadList'
import { chatThreads, findThreadById } from '../model/chatMocks'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'

export function ChatThreadPage() {
  const { chatId } = useParams()
  const thread = useMemo(() => findThreadById(chatId), [chatId])

  if (!thread) {
    return <Navigate to="/chats" replace />
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel>
        <PageHeading title="Chats" subtitle="Recent conversations" />
        <ThreadList threads={chatThreads} compact />
      </Panel>

      <Panel>
        <PageHeading title={thread.name} subtitle="Connected • Messages auto-queue when offline" />
        <div className="mb-4 max-h-[52vh] overflow-y-auto pr-1">
          <MessageTimeline messages={thread.messages} />
        </div>
        <MessageComposer
          onSend={(text) => {
            console.log('queued message', text)
          }}
        />
      </Panel>
    </div>
  )
}
