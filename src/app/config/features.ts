export const FEATURE_FLAGS = {
  commandCenterEnabled: 'commandCenterEnabled',
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

export function isCommandCenterEnabled(
  value: boolean | { commandCenterEnabled?: boolean } | undefined
): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  return Boolean(value?.commandCenterEnabled)
}
