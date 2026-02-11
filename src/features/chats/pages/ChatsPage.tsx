import { Link } from 'react-router-dom'
import { ThreadList } from '../components/ThreadList'
import { chatThreads } from '../model/chatMocks'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'

export function ChatsPage() {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel>
        <PageHeading
          title="Chats"
          subtitle="People and groups you've messaged"
          action={
            <button className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700">
              New chat
            </button>
          }
        />
        <input
          className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
          placeholder="Search chats"
        />
        <ThreadList threads={chatThreads} />
      </Panel>

      <Panel>
        <PageHeading title="Select a conversation" subtitle="Choose a chat from the list to open the thread." />
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          <p>This screen is focused on clarity for non-technical users.</p>
          <p className="mt-2">You can start by opening your most recent thread.</p>
          <Link
            to={`/chats/${chatThreads[0]?.id ?? ''}`}
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            Open latest chat
          </Link>
        </div>
      </Panel>
    </div>
  )
}
