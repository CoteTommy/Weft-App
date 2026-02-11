import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'
import { useSettings } from '../state/useSettings'

export function SettingsPage() {
  const { settings, loading, error, refresh } = useSettings()

  return (
    <Panel>
      <PageHeading
        title="Settings"
        subtitle="Profile, notifications, and connection"
        action={
          <button
            onClick={() => {
              void refresh()
            }}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            Refresh
          </button>
        }
      />

      {loading ? <p className="text-sm text-slate-500">Loading settings...</p> : null}
      {error ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

      {settings ? (
        <>
          <div className="space-y-3">
            <SettingsRow label="Display name" value={settings.displayName} />
            <SettingsRow label="Connection" value={settings.connection} />
            <SettingsRow label="Export backup" value={settings.backupStatus} />
          </div>

          <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Advanced</summary>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>RPC Endpoint: {settings.rpcEndpoint}</p>
              <p>Profile Path: {settings.profile}</p>
              <p>Peers</p>
              <p>Interfaces</p>
              <p>Announces</p>
              <p>Diagnostics</p>
            </div>
          </details>
        </>
      ) : null}
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
