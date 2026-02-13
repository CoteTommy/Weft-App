import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'

import { Bell, BellOff, Pin, PinOff } from 'lucide-react'

import { FOCUS_QUICK_REPLY_EVENT, FOCUS_SEARCH_EVENT } from '@shared/runtime/shortcuts'
import { ListSkeleton } from '@shared/ui/ListSkeleton'
import { PageHeading } from '@shared/ui/PageHeading'
import { Panel } from '@shared/ui/Panel'
import { VirtualizedList } from '@shared/ui/VirtualizedList'
import { matchesQuery } from '@shared/utils/search'

import { MessageComposer } from '../components/MessageComposer'
import { MessageTimeline } from '../components/MessageTimeline'
import { ThreadListRow } from '../components/ThreadList'
import { useChatsState } from '../state/ChatsProvider'
import { filterThreadIndex, indexThreads } from '../utils/filterThreads'

export function ChatThreadPage() {
  const { chatId } = useParams()
  const { threads, loading, error, sendMessage, markThreadRead, setThreadMuted, setThreadPinned } =
    useChatsState()
  const [threadQuery, setThreadQuery] = useState('')
  const [messageQuery, setMessageQuery] = useState('')
  const [composerFocusToken, setComposerFocusToken] = useState(0)
  const messageSearchInputRef = useRef<HTMLInputElement | null>(null)
  const deferredThreadQuery = useDeferredValue(threadQuery)
  const deferredMessageQuery = useDeferredValue(messageQuery)
  const indexedThreads = useMemo(() => indexThreads(threads), [threads])
  const filteredThreads = useMemo(
    () => filterThreadIndex(indexedThreads, deferredThreadQuery),
    [deferredThreadQuery, indexedThreads]
  )
  const thread = useMemo(
    () => threads.find(candidate => candidate.id === chatId),
    [chatId, threads]
  )
  const filteredMessages = useMemo(() => {
    if (!thread) {
      return []
    }
    return thread.messages.filter(message =>
      matchesQuery(deferredMessageQuery, [
        message.author,
        message.body,
        message.sentAt,
        message.status,
      ])
    )
  }, [deferredMessageQuery, thread])

  useEffect(() => {
    if (thread && thread.unread > 0) {
      markThreadRead(thread.id)
    }
  }, [markThreadRead, thread])

  useEffect(() => {
    const onFocusSearch = () => {
      messageSearchInputRef.current?.focus()
      messageSearchInputRef.current?.select()
    }
    const onFocusQuickReply = () => {
      setComposerFocusToken(value => value + 1)
    }
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    window.addEventListener(FOCUS_QUICK_REPLY_EVENT, onFocusQuickReply)
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
      window.removeEventListener(FOCUS_QUICK_REPLY_EVENT, onFocusQuickReply)
    }
  }, [])

  if (!loading && !thread) {
    return <Navigate to="/chats" replace />
  }

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Panel className="flex min-h-0 flex-col">
        <PageHeading title="Chats" subtitle="Recent conversations" />
        <input
          value={threadQuery}
          onChange={event => setThreadQuery(event.target.value)}
          className="mb-3 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
          placeholder="Filter threads"
        />
        {loading ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ListSkeleton rows={6} />
          </div>
        ) : null}
        {!loading && filteredThreads.length === 0 ? (
          <p className="text-sm text-slate-500">No matching threads.</p>
        ) : null}
        {!loading && filteredThreads.length > 0 ? (
          <VirtualizedList
            items={filteredThreads}
            estimateItemHeight={92}
            className="min-h-0 flex-1 overflow-y-auto pr-1"
            listClassName="pb-1"
            getKey={threadItem => threadItem.id}
            renderItem={threadItem => (
              <div className="py-1">
                <ThreadListRow thread={threadItem} compact />
              </div>
            )}
          />
        ) : null}
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        {loading || !thread ? (
          <div className="min-h-0 flex-1">
            <p className="mb-3 text-sm text-slate-500">Loading thread...</p>
            <ListSkeleton rows={8} rowClassName="h-20" className="pr-1" />
          </div>
        ) : (
          <>
            <PageHeading
              title={thread.name}
              subtitle={`Destination ${thread.destination} • Messages auto-queue when offline`}
              action={
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setThreadPinned(thread.id)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    {thread.pinned ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                    {thread.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    onClick={() => setThreadMuted(thread.id)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    {thread.muted ? (
                      <Bell className="h-3.5 w-3.5" />
                    ) : (
                      <BellOff className="h-3.5 w-3.5" />
                    )}
                    {thread.muted ? 'Unmute' : 'Mute'}
                  </button>
                </div>
              }
            />
            <input
              ref={messageSearchInputRef}
              value={messageQuery}
              onChange={event => setMessageQuery(event.target.value)}
              className="mb-3 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
              placeholder="Search messages in this thread"
            />
            {error ? (
              <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            ) : null}
            <div className="mb-4 min-h-0 flex-1 pr-1">
              {thread.messages.length > 0 && filteredMessages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages match your search.</p>
              ) : (
                <MessageTimeline
                  className="h-full"
                  messages={filteredMessages}
                  onRetry={message => {
                    const attachments = message.attachments
                      .filter(attachment => Boolean(attachment.dataBase64))
                      .map(attachment => ({
                        name: attachment.name,
                        mime: attachment.mime,
                        sizeBytes: attachment.sizeBytes,
                        dataBase64: attachment.dataBase64 as string,
                      }))
                    return sendMessage(thread.id, {
                      text: message.body,
                      attachments: attachments.length > 0 ? attachments : undefined,
                      paper: message.paper
                        ? {
                            title: message.paper.title,
                            category: message.paper.category,
                          }
                        : undefined,
                    }).then(() => undefined)
                  }}
                />
              )}
            </div>
            <MessageComposer
              focusToken={composerFocusToken}
              sessionKey={thread.id}
              onSend={draft => {
                return sendMessage(thread.id, draft)
              }}
            />
          </>
        )}
      </Panel>
    </div>
  )
}
