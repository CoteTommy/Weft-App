export type ProbeOptions = {
  profile?: string
  rpc?: string
}

export type DaemonControlOptions = ProbeOptions & {
  managed?: boolean
  reticulumd?: string
  transport?: string
}

export type LxmfSendMessageOptions = ProbeOptions & {
  destination: string
  content: string
  title?: string
  source?: string
  id?: string
  fields?: unknown
  method?: string
  stampCost?: number
  includeTicket?: boolean
  replyToId?: string
  reaction?: {
    to: string
    emoji: string
    sender?: string
  }
  telemetryLocation?: {
    lat: number
    lon: number
    alt?: number
    speed?: number
    accuracy?: number
  }
}

export type LxmfSendCommandOptions = ProbeOptions & {
  destination: string
  commands?: string[]
  commandsHex?: string[]
  content?: string
  title?: string
  source?: string
  id?: string
  method?: string
  stampCost?: number
  includeTicket?: boolean
}

export type LxmfRichAttachment = {
  name: string
  dataBase64: string
  mime?: string
  sizeBytes?: number
}

export type LxmfSendRichMessageOptions = ProbeOptions & {
  destination: string
  content: string
  title?: string
  source?: string
  id?: string
  attachments?: LxmfRichAttachment[]
  method?: string
  stampCost?: number
  includeTicket?: boolean
  replyToId?: string
  reaction?: {
    to: string
    emoji: string
    sender?: string
  }
  telemetryLocation?: {
    lat: number
    lon: number
    alt?: number
    speed?: number
    accuracy?: number
  }
}

export type LxmfSendMessageResponse = {
  result: unknown
  resolved: {
    source: string
    destination: string
  }
}

export type LxmfProfileInfo = {
  profile: string
  displayName: string | null
  rpc: string
  managed: boolean
}

export type LxmfEventPumpStatus = {
  running: boolean
  intervalMs?: number
}
