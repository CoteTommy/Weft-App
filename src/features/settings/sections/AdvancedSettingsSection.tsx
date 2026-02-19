import type { AttachmentPreviewMode, MotionPreference } from '@shared/runtime/preferences'
import type { SettingsSnapshot } from '@shared/types/settings'

import { InteropHealthCard } from '../components/InteropHealthCard'
import { refreshRuntimeMetrics, runSettingsMaintenance } from '../services/settingsService'

interface AdvancedSettingsSectionProps {
  settings: SettingsSnapshot
  motionPreference: MotionPreference
  performanceHudEnabled: boolean
  threadPageSize: number
  messagePageSize: number
  attachmentPreviewMode: AttachmentPreviewMode
  runtimeMetrics: SettingsSnapshot['performance']['runtimeMetrics']
  commandCenterEnabled: boolean
  minimizeToTrayOnClose: boolean
  startInTray: boolean
  singleInstanceFocus: boolean
  notificationsMuted: boolean
  onOpenConnectivity: () => void
  onOpenChats: () => void
  onOpenNetwork: () => void
  onUpdateDesktop: (patch: Partial<SettingsSnapshot['desktop']>, feedback: string) => void
  onUpdatePerformance: (patch: Partial<SettingsSnapshot['performance']>, feedback: string) => void
  onUpdateFeatures: (patch: Partial<SettingsSnapshot['features']>, feedback: string) => void
  onRuntimeMetricsUpdated: (metrics: SettingsSnapshot['performance']['runtimeMetrics']) => void
  onFeedback: (message: string) => void
}

export function AdvancedSettingsSection({
  settings,
  motionPreference,
  performanceHudEnabled,
  threadPageSize,
  messagePageSize,
  attachmentPreviewMode,
  runtimeMetrics,
  commandCenterEnabled,
  minimizeToTrayOnClose,
  startInTray,
  singleInstanceFocus,
  notificationsMuted,
  onOpenConnectivity,
  onOpenChats,
  onOpenNetwork,
  onUpdateDesktop,
  onUpdatePerformance,
  onUpdateFeatures,
  onRuntimeMetricsUpdated,
  onFeedback,
}: AdvancedSettingsSectionProps) {
  const jsHeapBytes = runtimeMetrics?.jsHeapUsedBytes ?? readJsHeapBytes()

  return (
    <div className="space-y-3">
      <InteropHealthCard
        interop={settings.interop}
        onOpenConnectivity={onOpenConnectivity}
        onOpenChats={onOpenChats}
        onOpenNetwork={onOpenNetwork}
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
              onChange={event => {
                const next = event.target.checked
                onUpdateDesktop(
                  { minimizeToTrayOnClose: next },
                  next
                    ? 'Closing window now minimizes to tray.'
                    : 'Closing window now exits the app.'
                )
              }}
            />
            Minimize to tray on close
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={startInTray}
              onChange={event => {
                const next = event.target.checked
                onUpdateDesktop(
                  { startInTray: next },
                  next ? 'App will start hidden in tray.' : 'App will open window on startup.'
                )
              }}
            />
            Start in tray
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={singleInstanceFocus}
              onChange={event => {
                const next = event.target.checked
                onUpdateDesktop(
                  { singleInstanceFocus: next },
                  next
                    ? 'Secondary launches will focus the existing window.'
                    : 'Secondary launches will forward payloads without forcing focus.'
                )
              }}
            />
            Focus window on second launch
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={notificationsMuted}
              onChange={event => {
                const next = event.target.checked
                onUpdateDesktop(
                  { notificationsMuted: next },
                  next ? 'Notifications muted at desktop shell level.' : 'Notifications unmuted.'
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
              onChange={event => {
                const next = event.target.value as MotionPreference
                onUpdatePerformance({ motionPreference: next }, `Motion quality set to ${next}.`)
              }}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 transition outline-none focus:border-blue-300"
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
              onChange={event => {
                onUpdatePerformance(
                  { hudEnabled: event.target.checked },
                  event.target.checked ? 'Performance HUD enabled.' : 'Performance HUD disabled.'
                )
              }}
            />
            Show FPS HUD
          </label>
          <label className="text-xs text-slate-600">
            Thread page size
            <select
              value={String(threadPageSize)}
              onChange={event => {
                const next = Number.parseInt(event.target.value, 10)
                onUpdatePerformance(
                  { threadPageSize: Number.isFinite(next) ? next : 120 },
                  'Thread page size updated.'
                )
              }}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 transition outline-none focus:border-blue-300"
            >
              <option value="80">80</option>
              <option value="120">120</option>
              <option value="180">180</option>
              <option value="240">240</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Message page size
            <select
              value={String(messagePageSize)}
              onChange={event => {
                const next = Number.parseInt(event.target.value, 10)
                onUpdatePerformance(
                  { messagePageSize: Number.isFinite(next) ? next : 80 },
                  'Message page size updated.'
                )
              }}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 transition outline-none focus:border-blue-300"
            >
              <option value="50">50</option>
              <option value="80">80</option>
              <option value="120">120</option>
              <option value="160">160</option>
            </select>
          </label>
          <label className="text-xs text-slate-600 sm:col-span-2">
            Attachment preview mode
            <select
              value={attachmentPreviewMode}
              onChange={event => {
                const next = event.target.value as AttachmentPreviewMode
                onUpdatePerformance(
                  { attachmentPreviewMode: next },
                  `Attachment preview mode set to ${next.replace('_', ' ')}.`
                )
              }}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 transition outline-none focus:border-blue-300"
            >
              <option value="on_demand">On demand</option>
              <option value="eager">Eager</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void refreshRuntimeMetrics()
                .then(metrics => {
                  onRuntimeMetricsUpdated(metrics)
                  onFeedback('Runtime metrics refreshed.')
                })
                .catch(runtimeError => {
                  onFeedback(
                    runtimeError instanceof Error ? runtimeError.message : String(runtimeError)
                  )
                })
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Refresh runtime metrics
          </button>
          <button
            type="button"
            onClick={() => {
              const diagnostics = buildPerformanceDiagnostics({
                runtimeMetrics,
                jsHeapBytes,
                threadPageSize,
                messagePageSize,
                attachmentPreviewMode,
              })
              void navigator.clipboard
                .writeText(diagnostics)
                .then(() => {
                  onFeedback('Diagnostics copied to clipboard.')
                })
                .catch(copyError => {
                  onFeedback(copyError instanceof Error ? copyError.message : String(copyError))
                })
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Copy diagnostics
          </button>
          <button
            type="button"
            onClick={() => {
              void runSettingsMaintenance({
                action: 'clear_attachment_cache',
              })
                .then(result => {
                  onFeedback(result.detail)
                })
                .catch(maintenanceError => {
                  onFeedback(
                    maintenanceError instanceof Error
                      ? maintenanceError.message
                      : String(maintenanceError)
                  )
                })
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Clear attachment cache
          </button>
          <button
            type="button"
            onClick={() => {
              void runSettingsMaintenance({
                action: 'rebuild_thread_summaries',
              })
                .then(result => {
                  onFeedback(result.detail)
                })
                .catch(maintenanceError => {
                  onFeedback(
                    maintenanceError instanceof Error
                      ? maintenanceError.message
                      : String(maintenanceError)
                  )
                })
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Rebuild thread summaries
          </button>
        </div>
        <div className="mt-3 grid gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:grid-cols-2">
          <p>RSS: {formatBytes(runtimeMetrics?.rssBytes ?? 0)}</p>
          <p>JS heap: {formatBytes(jsHeapBytes ?? 0)}</p>
          <p>JS heap limit: {formatBytes(runtimeMetrics?.jsHeapLimitBytes ?? 0)}</p>
          <p>Index DB: {formatBytes(runtimeMetrics?.dbSizeBytes ?? 0)}</p>
          <p>Queue size: {runtimeMetrics?.queueSize ?? 0}</p>
          <p>Event pump: {runtimeMetrics?.eventPumpIntervalMs ?? '—'} ms</p>
          <p>Attachment handles: {runtimeMetrics?.attachmentHandleCount ?? 0}</p>
          <p>
            Index last sync:{' '}
            {runtimeMetrics?.indexLastSyncMs
              ? new Date(runtimeMetrics.indexLastSyncMs).toLocaleString()
              : '—'}
          </p>
          <p>
            Indexed rows: {runtimeMetrics?.threadCount ?? 0} threads /{' '}
            {runtimeMetrics?.messageCount ?? 0} messages
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-semibold text-slate-800">Features</p>
        <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={commandCenterEnabled}
            onChange={event => {
              onUpdateFeatures(
                { commandCenterEnabled: event.target.checked },
                event.target.checked ? 'Command Center enabled.' : 'Command Center hidden.'
              )
            }}
          />
          Enable Command Center page (advanced)
        </label>
      </div>
    </div>
  )
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '—'
  }
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function readJsHeapBytes(): number | undefined {
  if (typeof performance === 'undefined') {
    return undefined
  }
  const memoryValue = (
    performance as Performance & {
      memory?: { usedJSHeapSize?: number }
    }
  ).memory?.usedJSHeapSize
  return typeof memoryValue === 'number' && Number.isFinite(memoryValue) ? memoryValue : undefined
}

function buildPerformanceDiagnostics({
  runtimeMetrics,
  jsHeapBytes,
  threadPageSize,
  messagePageSize,
  attachmentPreviewMode,
}: {
  runtimeMetrics: SettingsSnapshot['performance']['runtimeMetrics']
  jsHeapBytes: number | undefined
  threadPageSize: number
  messagePageSize: number
  attachmentPreviewMode: AttachmentPreviewMode
}): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      runtimeMetrics: {
        rssBytes: runtimeMetrics?.rssBytes ?? null,
        jsHeapBytes: jsHeapBytes ?? null,
        dbSizeBytes: runtimeMetrics?.dbSizeBytes ?? null,
        queueSize: runtimeMetrics?.queueSize ?? null,
        threadCount: runtimeMetrics?.threadCount ?? null,
        messageCount: runtimeMetrics?.messageCount ?? null,
        eventPumpIntervalMs: runtimeMetrics?.eventPumpIntervalMs ?? null,
        attachmentHandleCount: runtimeMetrics?.attachmentHandleCount ?? null,
        indexLastSyncMs: runtimeMetrics?.indexLastSyncMs ?? null,
        jsHeapLimitBytes: runtimeMetrics?.jsHeapLimitBytes ?? null,
      },
      loadingProfile: {
        threadPageSize,
        messagePageSize,
        attachmentPreviewMode,
      },
    },
    null,
    2
  )
}
