import { listLxmfInterfaces, lxmfInterfaceMetrics } from '../../../lib/lxmf-api'
import type { LxmfInterfaceRecord, LxmfInterfaceMetricsResponse } from '../../../lib/lxmf-payloads'
import type { InterfaceItem, InterfaceMetrics } from '../../../shared/types/interfaces'

export interface InterfaceSnapshot {
  interfaces: InterfaceItem[]
  metrics: InterfaceMetrics
}

export async function fetchInterfaceSnapshot(): Promise<InterfaceSnapshot> {
  try {
    const response = await lxmfInterfaceMetrics()
    return fromMetricsResponse(response)
  } catch {
    const fallback = await listLxmfInterfaces()
    const interfaces = sortInterfaces(fallback.interfaces.map((record, index) => mapDaemonInterface(record, index)))
    return {
      interfaces,
      metrics: {
        total: interfaces.length,
        enabled: interfaces.filter((item) => item.status === 'Enabled').length,
        disabled: interfaces.filter((item) => item.status === 'Disabled').length,
        byType: countByType(interfaces),
      },
    }
  }
}

function fromMetricsResponse(response: LxmfInterfaceMetricsResponse): InterfaceSnapshot {
  const interfaces = sortInterfaces(response.interfaces.map((record, index) => mapDaemonInterface(record, index)))
  return {
    interfaces,
    metrics: {
      total: response.total,
      enabled: response.enabled,
      disabled: response.disabled,
      byType: response.by_type,
    },
  }
}

function mapDaemonInterface(record: LxmfInterfaceRecord, index: number): InterfaceItem {
  return {
    id: record.name ?? `${record.type}:${index}`,
    name: record.name ?? `${record.type} interface`,
    type: record.type,
    status: record.enabled ? 'Enabled' : 'Disabled',
    address: formatAddress(record.host, record.port),
    source: 'daemon',
  }
}

function formatAddress(host: string | null | undefined, port: number | null | undefined): string {
  const cleanHost = host?.trim() || 'n/a'
  if (typeof port === 'number') {
    return `${cleanHost}:${port}`
  }
  return cleanHost
}

function sortInterfaces(items: InterfaceItem[]): InterfaceItem[] {
  return [...items].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'Enabled' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
}

function countByType(items: InterfaceItem[]): Record<string, number> {
  const byType: Record<string, number> = {}
  for (const item of items) {
    byType[item.type] = (byType[item.type] ?? 0) + 1
  }
  return byType
}
