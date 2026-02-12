import { useEffect, useState } from 'react'
import { shortHash } from '../../../shared/utils/identity'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'
import type { ConnectivityMode } from '../../../shared/runtime/preferences'
import { saveConnectivitySettings, saveDisplayName } from '../services/settingsService'
import { useSettings } from '../state/useSettings'

const CONNECTIVITY_OPTIONS: Array<{ value: ConnectivityMode; label: string }> = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'local_only', label: 'Local only' },
  { value: 'lan_shared', label: 'LAN shared' },
  { value: 'custom', label: 'Custom' },
]

export function SettingsPage() {
  const { settings, loading, error, refresh } = useSettings()
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingConnectivity, setSavingConnectivity] = useState(false)
  const [connectivityMode, setConnectivityMode] = useState<ConnectivityMode>('automatic')
  const [profileDraft, setProfileDraft] = useState('default')
  const [rpcDraft, setRpcDraft] = useState('')
  const [transportDraft, setTransportDraft] = useState('')
  const [autoStartDaemon, setAutoStartDaemon] = useState(true)
  const [restartAfterSave, setRestartAfterSave] = useState(false)
  const [configPayload, setConfigPayload] = useState('')
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (settings) {
      setDisplayNameDraft(settings.displayName)
      setConnectivityMode(settings.connectivity.mode)
      setProfileDraft(settings.connectivity.profile ?? 'default')
      setRpcDraft(settings.connectivity.rpc ?? '')
      setTransportDraft(settings.connectivity.transport ?? '')
      setAutoStartDaemon(settings.connectivity.autoStartDaemon)
      setConfigPayload(
        JSON.stringify(
          {
            mode: settings.connectivity.mode,
            profile: settings.connectivity.profile ?? 'default',
            rpc: settings.connectivity.rpc ?? '',
            transport: settings.connectivity.transport ?? '',
            autoStartDaemon: settings.connectivity.autoStartDaemon,
          },
          null,
          2,
        ),
      )
    }
  }, [settings])

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
            <form
              className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              onSubmit={(event) => {
                event.preventDefault()
                void (async () => {
                  setSavingName(true)
                  setSaveFeedback(null)
                  try {
                    await saveDisplayName(displayNameDraft)
                    await refresh()
                    setSaveFeedback('Display name updated.')
                  } catch (saveError) {
                    setSaveFeedback(saveError instanceof Error ? saveError.message : String(saveError))
                  } finally {
                    setSavingName(false)
                  }
                })()
              }}
            >
              <p className="text-sm font-medium text-slate-700">Display name</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={displayNameDraft}
                  onChange={(event) => setDisplayNameDraft(event.target.value)}
                  className="h-10 min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-300"
                  placeholder="Set your LXMF display name"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  className="h-10 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {savingName ? 'Saving...' : 'Save'}
                </button>
              </div>
              {saveFeedback ? <p className="mt-2 text-xs text-slate-600">{saveFeedback}</p> : null}
            </form>
            <SettingsRow label="Connection" value={settings.connection} />
            <SettingsRow label="Export backup" value={settings.backupStatus} />
            <SettingsRow
              label="Identity"
              value={settings.identityHash ? shortHash(settings.identityHash, 8) : 'Unavailable'}
            />
            {settings.identityHash ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(settings.identityHash ?? '')
                  setSaveFeedback('Identity hash copied.')
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Copy identity hash
              </button>
            ) : null}
            <form
              className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              onSubmit={(event) => {
                event.preventDefault()
                void (async () => {
                  setSavingConnectivity(true)
                  setSaveFeedback(null)
                  try {
                    await saveConnectivitySettings({
                      mode: connectivityMode,
                      profile: profileDraft,
                      rpc: rpcDraft,
                      transport: transportDraft,
                      autoStartDaemon,
                      restartDaemon: restartAfterSave,
                    })
                    await refresh()
                    setSaveFeedback(
                      restartAfterSave
                        ? 'Connectivity settings saved and daemon restarted.'
                        : 'Connectivity settings saved.',
                    )
                  } catch (saveError) {
                    setSaveFeedback(saveError instanceof Error ? saveError.message : String(saveError))
                  } finally {
                    setSavingConnectivity(false)
                  }
                })()
              }}
            >
              <p className="text-sm font-medium text-slate-700">Connectivity profile</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-600">
                  Mode
                  <select
                    value={connectivityMode}
                    onChange={(event) => setConnectivityMode(event.target.value as ConnectivityMode)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-300"
                  >
                    {CONNECTIVITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  Profile
                  <input
                    value={profileDraft}
                    onChange={(event) => setProfileDraft(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-300"
                  />
                </label>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-600">
                  RPC endpoint
                  <input
                    value={rpcDraft}
                    onChange={(event) => setRpcDraft(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-300"
                    placeholder="127.0.0.1:4242"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Transport bind
                  <input
                    value={transportDraft}
                    onChange={(event) => setTransportDraft(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-300"
                    placeholder="127.0.0.1:0"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={autoStartDaemon}
                    onChange={(event) => setAutoStartDaemon(event.target.checked)}
                  />
                  Auto-start daemon
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={restartAfterSave}
                    onChange={(event) => setRestartAfterSave(event.target.checked)}
                  />
                  Restart daemon after save
                </label>
                <button
                  type="submit"
                  disabled={savingConnectivity}
                  className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {savingConnectivity ? 'Saving...' : 'Save connectivity'}
                </button>
              </div>
            </form>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-slate-700">Config import/export</p>
              <textarea
                value={configPayload}
                onChange={(event) => setConfigPayload(event.target.value)}
                rows={7}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 outline-none transition focus:border-blue-300"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(configPayload)
                    setSaveFeedback('Configuration JSON copied.')
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      try {
                        const parsed = JSON.parse(configPayload) as {
                          mode?: ConnectivityMode
                          profile?: string
                          rpc?: string
                          transport?: string
                          autoStartDaemon?: boolean
                        }
                        if (!parsed.mode) {
                          throw new Error('mode is required in config JSON')
                        }
                        await saveConnectivitySettings({
                          mode: parsed.mode,
                          profile: parsed.profile,
                          rpc: parsed.rpc,
                          transport: parsed.transport,
                          autoStartDaemon: parsed.autoStartDaemon ?? true,
                          restartDaemon: false,
                        })
                        await refresh()
                        setSaveFeedback('Configuration imported.')
                      } catch (importError) {
                        setSaveFeedback(
                          importError instanceof Error ? importError.message : String(importError),
                        )
                      }
                    })()
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Import JSON
                </button>
              </div>
            </div>
          </div>

          <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Advanced</summary>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>RPC Endpoint: {settings.rpcEndpoint}</p>
              <p>Profile Path: {settings.profile}</p>
              <p>Identity Hash: {settings.identityHash ?? 'n/a'}</p>
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
