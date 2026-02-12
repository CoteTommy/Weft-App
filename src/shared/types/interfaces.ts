export type InterfaceStatus = 'Enabled' | 'Disabled'

export interface InterfaceItem {
  id: string
  name: string
  type: string
  status: InterfaceStatus
  address: string
  source: 'daemon' | 'snapshot'
}

export interface InterfaceMetrics {
  total: number
  enabled: number
  disabled: number
  byType: Record<string, number>
}
