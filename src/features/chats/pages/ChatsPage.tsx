import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { APP_ROUTES } from '@app/config/routes'
import { FOCUS_NEW_CHAT_EVENT, FOCUS_SEARCH_EVENT } from '@shared/runtime/shortcuts'
import { ListSkeleton } from '@shared/ui/ListSkeleton'
import { PageHeading } from '@shared/ui/PageHeading'
import { Panel } from '@shared/ui/Panel'
import { VirtualizedList } from '@shared/ui/VirtualizedList'
import { parseLxmfContactReference } from '@shared/utils/contactReference'

import { ThreadListRow } from '../components/ThreadList'
import { useChatsState } from '../state/ChatsProvider'
import { filterThreadIndex, indexThreads } from '../utils/filterThreads'

export function ChatsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    threads,
    loading,
    error,
    refresh,
    markAllRead,
    createThread,
    selectThread,
    loadMoreThreads,
  } = useChatsState()
  const [query, setQuery] = useState('')
  const [destinationInput, setDestinationInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [composeError, setComposeError] = useState<string | null>(null)
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false)
  const deferredQuery = useDeferredValue(query)
  const indexedThreads = useMemo(() => indexThreads(threads), [threads])
  const filteredThreads = useMemo(
    () => filterThreadIndex(indexedThreads, deferredQuery),
    [deferredQuery, indexedThreads]
  )
  const primaryThread = filteredThreads[0] ?? threads[0]
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const destinationInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    selectThread(undefined)
  }, [selectThread])

  useEffect(() => {
    const fromAnnounce = searchParams.get('new_dest')
    if (!fromAnnounce) {
      return
    }
    const parsed = parseLxmfContactReference(fromAnnounce)
    if (!parsed.ok) {
      queueMicrotask(() => {
        setComposeError(parsed.error)
      })
      return
    }
    queueMicrotask(() => {
      setComposeError(null)
    })
    const displayName = searchParams.get('new_name') ?? undefined
    const threadId = createThread(parsed.value.destinationHash, displayName)
    if (threadId) {
      void navigate(`${APP_ROUTES.chats}/${threadId}`, { replace: true })
    }
  }, [createThread, navigate, searchParams])

  useEffect(() => {
    const onFocusSearch = () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    const onFocusNewChat = () => {
      destinationInputRef.current?.focus()
      destinationInputRef.current?.select()
    }
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    window.addEventListener(FOCUS_NEW_CHAT_EVENT, onFocusNewChat)
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
      window.removeEventListener(FOCUS_NEW_CHAT_EVENT, onFocusNewChat)
    }
  }, [])

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel className="flex min-h-0 flex-col">
        <PageHeading
          title="Chats"
          subtitle="People and groups you've messaged"
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  void refresh()
                }}
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                Refresh
              </button>
              <button
                onClick={() => {
                  markAllRead()
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Mark all read
              </button>
            </div>
          }
        />
        <form
          className="mb-3 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5"
          onSubmit={event => {
            event.preventDefault()
            const parsed = parseLxmfContactReference(destinationInput)
            if (!parsed.ok) {
              setComposeError(parsed.error)
              return
            }
            setComposeError(null)
            const threadId = createThread(parsed.value.destinationHash, nameInput)
            if (threadId) {
              setDestinationInput('')
              setNameInput('')
              void navigate(`${APP_ROUTES.chats}/${threadId}`)
            }
          }}
        >
          <input
            ref={destinationInputRef}
            value={destinationInput}
            onChange={event => {
              setDestinationInput(event.target.value)
              setComposeError(null)
            }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
            placeholder="Destination hash or lxma:// link"
          />
          <div className="flex items-center gap-2">
            <input
              value={nameInput}
              onChange={event => {
                setNameInput(event.target.value)
                setComposeError(null)
              }}
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
              placeholder="Optional display name"
            />
            <button
              type="submit"
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              New chat
            </button>
          </div>
          {composeError ? <p className="text-xs text-rose-700">{composeError}</p> : null}
        </form>
        <input
          ref={searchInputRef}
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
          placeholder="Search chats by name, destination, or latest message"
        />
        {error ? (
          <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        ) : null}
        {!loading && threads.length === 0 ? (
          <p className="text-sm text-slate-500">
            No chats yet. Send your first message from People.
          </p>
        ) : null}
        {loading ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ListSkeleton rows={7} />
          </div>
        ) : null}
        {!loading && threads.length > 0 ? (
          filteredThreads.length === 0 ? (
            <p className="text-sm text-slate-500">No chats match your search.</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <VirtualizedList
                items={filteredThreads}
                estimateItemHeight={98}
                className="min-h-0 flex-1 overflow-y-auto pr-1"
                listClassName="pb-1"
                getKey={thread => thread.id}
                renderItem={thread => (
                  <div className="py-1">
                    <ThreadListRow thread={thread} />
                  </div>
                )}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={loadingMoreThreads}
                  onClick={() => {
                    void (async () => {
                      try {
                        setLoadingMoreThreads(true)
                        await loadMoreThreads()
                      } finally {
                        setLoadingMoreThreads(false)
                      }
                    })()
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {loadingMoreThreads ? 'Loading…' : 'Load more'}
                </button>
              </div>
            </div>
          )
        ) : null}
      </Panel>

      <Panel className="min-h-0 overflow-y-auto">
        <PageHeading
          title="Select a conversation"
          subtitle="Choose a chat from the list to open the thread."
        />
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          <p>This screen is focused on clarity for non-technical users.</p>
          <p className="mt-2">You can start by opening your most recent thread.</p>
          <Link
            to={primaryThread ? `${APP_ROUTES.chats}/${primaryThread.id}` : APP_ROUTES.people}
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            {primaryThread ? 'Open latest chat' : 'Open people'}
          </Link>
        </div>
      </Panel>
    </div>
  )
}
