import { useAsyncResource } from '@shared/runtime/useAsyncResource'
import type { PersonItem } from '@shared/types/people'

import { fetchPeople } from '../services/peopleService'

interface UsePeopleState {
  people: PersonItem[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function usePeople(): UsePeopleState {
  const { data: people, loading, error, refresh } = useAsyncResource<PersonItem[]>(fetchPeople, [])

  return {
    people,
    loading,
    error,
    refresh,
  }
}
