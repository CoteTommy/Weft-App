import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'
import { useFiles } from '../state/useFiles'

export function FilesPage() {
  const { files, loading, error, refresh } = useFiles()

  return (
    <Panel>
      <PageHeading
        title="Files"
        subtitle="Shared files and notes"
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
      {loading ? <p className="text-sm text-slate-500">Loading files...</p> : null}
      {error ? <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {!loading && files.length === 0 ? (
        <p className="text-sm text-slate-500">No attachments or paper notes have been received yet.</p>
      ) : null}
      <ul className="space-y-2">
        {files.map((file) => (
          <li key={file.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {file.kind} • {file.sizeLabel} • from {file.owner}
                </p>
              </div>
              <button
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                disabled
              >
                Open
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
