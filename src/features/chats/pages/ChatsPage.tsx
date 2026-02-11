import { Link } from 'react-router-dom'
import { ThreadList } from '../components/ThreadList'
import { useChatsState } from '../state/ChatsProvider'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'

export function ChatsPage() {
  const { threads, loading, error, refresh } = useChatsState()

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel>
        <PageHeading
          title="Chats"
          subtitle="People and groups you've messaged"
          action={
            <button
              onClick={() => {
                void refresh()
              }}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Refresh
            </button>
          }
        />
        <input
          className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
          placeholder="Search chats"
        />
        {loading ? <p className="text-sm text-slate-500">Loading chats...</p> : null}
        {error ? <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
        {!loading && threads.length === 0 ? (
          <p className="text-sm text-slate-500">No chats yet. Send your first message from People.</p>
        ) : (
          <ThreadList threads={threads} />
        )}
      </Panel>

      <Panel>
        <PageHeading title="Select a conversation" subtitle="Choose a chat from the list to open the thread." />
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          <p>This screen is focused on clarity for non-technical users.</p>
          <p className="mt-2">You can start by opening your most recent thread.</p>
          <Link
            to={threads[0] ? `/chats/${threads[0].id}` : '/people'}
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            {threads[0] ? 'Open latest chat' : 'Open people'}
          </Link>
        </div>
      </Panel>
    </div>
  )
}
