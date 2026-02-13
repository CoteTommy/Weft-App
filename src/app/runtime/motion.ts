import type { MotionPreference } from '@shared/runtime/preferences'

export function transitionForMotionPreference(motionPreference: MotionPreference): {
  duration: number
  ease: [number, number, number, number]
} {
  if (motionPreference === 'smooth') {
    return { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
  }
  if (motionPreference === 'off') {
    return { duration: 0, ease: [0.22, 1, 0.36, 1] }
  }
  return { duration: 0.14, ease: [0.22, 1, 0.36, 1] }
}
