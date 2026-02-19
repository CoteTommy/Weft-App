import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { SettingsSection } from '../types'
import { parseSettingsSection } from '../utils'

type UseSettingsSectionNavigationResult = {
  activeSection: SettingsSection
  selectSection: (section: SettingsSection) => void
}

export function useSettingsSectionNavigation(): UseSettingsSectionNavigationResult {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSection = parseSettingsSection(searchParams.get('section'))

  const selectSection = useCallback(
    (section: SettingsSection) => {
      const next = new URLSearchParams(searchParams)
      next.set('section', section)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  return {
    activeSection,
    selectSection,
  }
}
