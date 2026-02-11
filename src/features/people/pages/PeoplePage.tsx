import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'
import type { PersonTrust } from '../../../shared/types/people'
import { usePeople } from '../state/usePeople'

export function PeoplePage() {
  const { people, loading, error, refresh } = usePeople()

  return (
    <Panel>
      <PageHeading
        title="People"
        subtitle="Contacts you can message"
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

      {loading ? <p className="text-sm text-slate-500">Loading people...</p> : null}
      {error ? <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {!loading && people.length === 0 ? (
        <p className="text-sm text-slate-500">No peers discovered yet. Keep Weft connected to the network.</p>
      ) : null}

      <ul className="space-y-2">
        {people.map((person) => (
          <li
            key={person.id}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
          >
            <Link to={`/chats/${person.id}`} className="min-w-0 hover:opacity-90">
              <p className="truncate text-sm font-semibold text-slate-900">{person.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">Last seen {person.lastSeen}</p>
            </Link>
            <span
              className={clsx(
                'rounded-full px-2 py-1 text-xs font-medium',
                trustBadgeClasses(person.trust),
              )}
            >
              {person.trust}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function trustBadgeClasses(trust: PersonTrust): string {
  switch (trust) {
    case 'Verified':
      return 'bg-emerald-100 text-emerald-700'
    case 'Known':
      return 'bg-sky-100 text-sky-700'
    case 'New':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}
