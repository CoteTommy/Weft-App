import clsx from 'clsx'

import { SETTINGS_SECTIONS } from '../constants'
import type { SettingsSection } from '../types'

type SettingsSectionTabsProps = {
  activeSection: SettingsSection
  onSelect: (section: SettingsSection) => void
}

export function SettingsSectionTabs({ activeSection, onSelect }: SettingsSectionTabsProps) {
  return (
    <div className="sticky top-0 z-20 mb-3 rounded-xl border border-slate-200 bg-white/95 p-2 backdrop-blur">
      <div className="flex flex-wrap gap-2">
        {SETTINGS_SECTIONS.map(section => (
          <button
            key={section.id}
            type="button"
            onClick={() => {
              onSelect(section.id)
            }}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
              activeSection === section.id
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
            )}
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  )
}
