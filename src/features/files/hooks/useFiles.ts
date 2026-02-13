import { useCallback, useEffect, useState } from 'react'

import type { FileItem } from '@shared/types/files'

import { fetchFiles } from '../services/filesService'

interface UseFilesState {
  files: FileItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useFiles(): UseFilesState {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const items = await fetchFiles()
      setFiles(items)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    files,
    loading,
    error,
    refresh,
  }
}
