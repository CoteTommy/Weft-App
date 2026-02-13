import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import clsx from 'clsx'

import type { ConnectivityMode, MotionPreference } from '@shared/runtime/preferences'
import type { SettingsSnapshot } from '@shared/types/settings'
import { PageHeading } from '@shared/ui/PageHeading'
import { Panel } from '@shared/ui/Panel'
import { shortHash } from '@shared/utils/identity'

import { InteropHealthCard } from '../components/InteropHealthCard'
import { NotificationToggle } from '../components/NotificationToggle'
import { OutboundPropagationRelayCard } from '../components/OutboundPropagationRelayCard'
import { SettingsRow } from '../components/SettingsRow'
import { CONNECTIVITY_OPTIONS, DEFAULT_NOTIFICATION_SETTINGS, SETTINGS_SECTIONS } from '../constants'
import {
  saveConnectivitySettings,
  saveDesktopShellSettings,
  saveDisplayName,
  saveFeatureSettings,
  saveNotificationSettings,
  saveOutboundPropagationNode,
  savePerformanceSettings,
} from '../services/settingsService'
import { useSettings } from '../hooks/useSettings'
import type { BackupPayload, SettingsConfigPayload } from '../types'
import { buildConfigPayload, mergeNotificationSettings, parseSettingsSection } from '../utils'

export function SettingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { settings, loading, error, refresh } = useSettings()
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [savingConnectivity, setSavingConnectivity] = useState(false)
  const [connectivityMode, setConnectivityMode] = useState<ConnectivityMode>('automatic')
  const [profileDraft, setProfileDraft] = useState('')
  const [rpcDraft, setRpcDraft] = useState('')
  const [transportDraft, setTransportDraft] = useState('')
  const [autoStartDaemon, setAutoStartDaemon] = useState(true)
  const [restartAfterSave, setRestartAfterSave] = useState(false)
  const [propagationPeerDraft, setPropagationPeerDraft] = useState('')
  const [savingPropagationPeer, setSavingPropagationPeer] = useState(false)
  const [notificationSettings, setNotificationSettings] = useState<SettingsSnapshot['notifications']>(
    DEFAULT_NOTIFICATION_SETTINGS,
  )
  const [motionPreference, setMotionPreference] = useState<MotionPreference>('snappy')
  const [performanceHudEnabled, setPerformanceHudEnabled] = useState(false)
  const [minimizeToTrayOnClose, setMinimizeToTrayOnClose] = useState(true)
  const [startInTray, setStartInTray] = useState(false)
  const [singleInstanceFocus, setSingleInstanceFocus] = useState(true)
  const [notificationsMuted, setNotificationsMuted] = useState(false)
  const [commandCenterEnabled, setCommandCenterEnabled] = useState(false)
  const [configPayload, setConfigPayload] = useState('')
  const [backupWorking, setBackupWorking] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) {
      return
    }
    setDisplayNameDraft(settings.displayName)
    setConnectivityMode(settings.connectivity.mode)
    setProfileDraft(settings.connectivity.profile ?? '')
    setRpcDraft(settings.connectivity.rpc ?? '')
    setTransportDraft(settings.connectivity.transport ?? '')
    setAutoStartDaemon(settings.connectivity.autoStartDaemon)
    setPropagationPeerDraft(settings.connectivity.outboundPropagationPeer ?? '')
    setNotificationSettings(settings.notifications)
    setMotionPreference(settings.performance.motionPreference)
    setPerformanceHudEnabled(settings.performance.hudEnabled)
    setMinimizeToTrayOnClose(settings.desktop.minimizeToTrayOnClose)
    setStartInTray(settings.desktop.startInTray)
    setSingleInstanceFocus(settings.desktop.singleInstanceFocus)
    setNotificationsMuted(settings.desktop.notificationsMuted)
    setCommandCenterEnabled(settings.features.commandCenterEnabled)
    setConfigPayload(
      JSON.stringify(
        buildConfigPayload({
          mode: settings.connectivity.mode,
          profile: settings.connectivity.profile ?? '',
          rpc: settings.connectivity.rpc ?? '',
          transport: settings.connectivity.transport ?? '',
          autoStartDaemon: settings.connectivity.autoStartDaemon,
          notifications: settings.notifications,
          performance: settings.performance,
          desktop: settings.desktop,
          features: settings.features,
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

  const updatePerformance = (patch: Partial<SettingsSnapshot['performance']>, feedback: string) => {
    const next = {
      motionPreference,
      hudEnabled: performanceHudEnabled,
      ...patch,
    }
    setMotionPreference(next.motionPreference)
    setPerformanceHudEnabled(next.hudEnabled)
    savePerformanceSettings(next)
    setSaveFeedback(feedback)
  }

  const updateFeatures = (patch: Partial<SettingsSnapshot['features']>, feedback: string) => {
    const next = {
      commandCenterEnabled,
      ...patch,
    }
    setCommandCenterEnabled(next.commandCenterEnabled)
    saveFeatureSettings(next)
    setSaveFeedback(feedback)
  }

  const updateDesktop = (
    patch: Partial<SettingsSnapshot['desktop']>,
    feedback: string,
  ) => {
    const localNext = {
      minimizeToTrayOnClose,
      startInTray,
      singleInstanceFocus,
      notificationsMuted,
      ...patch,
    }
    setMinimizeToTrayOnClose(localNext.minimizeToTrayOnClose)
    setStartInTray(localNext.startInTray)
    setSingleInstanceFocus(localNext.singleInstanceFocus)
    setNotificationsMuted(localNext.notificationsMuted)
    setSaveFeedback(feedback)
    void saveDesktopShellSettings(localNext)
      .then((saved) => {
        setMinimizeToTrayOnClose(saved.minimizeToTrayOnClose)
        setStartInTray(saved.startInTray)
        setSingleInstanceFocus(saved.singleInstanceFocus)
        setNotificationsMuted(saved.notificationsMuted)
      })
      .catch((desktopError) => {
        setSaveFeedback(
          desktopError instanceof Error ? desktopError.message : String(desktopError),
        )
      })
  }

  const activeSection = parseSettingsSection(searchParams.get('section'))

  return (
    <Panel className="flex h-full min-h-0 flex-col overflow-hidden">
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
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? <p className="text-sm text-slate-500">Loading settings...</p> : null}
        {error ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

        {settings ? (
          <>
            <div className="sticky top-0 z-20 mb-3 rounded-xl border border-slate-200 bg-white/95 p-2 backdrop-blur">
              <div className="flex flex-wrap gap-2">
                {SETTINGS_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams)
                      next.set('section', section.id)
                      setSearchParams(next, { replace: true })
                    }}
                    className={clsx(
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                      activeSection === section.id
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            {saveFeedback ? (
              <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {saveFeedback}
              </p>
            ) : null}

            <div className="space-y-3 pb-2">
              {activeSection === 'profile' ? (
                <>
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
                  </form>

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
                </>
              ) : null}

              {activeSection === 'connectivity' ? (
                <>
                  <SettingsRow label="Connection" value={settings.connection} />
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

                  <OutboundPropagationRelayCard
                    settings={settings}
                    propagationPeerDraft={propagationPeerDraft}
                    savingPropagationPeer={savingPropagationPeer}
                    onPropagationPeerDraftChange={setPropagationPeerDraft}
                    onSaveRelay={() => {
                      void (async () => {
                        setSavingPropagationPeer(true)
                        setSaveFeedback(null)
                        try {
                          const peer = await saveOutboundPropagationNode({
                            peer: propagationPeerDraft || null,
                            profile: profileDraft,
                            rpc: rpcDraft,
                          })
                          await refresh()
                          setSaveFeedback(
                            peer
                              ? `Propagation relay set to ${shortHash(peer, 8)}.`
                              : 'Propagation relay cleared.',
                          )
                        } catch (saveError) {
                          setSaveFeedback(saveError instanceof Error ? saveError.message : String(saveError))
                        } finally {
                          setSavingPropagationPeer(false)
                        }
                      })()
                    }}
                    onClearRelay={() => {
                      void (async () => {
                        setSavingPropagationPeer(true)
                        setSaveFeedback(null)
                        try {
                          await saveOutboundPropagationNode({
                            peer: null,
                            profile: profileDraft,
                            rpc: rpcDraft,
                          })
                          setPropagationPeerDraft('')
                          await refresh()
                          setSaveFeedback('Propagation relay cleared.')
                        } catch (saveError) {
                          setSaveFeedback(saveError instanceof Error ? saveError.message : String(saveError))
                        } finally {
                          setSavingPropagationPeer(false)
                        }
                      })()
                    }}
                    onRefreshNodes={() => {
                      void refresh()
                    }}
                  />
                </>
              ) : null}

              {activeSection === 'notifications' ? (
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
              ) : null}

              {activeSection === 'data' ? (
                <>
                  <SettingsRow label="Export backup" value={settings.backupStatus} />
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
                              if (parsed.performance) {
                                savePerformanceSettings(parsed.performance)
                                if (parsed.performance.motionPreference) {
                                  setMotionPreference(parsed.performance.motionPreference)
                                }
                                if (typeof parsed.performance.hudEnabled === 'boolean') {
                                  setPerformanceHudEnabled(parsed.performance.hudEnabled)
                                }
                              }
                              if (parsed.desktop) {
                                const savedDesktop = await saveDesktopShellSettings(parsed.desktop)
                                setMinimizeToTrayOnClose(savedDesktop.minimizeToTrayOnClose)
                                setStartInTray(savedDesktop.startInTray)
                                setSingleInstanceFocus(savedDesktop.singleInstanceFocus)
                                setNotificationsMuted(savedDesktop.notificationsMuted)
                              }
                              if (parsed.features) {
                                saveFeatureSettings(parsed.features)
                                if (typeof parsed.features.commandCenterEnabled === 'boolean') {
                                  setCommandCenterEnabled(parsed.features.commandCenterEnabled)
                                }
                              }
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
                              profile: profileDraft.trim() || undefined,
                              rpc: rpcDraft.trim() || '',
                              transport: transportDraft.trim() || '',
                              autoStartDaemon,
                            },
                            notifications: notificationSettings,
                            performance: {
                              motionPreference,
                              hudEnabled: performanceHudEnabled,
                            },
                            desktop: {
                              minimizeToTrayOnClose,
                              startInTray,
                              singleInstanceFocus,
                              notificationsMuted,
                            },
                            features: {
                              commandCenterEnabled,
                            },
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
                                if (parsed.performance) {
                                  savePerformanceSettings(parsed.performance)
                                  if (parsed.performance.motionPreference) {
                                    setMotionPreference(parsed.performance.motionPreference)
                                  }
                                  if (typeof parsed.performance.hudEnabled === 'boolean') {
                                    setPerformanceHudEnabled(parsed.performance.hudEnabled)
                                  }
                                }
                                if (parsed.desktop) {
                                  const savedDesktop = await saveDesktopShellSettings(parsed.desktop)
                                  setMinimizeToTrayOnClose(savedDesktop.minimizeToTrayOnClose)
                                  setStartInTray(savedDesktop.startInTray)
                                  setSingleInstanceFocus(savedDesktop.singleInstanceFocus)
                                  setNotificationsMuted(savedDesktop.notificationsMuted)
                                }
                                if (parsed.features) {
                                  saveFeatureSettings(parsed.features)
                                  if (typeof parsed.features.commandCenterEnabled === 'boolean') {
                                    setCommandCenterEnabled(parsed.features.commandCenterEnabled)
                                  }
                                }
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
                </>
              ) : null}

              {activeSection === 'advanced' ? (
                <div className="space-y-3">
                  <InteropHealthCard
                    interop={settings.interop}
                    onOpenConnectivity={() => {
                      const next = new URLSearchParams(searchParams)
                      next.set('section', 'connectivity')
                      setSearchParams(next, { replace: true })
                    }}
                    onOpenChats={() => {
                      void navigate('/chats')
                    }}
                    onOpenNetwork={() => {
                      void navigate('/network')
                    }}
                  />
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-800">Runtime diagnostics</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <p>RPC Endpoint: {settings.rpcEndpoint}</p>
                      <p>Profile Path: {settings.profile}</p>
                      <p>Identity Hash: {settings.identityHash ?? 'n/a'}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-800">Desktop shell</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Tray behavior, startup mode, single-instance handoff, and notification mute.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={minimizeToTrayOnClose}
                          onChange={(event) => {
                            const next = event.target.checked
                            updateDesktop(
                              { minimizeToTrayOnClose: next },
                              next
                                ? 'Closing window now minimizes to tray.'
                                : 'Closing window now exits the app.',
                            )
                          }}
                        />
                        Minimize to tray on close
                      </label>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={startInTray}
                          onChange={(event) => {
                            const next = event.target.checked
                            updateDesktop(
                              { startInTray: next },
                              next
                                ? 'App will start hidden in tray.'
                                : 'App will open window on startup.',
                            )
                          }}
                        />
                        Start in tray
                      </label>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={singleInstanceFocus}
                          onChange={(event) => {
                            const next = event.target.checked
                            updateDesktop(
                              { singleInstanceFocus: next },
                              next
                                ? 'Secondary launches will focus the existing window.'
                                : 'Secondary launches will forward payloads without forcing focus.',
                            )
                          }}
                        />
                        Focus window on second launch
                      </label>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={notificationsMuted}
                          onChange={(event) => {
                            const next = event.target.checked
                            updateDesktop(
                              { notificationsMuted: next },
                              next
                                ? 'Notifications muted at desktop shell level.'
                                : 'Notifications unmuted.',
                            )
                          }}
                        />
                        Tray mute notifications
                      </label>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      <p>Platform: {settings.desktop.platform}</p>
                      <p>System appearance: {settings.desktop.appearance}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-800">Performance</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-slate-600">
                        Motion quality
                        <select
                          value={motionPreference}
                          onChange={(event) => {
                            const next = event.target.value as MotionPreference
                            updatePerformance(
                              { motionPreference: next },
                              `Motion quality set to ${next}.`,
                            )
                          }}
                          className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-300"
                        >
                          <option value="smooth">Smooth</option>
                          <option value="snappy">Snappy</option>
                          <option value="off">Off</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={performanceHudEnabled}
                          onChange={(event) => {
                            updatePerformance(
                              { hudEnabled: event.target.checked },
                              event.target.checked
                                ? 'Performance HUD enabled.'
                                : 'Performance HUD disabled.',
                            )
                          }}
                        />
                        Show FPS HUD
                      </label>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-800">Features</p>
                    <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={commandCenterEnabled}
                        onChange={(event) => {
                          updateFeatures(
                            { commandCenterEnabled: event.target.checked },
                            event.target.checked
                              ? 'Command Center enabled.'
                              : 'Command Center hidden.',
                          )
                        }}
                      />
                      Enable Command Center page (advanced)
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  )
}
