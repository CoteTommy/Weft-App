import { useCallback, useEffect, useState } from 'react'
import type { PersonItem } from '@shared/types/people'
import { fetchPeople } from '../services/peopleService'

interface UsePeopleState {
  people: PersonItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function usePeople(): UsePeopleState {
  const [people, setPeople] = useState<PersonItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const items = await fetchPeople()
      setPeople(items)
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
    people,
    loading,
    error,
    refresh,
  }
}
