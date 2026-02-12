import { useEffect, useState } from 'react'
import type { ConnectivityMode } from '../../../shared/runtime/preferences'
import type { SettingsSnapshot } from '../../../shared/types/settings'
import { Panel } from '../../../shared/ui/Panel'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { shortHash } from '../../../shared/utils/identity'
import {
  saveConnectivitySettings,
  saveDisplayName,
  saveNotificationSettings,
} from '../services/settingsService'
import { useSettings } from '../state/useSettings'

const CONNECTIVITY_OPTIONS: Array<{ value: ConnectivityMode; label: string }> = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'local_only', label: 'Local only' },
  { value: 'lan_shared', label: 'LAN shared' },
  { value: 'custom', label: 'Custom' },
]

const DEFAULT_NOTIFICATION_SETTINGS: SettingsSnapshot['notifications'] = {
  desktopEnabled: true,
  inAppEnabled: true,
  messageEnabled: true,
  systemEnabled: true,
  connectionEnabled: true,
  soundEnabled: false,
}

interface SettingsConfigPayload {
  mode?: ConnectivityMode
  profile?: string
  rpc?: string
  transport?: string
  autoStartDaemon?: boolean
  notificationsEnabled?: boolean
  notifications?: Partial<SettingsSnapshot['notifications']>
}

interface BackupPayload {
  schema?: string
  displayName?: string
  connectivity?: {
    mode?: ConnectivityMode
    profile?: string
    rpc?: string
    transport?: string
    autoStartDaemon?: boolean
    notificationsEnabled?: boolean
  }
  notifications?: Partial<SettingsSnapshot['notifications']>
}

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
  const [notificationSettings, setNotificationSettings] = useState<SettingsSnapshot['notifications']>(
    DEFAULT_NOTIFICATION_SETTINGS,
  )
  const [configPayload, setConfigPayload] = useState('')
  const [backupWorking, setBackupWorking] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) {
      return
    }
    setDisplayNameDraft(settings.displayName)
    setConnectivityMode(settings.connectivity.mode)
    setProfileDraft(settings.connectivity.profile ?? 'default')
    setRpcDraft(settings.connectivity.rpc ?? '')
    setTransportDraft(settings.connectivity.transport ?? '')
    setAutoStartDaemon(settings.connectivity.autoStartDaemon)
    setNotificationSettings(settings.notifications)
    setConfigPayload(
      JSON.stringify(
        buildConfigPayload({
          mode: settings.connectivity.mode,
          profile: settings.connectivity.profile ?? 'default',
          rpc: settings.connectivity.rpc ?? '',
          transport: settings.connectivity.transport ?? '',
          autoStartDaemon: settings.connectivity.autoStartDaemon,
          notifications: settings.notifications,
        }),
        null,
        2,
      ),
    )
  }, [settings])

  const updateNotifications = (
    patch: Partial<SettingsSnapshot['notifications']>,
    feedback = 'Notification settings updated.',
  ) => {
    const next = { ...notificationSettings, ...patch }
    setNotificationSettings(next)
    saveNotificationSettings(next)
    setSaveFeedback(feedback)
  }

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
              <p className="text-sm font-medium text-slate-700">Notifications</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <NotificationToggle
                  label="Desktop alerts"
                  description="Show native desktop alerts for incoming messages."
                  checked={notificationSettings.desktopEnabled}
                  onChange={(next) => {
                    updateNotifications(
                      { desktopEnabled: next },
                      next ? 'Desktop alerts enabled.' : 'Desktop alerts disabled.',
                    )
                  }}
                />
                <NotificationToggle
                  label="In-app inbox"
                  description="Store notifications in the top-right notification center."
                  checked={notificationSettings.inAppEnabled}
                  onChange={(next) => {
                    updateNotifications(
                      { inAppEnabled: next },
                      next ? 'In-app notifications enabled.' : 'In-app notifications disabled.',
                    )
                  }}
                />
                <NotificationToggle
                  label="Message notifications"
                  description="Notify on new incoming messages."
                  checked={notificationSettings.messageEnabled}
                  onChange={(next) => {
                    updateNotifications(
                      { messageEnabled: next },
                      next ? 'Message notifications enabled.' : 'Message notifications disabled.',
                    )
                  }}
                />
                <NotificationToggle
                  label="System notifications"
                  description="Notify on internal errors and send failures."
                  checked={notificationSettings.systemEnabled}
                  onChange={(next) => {
                    updateNotifications(
                      { systemEnabled: next },
                      next ? 'System notifications enabled.' : 'System notifications disabled.',
                    )
                  }}
                />
                <NotificationToggle
                  label="Connection notifications"
                  description="Notify when daemon/RPC connection changes."
                  checked={notificationSettings.connectionEnabled}
                  onChange={(next) => {
                    updateNotifications(
                      { connectionEnabled: next },
                      next ? 'Connection notifications enabled.' : 'Connection notifications disabled.',
                    )
                  }}
                />
                <NotificationToggle
                  label="Sound cues"
                  description="Play a subtle sound for each new in-app notification."
                  checked={notificationSettings.soundEnabled}
                  onChange={(next) => {
                    updateNotifications(
                      { soundEnabled: next },
                      next ? 'Notification sound enabled.' : 'Notification sound disabled.',
                    )
                  }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-slate-700">Config import/export</p>
              <textarea
                value={configPayload}
                onChange={(event) => setConfigPayload(event.target.value)}
                rows={8}
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
                        const parsed = JSON.parse(configPayload) as SettingsConfigPayload
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
                        const mergedNotifications = mergeNotificationSettings(
                          notificationSettings,
                          parsed.notifications,
                          parsed.notificationsEnabled,
                        )
                        saveNotificationSettings(mergedNotifications)
                        setNotificationSettings(mergedNotifications)
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

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-sm font-medium text-slate-700">Backup and Restore</p>
              <p className="mt-1 text-xs text-slate-600">
                Export your Weft app identity settings and connectivity profile, then restore on
                another machine.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={backupWorking}
                  onClick={() => {
                    const payload: BackupPayload = {
                      schema: 'weft-backup-v1',
                      displayName: displayNameDraft.trim(),
                      connectivity: {
                        mode: connectivityMode,
                        profile: profileDraft.trim() || 'default',
                        rpc: rpcDraft.trim() || '',
                        transport: transportDraft.trim() || '',
                        autoStartDaemon,
                      },
                      notifications: notificationSettings,
                    }
                    const blob = new Blob([JSON.stringify(payload, null, 2)], {
                      type: 'application/json',
                    })
                    const url = URL.createObjectURL(blob)
                    const anchor = document.createElement('a')
                    anchor.href = url
                    anchor.download = `weft-backup-${Date.now()}.json`
                    anchor.click()
                    URL.revokeObjectURL(url)
                    setSaveFeedback('Backup exported.')
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Export backup
                </button>
                <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                  Import backup
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (!file) {
                        return
                      }
                      void (async () => {
                        try {
                          setBackupWorking(true)
                          const text = await file.text()
                          const parsed = JSON.parse(text) as BackupPayload
                          if (parsed.schema !== 'weft-backup-v1') {
                            throw new Error('Unsupported backup schema.')
                          }
                          if (parsed.displayName !== undefined) {
                            setDisplayNameDraft(parsed.displayName)
                            await saveDisplayName(parsed.displayName)
                          }
                          const connectivity = parsed.connectivity
                          if (connectivity?.mode) {
                            await saveConnectivitySettings({
                              mode: connectivity.mode,
                              profile: connectivity.profile,
                              rpc: connectivity.rpc,
                              transport: connectivity.transport,
                              autoStartDaemon: connectivity.autoStartDaemon ?? true,
                              restartDaemon: false,
                            })
                          }
                          const mergedNotifications = mergeNotificationSettings(
                            notificationSettings,
                            parsed.notifications,
                            parsed.connectivity?.notificationsEnabled,
                          )
                          saveNotificationSettings(mergedNotifications)
                          setNotificationSettings(mergedNotifications)
                          await refresh()
                          setSaveFeedback('Backup imported.')
                        } catch (importError) {
                          setSaveFeedback(
                            importError instanceof Error ? importError.message : String(importError),
                          )
                        } finally {
                          setBackupWorking(false)
                          event.target.value = ''
                        }
                      })()
                    }}
                  />
                </label>
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

interface NotificationToggleProps {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}

function NotificationToggle({ label, description, checked, onChange }: NotificationToggleProps) {
  return (
    <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked)
        }}
        className="mt-0.5"
      />
      <span>
        <span className="block font-medium text-slate-800">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
    </label>
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

function buildConfigPayload(input: {
  mode: ConnectivityMode
  profile: string
  rpc: string
  transport: string
  autoStartDaemon: boolean
  notifications: SettingsSnapshot['notifications']
}): SettingsConfigPayload {
  return {
    mode: input.mode,
    profile: input.profile,
    rpc: input.rpc,
    transport: input.transport,
    autoStartDaemon: input.autoStartDaemon,
    notifications: input.notifications,
  }
}

function mergeNotificationSettings(
  current: SettingsSnapshot['notifications'],
  patch?: Partial<SettingsSnapshot['notifications']>,
  legacyDesktopEnabled?: boolean,
): SettingsSnapshot['notifications'] {
  return {
    ...current,
    ...(patch ?? {}),
    ...(typeof legacyDesktopEnabled === 'boolean' ? { desktopEnabled: legacyDesktopEnabled } : {}),
  }
}
