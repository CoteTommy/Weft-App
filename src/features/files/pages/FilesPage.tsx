import { useMemo, useState } from 'react'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'
import { matchesQuery } from '../../../shared/utils/search'
import { useFiles } from '../state/useFiles'
import type { FileItem } from '../../../shared/types/files'

export function FilesPage() {
  const { files, loading, error, refresh } = useFiles()
  const [query, setQuery] = useState('')
  const filteredFiles = useMemo(
    () => files.filter((file) => matchesQuery(query, [file.name, file.kind, file.owner, file.sizeLabel])),
    [files, query],
  )

  return (
    <Panel className="flex h-full min-h-0 flex-col">
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
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
        placeholder="Search files, notes, owner, or type"
      />
      {loading ? <p className="text-sm text-slate-500">Loading files...</p> : null}
      {error ? <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {!loading && files.length === 0 ? (
        <p className="text-sm text-slate-500">No attachments or paper notes have been received yet.</p>
      ) : null}
      {!loading && files.length > 0 && filteredFiles.length === 0 ? (
        <p className="text-sm text-slate-500">No files match your search.</p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="space-y-2">
          {filteredFiles.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => openFileItem(file)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/70"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {file.kind} • {file.sizeLabel} • from {file.owner}
                    </p>
                  </div>
                  <span className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                    Open
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

function openFileItem(file: FileItem): void {
  if (file.kind === 'Note') {
    if (file.paperUri) {
      void navigator.clipboard.writeText(file.paperUri)
    }
    return
  }
  if (!file.dataBase64) {
    return
  }
  const blob = decodeBlob(file)
  if (!blob) {
    return
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  URL.revokeObjectURL(url)
}

function decodeBlob(file: FileItem): Blob | null {
  if (!file.dataBase64) {
    return null
  }
  try {
    const binary = atob(file.dataBase64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new Blob([bytes], { type: file.mime || 'application/octet-stream' })
  } catch {
    return null
  }
}
