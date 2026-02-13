import { useEffect, useMemo, useState } from 'react'

import clsx from 'clsx'

import {
  getWeftPreferences,
  type MotionPreference,
  PREFERENCES_UPDATED_EVENT,
} from '@shared/runtime/preferences'

interface HudSnapshot {
  fps: number
  jankPercent: number
}

export function PerformanceHud() {
  const [hudEnabled, setHudEnabled] = useState(() => getWeftPreferences().performanceHudEnabled)
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(
    () => getWeftPreferences().motionPreference,
  )
  const [snapshot, setSnapshot] = useState<HudSnapshot>({
    fps: 0,
    jankPercent: 0,
  })

  useEffect(() => {
    const sync = () => {
      const preferences = getWeftPreferences()
      setHudEnabled(preferences.performanceHudEnabled)
      setMotionPreference(preferences.motionPreference)
    }
    window.addEventListener(PREFERENCES_UPDATED_EVENT, sync)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, sync)
    }
  }, [])

  useEffect(() => {
    if (!hudEnabled) {
      return
    }
    let rafId = 0
    let frameCount = 0
    let slowFrameCount = 0
    let previousFrameAt = performance.now()
    let sampleStartedAt = previousFrameAt

    const frame = (now: number) => {
      frameCount += 1
      const delta = now - previousFrameAt
      if (delta > 18) {
        slowFrameCount += 1
      }
      previousFrameAt = now

      if (now - sampleStartedAt >= 600) {
        const elapsed = now - sampleStartedAt
        const fps = Math.round((frameCount * 1000) / elapsed)
        const jankPercent = Math.round((slowFrameCount / Math.max(frameCount, 1)) * 100)
        setSnapshot({ fps, jankPercent })
        frameCount = 0
        slowFrameCount = 0
        sampleStartedAt = now
      }

      rafId = window.requestAnimationFrame(frame)
    }

    rafId = window.requestAnimationFrame(frame)
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [hudEnabled])

  const toneClass = useMemo(() => {
    if (snapshot.fps >= 56 && snapshot.jankPercent <= 10) {
      return 'border-emerald-300 bg-emerald-50 text-emerald-700'
    }
    if (snapshot.fps >= 45 && snapshot.jankPercent <= 20) {
      return 'border-amber-300 bg-amber-50 text-amber-700'
    }
    return 'border-rose-300 bg-rose-50 text-rose-700'
  }, [snapshot.fps, snapshot.jankPercent])

  if (!hudEnabled) {
    return null
  }

  return (
    <aside className="pointer-events-none absolute bottom-4 left-4 z-40">
      <div
        className={clsx(
          'rounded-xl border px-3 py-1.5 text-[11px] font-semibold shadow-sm backdrop-blur',
          toneClass,
        )}
      >
        <span>{snapshot.fps} FPS</span>
        <span className="mx-1.5 opacity-55">•</span>
        <span>{snapshot.jankPercent}% slow</span>
        <span className="mx-1.5 opacity-55">•</span>
        <span className="uppercase">{motionPreference}</span>
      </div>
    </aside>
  )
}
