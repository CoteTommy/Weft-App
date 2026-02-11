import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'

const files = [
  { name: 'trace-44b.ndjson', kind: 'Document', size: '1.9 MB', owner: 'relay.alpha' },
  { name: 'corridor-map-7.png', kind: 'Image', size: '482 KB', owner: 'echo.1' },
  { name: 'handoff-audio-brief.m4a', kind: 'Audio', size: '3.2 MB', owner: 'bluebird.ops' },
]

export function FilesPage() {
  return (
    <Panel>
      <PageHeading title="Files" subtitle="Shared files and notes" />
      <ul className="space-y-2">
        {files.map((file) => (
          <li key={file.name} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{file.kind} • {file.size} • from {file.owner}</p>
              </div>
              <button className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                Open
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
