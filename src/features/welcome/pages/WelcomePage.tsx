import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import clsx from 'clsx'

import { APP_ROUTES } from '@app/config/routes'
import {
  type ConnectivityMode,
  consumePendingLaunchRoute,
  getWeftPreferences,
  updateWeftPreferences,
} from '@shared/runtime/preferences'
import { getStoredDisplayName, setStoredDisplayName } from '@shared/utils/identity'
import { daemonStart, setLxmfDisplayName } from '@lib/lxmf-api'

type OnboardingStep = 0 | 1 | 2

const CONNECTIVITY_PRESETS: Array<{
  mode: ConnectivityMode
  label: string
  description: string
  transport?: string
}> = [
  {
    mode: 'automatic',
    label: 'Automatic',
    description: 'Use safe defaults and let Weft manage network startup.',
  },
  {
    mode: 'local_only',
    label: 'Local only',
    description: 'Run the embedded daemon bound to localhost only.',
    transport: '127.0.0.1:0',
  },
  {
    mode: 'lan_shared',
    label: 'LAN shared',
    description: 'Bind transport on all interfaces so nearby peers can bridge.',
    transport: '0.0.0.0:0',
  },
  {
    mode: 'custom',
    label: 'Custom',
    description: 'Manually define profile, RPC endpoint and transport.',
  },
]

export function WelcomePage() {
  const saved = getWeftPreferences()
  const navigate = useNavigate()
  const [step, setStep] = useState<OnboardingStep>(0)
  const [displayName, setDisplayName] = useState(() => getStoredDisplayName() ?? '')
  const [connectivityMode, setConnectivityMode] = useState<ConnectivityMode>(saved.connectivityMode)
  const [profileDraft, setProfileDraft] = useState(saved.profile ?? '')
  const [rpcDraft, setRpcDraft] = useState(saved.rpc ?? '')
  const [transportDraft, setTransportDraft] = useState(saved.transport ?? '')
  const [autoStart, setAutoStart] = useState(saved.autoStartDaemon)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveTransport = useMemo(() => {
    const preset = CONNECTIVITY_PRESETS.find(entry => entry.mode === connectivityMode)
    if (connectivityMode === 'custom') {
      return transportDraft.trim() || undefined
    }
    return preset?.transport
  }, [connectivityMode, transportDraft])

  const canContinueFromIdentity = displayName.trim().length > 0
  const canFinish = true

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8">
      <section className="w-full rounded-3xl border border-white/60 bg-white/85 p-8 shadow-[0_30px_90px_-50px_rgba(22,45,83,0.4)] backdrop-blur">
        <p className="text-xs font-semibold tracking-[0.18em] text-blue-600 uppercase">
          Weft Desktop
        </p>
        <h1 className="font-heading mt-3 text-4xl text-slate-900">Welcome to Weft</h1>
        <p className="mt-3 max-w-xl text-sm text-slate-600">
          Private chat over resilient mesh networking. This quick setup gets your identity and
          connection profile ready.
        </p>

        <div className="mt-6 flex gap-2 text-xs">
          {[0, 1, 2].map(value => (
            <span
              key={value}
              className={clsx(
                'rounded-full px-3 py-1 font-semibold',
                step >= value ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
              )}
            >
              {value === 0 ? 'Identity' : value === 1 ? 'Connectivity' : 'Review'}
            </span>
          ))}
        </div>

        {step === 0 ? (
          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700" htmlFor="displayName">
              Display name
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={event => setDisplayName(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 transition outline-none focus:border-blue-300"
              placeholder="e.g. Alex"
            />
            <p className="mt-2 text-xs text-slate-500">
              This name is included in your LXMF delivery announce app-data.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-6 space-y-3">
            {CONNECTIVITY_PRESETS.map(preset => (
              <button
                key={preset.mode}
                type="button"
                onClick={() => {
                  setConnectivityMode(preset.mode)
                  if (preset.mode !== 'custom') {
                    setTransportDraft(preset.transport ?? '')
                  }
                }}
                className={clsx(
                  'w-full rounded-2xl border px-4 py-3 text-left transition',
                  connectivityMode === preset.mode
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                )}
              >
                <p className="text-sm font-semibold text-slate-900">{preset.label}</p>
                <p className="mt-1 text-xs text-slate-600">{preset.description}</p>
              </button>
            ))}

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Advanced
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-600">
                  Profile
                  <input
                    value={profileDraft}
                    onChange={event => setProfileDraft(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
                    placeholder="leave blank for active profile"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  RPC endpoint (optional)
                  <input
                    value={rpcDraft}
                    onChange={event => setRpcDraft(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
                    placeholder="127.0.0.1:4242"
                  />
                </label>
              </div>
              {connectivityMode === 'custom' ? (
                <label className="mt-2 block text-xs text-slate-600">
                  Transport bind (required for custom)
                  <input
                    value={transportDraft}
                    onChange={event => setTransportDraft(event.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
                    placeholder="127.0.0.1:0"
                  />
                </label>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Transport: <span className="font-mono">{effectiveTransport ?? 'default'}</span>
                </p>
              )}
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={event => setAutoStart(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Auto-start daemon after setup
              </label>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p>
              <span className="font-semibold">Display name:</span> {displayName.trim() || '—'}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Mode:</span>{' '}
              {CONNECTIVITY_PRESETS.find(entry => entry.mode === connectivityMode)?.label}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Profile:</span>{' '}
              {profileDraft.trim() || 'active profile'}
            </p>
            <p className="mt-1">
              <span className="font-semibold">RPC:</span> {rpcDraft.trim() || 'profile default'}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Transport:</span>{' '}
              {effectiveTransport ?? 'runtime default'}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Auto-start:</span>{' '}
              {autoStart ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(value => (value - 1) as OnboardingStep)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back
            </button>
          ) : null}
          {step < 2 ? (
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStep(value => (value + 1) as OnboardingStep)
              }}
              disabled={step === 0 ? !canContinueFromIdentity : false}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || !canFinish}
              onClick={() => {
                void (async () => {
                  setSaving(true)
                  setError(null)
                  const normalizedName = displayName.trim()
                  const profile = profileDraft.trim() || undefined
                  const rpc = rpcDraft.trim() || undefined
                  const transport = effectiveTransport?.trim() || undefined
                  try {
                    updateWeftPreferences({
                      onboardingCompleted: true,
                      connectivityMode,
                      profile,
                      rpc,
                      transport,
                      autoStartDaemon: autoStart,
                    })
                    try {
                      const resolved = await setLxmfDisplayName(normalizedName || null, {
                        profile,
                        rpc,
                      })
                      setStoredDisplayName(resolved.displayName ?? '')
                    } catch {
                      setStoredDisplayName(normalizedName)
                    }

                    if (autoStart) {
                      await daemonStart({
                        managed: true,
                        profile,
                        rpc,
                        transport,
                      })
                    }

                    const pendingRoute = consumePendingLaunchRoute()
                    void navigate(pendingRoute ?? APP_ROUTES.chats, { replace: true })
                  } catch (setupError) {
                    setError(setupError instanceof Error ? setupError.message : String(setupError))
                  } finally {
                    setSaving(false)
                  }
                })()
              }}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {saving ? 'Setting up...' : 'Finish setup'}
            </button>
          )}
        </div>
        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      </section>
    </main>
  )
}
