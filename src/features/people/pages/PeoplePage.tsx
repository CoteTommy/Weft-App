import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'

const people = [
  { name: 'relay.alpha', trust: 'Verified', lastSeen: '5m ago' },
  { name: 'bluebird.ops', trust: 'Known', lastSeen: '26m ago' },
  { name: 'echo.1', trust: 'New', lastSeen: '1h ago' },
]

export function PeoplePage() {
  return (
    <Panel>
      <PageHeading
        title="People"
        subtitle="Contacts you can message"
        action={
          <button className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700">
            Add person
          </button>
        }
      />

      <ul className="space-y-2">
        {people.map((person) => (
          <li key={person.name} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{person.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">Last seen {person.lastSeen}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{person.trust}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
