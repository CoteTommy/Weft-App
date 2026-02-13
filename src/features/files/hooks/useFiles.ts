import { useAsyncResource } from '@shared/runtime/useAsyncResource'
import type { FileItem } from '@shared/types/files'

import { fetchFiles } from '../services/filesService'

interface UseFilesState {
  files: FileItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useFiles(): UseFilesState {
  const { data: files, loading, error, refresh } = useAsyncResource<FileItem[]>(fetchFiles, [])

  return {
    files,
    loading,
    error,
    refresh,
  }
}
