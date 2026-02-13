import { useCallback, useEffect, useState } from 'react'

import type { SettingsSnapshot } from '@shared/types/settings'

import { fetchSettingsSnapshot } from '../services/settingsService'

interface UseSettingsState {
  settings: SettingsSnapshot | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useSettings(): UseSettingsState {
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const snapshot = await fetchSettingsSnapshot()
      setSettings(snapshot)
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
    settings,
    loading,
    error,
    refresh,
  }
}
