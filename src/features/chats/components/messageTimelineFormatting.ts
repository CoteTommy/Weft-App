import { APP_ROUTES } from '@app/config/routes'
import type { ChatMessage } from '@shared/types/chat'

export function renderStatus(status: ChatMessage['status']): string {
  switch (status) {
    case 'sending':
      return 'Sending'
    case 'sent':
      return 'Sent'
    case 'delivered':
      return 'Delivered'
    case 'failed':
      return 'Failed'
    default:
      return ''
  }
}

export function buildFailureGuidance(reasonCode: string | undefined): {
  title: string
  body: string
  actionLabel?: string
  actionPath?: string
} | null {
  if (!reasonCode) {
    return {
      title: 'Delivery failed',
      body: 'Retry now or keep Weft online while routes and announcements converge.',
    }
  }
  if (reasonCode === 'relay_unset') {
    return {
      title: 'No relay selected',
      body: 'This message requires propagated delivery. Select an outbound propagation relay first.',
      actionLabel: 'Open settings',
      actionPath: APP_ROUTES.settings,
    }
  }
  if (reasonCode === 'no_path') {
    return {
      title: 'No route to destination',
      body: 'A path to this peer is not known yet. Wait for announces or check network connectivity.',
      actionLabel: 'Open network',
      actionPath: APP_ROUTES.network,
    }
  }
  if (reasonCode === 'timeout' || reasonCode === 'receipt_timeout') {
    return {
      title: 'Delivery timed out',
      body: 'The recipient might be offline or out of range. Keep the app running and retry shortly.',
    }
  }
  if (reasonCode === 'retry_budget_exhausted') {
    return {
      title: 'Retries exhausted',
      body: 'All configured retries were used. Check relay selection and connectivity before retrying.',
      actionLabel: 'Open settings',
      actionPath: APP_ROUTES.settings,
    }
  }
  return {
    title: 'Delivery failed',
    body: `Backend reason: ${reasonCode}`,
  }
}

export function formatTraceTimestamp(value: number): string {
  if (!Number.isFinite(value)) {
    return 'unknown'
  }
  const timestampMs = value > 1_000_000_000_000 ? value : value * 1000
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return '—'
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
