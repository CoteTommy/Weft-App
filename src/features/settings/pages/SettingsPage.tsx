import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'

export function SettingsPage() {
  return (
    <Panel>
      <PageHeading title="Settings" subtitle="Profile, notifications, and connection" />

      <div className="space-y-3">
        <SettingsRow label="Display name" value="You" />
        <SettingsRow label="Connection" value="Connected" />
        <SettingsRow label="Export backup" value="Available" />
      </div>

      <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Advanced</summary>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <p>Peers</p>
          <p>Interfaces</p>
          <p>Announces</p>
          <p>Diagnostics</p>
        </div>
      </details>
    </Panel>
  )
}

interface SettingsRowProps {
  label: string
  value: string
}

function SettingsRow({ label, value }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}
