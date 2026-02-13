import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'
import { VirtualizedList } from '../../../shared/ui/VirtualizedList'
import type { AnnouncePriorityLabel } from '../../../shared/types/announces'
import type { LxmfSendMessageOptions } from '../../../lib/lxmf-api'
import { sendLxmfMessage } from '../../../lib/lxmf-api'
import { shortHash } from '../../../shared/utils/identity'
import { filterIndexedItems, indexSearchItems } from '../../../shared/utils/search'
import {
  buildNewChatHref,
  parseLxmfContactReference,
} from '../../../shared/utils/contactReference'
import { useAnnounces } from '../state/useAnnounces'
import type { AnnounceItem } from '../../../shared/types/announces'
import { sendHubJoin } from '../services/announcesService'

export function AnnouncesPage() {
  const navigate = useNavigate()
  const { announces, loading, loadingMore, hasMore, announcing, error, refresh, loadMore, announceNow } =
    useAnnounces()
  const [query, setQuery] = useState('')
  const [selectedAnnounce, setSelectedAnnounce] = useState<AnnounceItem | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [joiningHub, setJoiningHub] = useState(false)
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)
  const indexedAnnounces = useMemo(
    () =>
      indexSearchItems(announces, (announce) => [
        announce.title,
        announce.body,
        announce.audience,
        announce.source,
        announce.capabilities.join(' '),
        announce.priority,
        announce.postedAt,
      ]),
    [announces],
  )
  const filteredAnnounces = useMemo(
    () => filterIndexedItems(indexedAnnounces, deferredQuery),
    [deferredQuery, indexedAnnounces],
  )
  const canSendToSource = Boolean(selectedAnnounce?.source.trim())

  const closeModal = useCallback(() => {
    setSelectedAnnounce(null)
    setReplyText('')
    setReplyFeedback(null)
  }, [])

  useEffect(() => {
    if (!selectedAnnounce) {
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
  }, [closeModal, selectedAnnounce])

  const handleSendReply = async () => {
    if (!selectedAnnounce) {
      return
    }
    const content = replyText.trim()
    if (!content) {
      setReplyFeedback('Write a message first.')
      return
    }
    const destination = selectedAnnounce.source.trim()
    if (!destination) {
      setReplyFeedback('This announce has no source destination.')
      return
    }

    setSendingReply(true)
    setReplyFeedback(null)
    try {
      const payload: LxmfSendMessageOptions = {
        destination,
        title: `Re: ${selectedAnnounce.title}`,
        content,
      }
      await sendLxmfMessage(payload)
      setReplyText('')
      setReplyFeedback('Message queued for delivery.')
    } catch (sendError) {
      setReplyFeedback(sendError instanceof Error ? sendError.message : String(sendError))
    } finally {
      setSendingReply(false)
    }
  }

  const handleJoinHub = async () => {
    if (!selectedAnnounce) {
      return
    }
    const destination = selectedAnnounce.source.trim()
    if (!destination) {
      setReplyFeedback('This announce has no source destination.')
      return
    }
    setJoiningHub(true)
    setReplyFeedback(null)
    try {
      await sendHubJoin(destination)
      setReplyFeedback('Join command sent.')
    } catch (joinError) {
      setReplyFeedback(joinError instanceof Error ? joinError.message : String(joinError))
    } finally {
      setJoiningHub(false)
    }
  }

  return (
    <>
      <Panel className="flex h-full min-h-0 flex-col">
        <PageHeading
          title="Announces"
          subtitle="Network-wide announcements and broadcasts"
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  void refresh()
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Refresh
              </button>
              <button
                onClick={() => {
                  void announceNow()
                }}
                disabled={announcing}
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {announcing ? 'Announcing...' : 'Announce now'}
              </button>
            </div>
          }
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
          placeholder="Search announces by title, source, audience, or body"
        />
        {loading ? <p className="text-sm text-slate-500">Loading announcements...</p> : null}
        {error ? <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
        {!loading && announces.length === 0 ? (
          <p className="text-sm text-slate-500">No announce payloads have been seen yet.</p>
        ) : null}
        {!loading && announces.length > 0 && filteredAnnounces.length === 0 ? (
          <p className="text-sm text-slate-500">No announcements match your search.</p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          <VirtualizedList
            items={filteredAnnounces}
            estimateItemHeight={106}
            className="min-h-0 flex-1 overflow-y-auto pr-1"
            listClassName="pb-1"
            getKey={(announce) => announce.id}
            renderItem={(announce) => (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAnnounce(announce)
                    setReplyFeedback(null)
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{announce.title}</p>
                      <p className="mt-1 max-h-10 overflow-hidden text-sm text-slate-600">{announce.body}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Audience: {announce.audience} • Source: {shortHash(announce.source, 8)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={clsx(
                          'rounded-full px-2 py-1 text-xs font-semibold',
                          priorityBadgeClass(announce.priority),
                        )}
                      >
                        {announce.priority}
                      </span>
                      <span className="text-xs text-slate-500">{announce.postedAt}</span>
                    </div>
                  </div>
                </button>
              </div>
            )}
          />
          {!loading && hasMore ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => {
                  void loadMore()
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          ) : null}
        </div>
      </Panel>

      {selectedAnnounce ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Announcement</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">{selectedAnnounce.title}</h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>{selectedAnnounce.body}</p>
              <p className="mt-2 text-xs text-slate-500">
                Audience: {selectedAnnounce.audience} • Priority: {selectedAnnounce.priority} • Posted: {selectedAnnounce.postedAt}
              </p>
              <p className="mt-1 break-all text-xs text-slate-500">Source: {selectedAnnounce.source || 'Unknown'}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Capabilities</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedAnnounce.capabilities.length === 0 ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">
                    none advertised
                  </span>
                ) : (
                  selectedAnnounce.capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                    >
                      {capability}
                    </span>
                  ))
                )}
              </div>
              {hasHubJoinCapability(selectedAnnounce.capabilities) ? (
                <p className="mt-2 text-xs text-emerald-700">This announce matches known RCH capabilities.</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Capabilities do not clearly identify RCH; join is still available manually.</p>
              )}
            </div>

            <label className="mb-1 block text-xs font-semibold text-slate-600">Send message to source</label>
            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-300"
              placeholder="Write a message..."
            />
            {replyFeedback ? <p className="mt-2 text-xs text-slate-600">{replyFeedback}</p> : null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canSendToSource || joiningHub}
                  onClick={() => {
                    void handleJoinHub()
                  }}
                  className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-blue-300"
                >
                  {joiningHub ? 'Joining...' : 'Join hub'}
                </button>
                <button
                  type="button"
                  disabled={!canSendToSource || sendingReply}
                  onClick={() => {
                    void handleSendReply()
                  }}
                  className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {sendingReply ? 'Sending...' : 'Send message'}
                </button>
                <button
                  type="button"
                  disabled={!canSendToSource}
                  onClick={() => {
                    const parsed = parseLxmfContactReference(selectedAnnounce.source)
                    if (!parsed.ok) {
                      return
                    }
                    void navigate(buildNewChatHref(parsed.value.destinationHash, selectedAnnounce.title))
                    closeModal()
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Start chat
                </button>
              </div>
              <button
                type="button"
                disabled={!canSendToSource}
                onClick={() => {
                  if (selectedAnnounce.source.trim()) {
                    void navigator.clipboard.writeText(selectedAnnounce.source.trim())
                    setReplyFeedback('Source copied.')
                  }
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                Copy source
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function priorityBadgeClass(priority: AnnouncePriorityLabel): string {
  return priority === 'Urgent' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
}

function hasHubJoinCapability(capabilities: string[]): boolean {
  if (capabilities.length === 0) {
    return false
  }
  const normalized = capabilities.map((entry) => entry.trim().toLowerCase())
  const knownRchCaps = new Set([
    'topic_broker',
    'group_chat',
    'telemetry_relay',
    'attachments',
    'tak_bridge',
    'federation',
    'telemetry',
  ])
  return normalized.some((entry) => knownRchCaps.has(entry))
}
