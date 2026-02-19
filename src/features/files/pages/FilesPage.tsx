import { useEffect, useMemo, useRef, useState } from 'react'

import { FOCUS_SEARCH_EVENT } from '@shared/runtime/shortcuts'
import { PageHeading } from '@shared/ui/PageHeading'
import { Panel } from '@shared/ui/Panel'
import { matchesQuery } from '@shared/utils/search'
import { paperIngestUri } from '@lib/lxmf-api'

import { useFiles } from '../hooks/useFiles'
import {
  clearAttachmentPreviewCache,
  getAttachmentPreviewCacheStats,
  getOrCreateAttachmentPreviewBlob,
} from '../services/attachmentPreviewCache'
import { fetchFileAttachmentBytes, openFileAttachmentHandle } from '../services/filesService'

export function FilesPage() {
  const { files, loading, error, refresh } = useFiles()
  const [query, setQuery] = useState('')
  const [paperUriInput, setPaperUriInput] = useState('')
  const [paperWorking, setPaperWorking] = useState(false)
  const [paperFeedback, setPaperFeedback] = useState<string | null>(null)
  const [fileFeedback, setFileFeedback] = useState<string | null>(null)
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [cacheStats, setCacheStats] = useState(() => getAttachmentPreviewCacheStats())
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const filteredFiles = useMemo(
    () =>
      files.filter(file => matchesQuery(query, [file.name, file.kind, file.owner, file.sizeLabel])),
    [files, query]
  )

  useEffect(() => {
    const onFocusSearch = () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    }
  }, [])

  return (
    <Panel className="flex h-full min-h-0 flex-col">
      <PageHeading
        title="Files"
        subtitle="Shared files and notes"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setFileFeedback(null)
                void refresh()
              }}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Refresh
            </button>
            <button
              onClick={() => {
                clearAttachmentPreviewCache()
                setCacheStats(getAttachmentPreviewCacheStats())
                setFileFeedback('Attachment preview cache cleared.')
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Clear cache
            </button>
          </div>
        }
      />
      <input
        ref={searchInputRef}
        value={query}
        onChange={event => setQuery(event.target.value)}
        className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
        placeholder="Search files, notes, owner, or type"
      />
      <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-semibold tracking-wide text-amber-700 uppercase">
          Paper Message
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Paste an <span className="font-mono">lxm://...</span> URI to ingest a paper message.
        </p>
        <textarea
          value={paperUriInput}
          onChange={event => {
            setPaperUriInput(event.target.value)
            setPaperFeedback(null)
          }}
          rows={2}
          className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-slate-800 transition outline-none focus:border-amber-300"
          placeholder="lxm://..."
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  if (text.trim()) {
                    setPaperUriInput(text.trim())
                    setPaperFeedback(null)
                  }
                } catch (clipboardError) {
                  setPaperFeedback(
                    clipboardError instanceof Error
                      ? clipboardError.message
                      : String(clipboardError)
                  )
                }
              })()
            }}
            className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            Paste
          </button>
          <button
            type="button"
            disabled={paperWorking}
            onClick={() => {
              void (async () => {
                const uri = paperUriInput.trim()
                if (!uri) {
                  setPaperFeedback('Paste an lxm:// URI first.')
                  return
                }
                try {
                  setPaperWorking(true)
                  await paperIngestUri(uri)
                  setPaperFeedback('Paper message ingested.')
                  setPaperUriInput('')
                  await refresh()
                } catch (ingestError) {
                  setPaperFeedback(
                    ingestError instanceof Error ? ingestError.message : String(ingestError)
                  )
                } finally {
                  setPaperWorking(false)
                }
              })()
            }}
            className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
          >
            {paperWorking ? 'Importing...' : 'Import'}
          </button>
        </div>
        {paperFeedback ? <p className="mt-2 text-xs text-slate-700">{paperFeedback}</p> : null}
      </div>
      {loading ? <p className="text-sm text-slate-500">Loading files...</p> : null}
      {error ? (
        <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}
      <p className="mb-2 text-xs text-slate-500">
        Preview cache: {cacheStats.count} item(s),{' '}
        {(cacheStats.totalBytes / (1024 * 1024)).toFixed(1)} MB
      </p>
      {fileFeedback ? (
        <p className="mb-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">
          {fileFeedback}
        </p>
      ) : null}
      {!loading && files.length === 0 ? (
        <p className="text-sm text-slate-500">
          No attachments or paper notes have been received yet.
        </p>
      ) : null}
      {!loading && files.length > 0 && filteredFiles.length === 0 ? (
        <p className="text-sm text-slate-500">No files match your search.</p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <ul className="space-y-2">
          {filteredFiles.map(file => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    if (file.kind === 'Note') {
                      if (file.paperUri) {
                        await navigator.clipboard.writeText(file.paperUri)
                        setFileFeedback('Paper URI copied to clipboard.')
                      }
                      return
                    }
                    try {
                      setActiveFileId(file.id)
                      setFileFeedback(null)
                      try {
                        const opened = await openFileAttachmentHandle(file, 'download')
                        const anchor = document.createElement('a')
                        anchor.href = opened.url
                        anchor.download = file.name
                        anchor.click()
                        window.setTimeout(() => {
                          void opened.close()
                        }, 30_000)
                      } catch {
                        const bytes = await fetchFileAttachmentBytes(file)
                        const preview = await getOrCreateAttachmentPreviewBlob({
                          key: file.id,
                          mime: bytes.mime,
                          dataBase64: bytes.dataBase64,
                        })
                        const anchor = document.createElement('a')
                        anchor.href = preview.objectUrl
                        anchor.download = file.name
                        anchor.click()
                      }
                    } catch (fileError) {
                      setFileFeedback(
                        fileError instanceof Error ? fileError.message : String(fileError)
                      )
                    } finally {
                      setActiveFileId(null)
                      setCacheStats(getAttachmentPreviewCacheStats())
                    }
                  })()
                }}
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
                    {activeFileId === file.id ? 'Loading...' : 'Open'}
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
