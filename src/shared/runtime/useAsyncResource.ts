import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncResourceState<TData> {
  data: TData
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useAsyncResource<TData>(
  loader: () => Promise<TData>,
  initialData: TData
): AsyncResourceState<TData> {
  const [data, setData] = useState<TData>(initialData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    const requestId = ++requestIdRef.current
    setError(null)
    try {
      const next = await loader()
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return
      }
      setData(next)
    } catch (loadError) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return
      }
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [loader])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    data,
    loading,
    error,
    refresh,
  }
}
