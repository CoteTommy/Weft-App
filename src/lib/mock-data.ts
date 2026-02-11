export type Message = {
  id: string
  sender: 'self' | 'peer'
  author: string
  body: string
  sentAt: string
  attachment?: {
    name: string
    size: string
  }
}

export type Thread = {
  id: string
  label: string
  channel: string
  signal: number
  unread: number
  lastSeen: string
  trust: 'verified' | 'observed' | 'pending'
  messages: Message[]
}

export type Contact = {
  id: string
  callsign: string
  route: string
  trust: 'verified' | 'observed' | 'pending'
  role: string
  lastExchange: string
  notes: string
}

export type Peer = {
  id: string
  endpoint: string
  transport: string
  latencyMs: number
  uptime: string
  queueDepth: number
  handshake: 'stable' | 'degraded' | 'retrying'
}

export type InterfaceLink = {
  id: string
  name: string
  type: string
  state: 'online' | 'idle' | 'offline'
  mtu: string
  throughput: string
  packets: string
}

export type Announcement = {
  id: string
  title: string
  author: string
  audience: string
  ttl: string
  body: string
  postedAt: string
  priority: 'routine' | 'urgent'
}

export type PaperEntry = {
  id: string
  title: string
  category: string
  revision: string
  updatedAt: string
  body: string
}

export type AttachmentItem = {
  id: string
  name: string
  kind: 'image' | 'doc' | 'archive' | 'audio'
  size: string
  owner: string
  linkedTo: string
  sealed: boolean
  modifiedAt: string
}

export const threads: Thread[] = [
  {
    id: 'thr-1',
    label: 'North Relay Crew',
    channel: 'mesh://north-relay',
    signal: 92,
    unread: 3,
    lastSeen: '2m ago',
    trust: 'verified',
    messages: [
      {
        id: 'm-1',
        sender: 'peer',
        author: 'relay.alpha',
        body: 'Morning sweep complete. Two transient drops on path C12, rerouted to C7.',
        sentAt: '08:41',
      },
      {
        id: 'm-2',
        sender: 'peer',
        author: 'relay.delta',
        body: 'Pushing new announce digest in ten. Need ack on receipt.',
        sentAt: '08:44',
      },
      {
        id: 'm-3',
        sender: 'self',
        author: 'you',
        body: 'Ack. Route lock enabled for next 30 minutes while we test handoff.',
        sentAt: '08:46',
      },
      {
        id: 'm-4',
        sender: 'peer',
        author: 'relay.alpha',
        body: 'Dropping packet trace for incident 44B.',
        sentAt: '08:47',
        attachment: {
          name: 'trace-44b.ndjson',
          size: '1.9 MB',
        },
      },
    ],
  },
  {
    id: 'thr-2',
    label: 'Bluebird Logistics',
    channel: 'mesh://bluebird',
    signal: 74,
    unread: 0,
    lastSeen: '15m ago',
    trust: 'observed',
    messages: [
      {
        id: 'm-5',
        sender: 'self',
        author: 'you',
        body: 'Manifest received. Dispatching payload manifest hash now.',
        sentAt: '07:22',
      },
      {
        id: 'm-6',
        sender: 'peer',
        author: 'bluebird.ops',
        body: 'Received. Confirming lockers 8 through 12 are synced.',
        sentAt: '07:25',
      },
    ],
  },
  {
    id: 'thr-3',
    label: 'Field Team Echo',
    channel: 'mesh://echo-field',
    signal: 58,
    unread: 1,
    lastSeen: '31m ago',
    trust: 'pending',
    messages: [
      {
        id: 'm-7',
        sender: 'peer',
        author: 'echo.1',
        body: 'Low visibility in corridor 9. Switching to burst messaging.',
        sentAt: '06:58',
      },
      {
        id: 'm-8',
        sender: 'self',
        author: 'you',
        body: 'Use narrowcast mode and keep payloads under 12KB until link clears.',
        sentAt: '07:02',
      },
      {
        id: 'm-9',
        sender: 'peer',
        author: 'echo.1',
        body: 'Understood. Sending current map updates as paper note.',
        sentAt: '07:06',
      },
    ],
  },
]

export const contacts: Contact[] = [
  {
    id: 'ct-1',
    callsign: 'relay.alpha',
    route: 'north/c7/hub-3',
    trust: 'verified',
    role: 'Backbone operator',
    lastExchange: '5m ago',
    notes: 'Primary handoff on overnight windows.',
  },
  {
    id: 'ct-2',
    callsign: 'bluebird.ops',
    route: 'logistics/w2/sector-8',
    trust: 'observed',
    role: 'Freight coordinator',
    lastExchange: '26m ago',
    notes: 'Requests announce snapshots every 2h.',
  },
  {
    id: 'ct-3',
    callsign: 'echo.1',
    route: 'field/east/ridge',
    trust: 'pending',
    role: 'Field recon',
    lastExchange: '1h ago',
    notes: 'Signal unstable in rain conditions.',
  },
  {
    id: 'ct-4',
    callsign: 'paper.node',
    route: 'archive/south/vault',
    trust: 'verified',
    role: 'Document mirror',
    lastExchange: '3h ago',
    notes: 'Hosts long-lived paper bundles.',
  },
]

export const peers: Peer[] = [
  {
    id: 'pr-1',
    endpoint: '10.88.4.21:4242',
    transport: 'TCP relay',
    latencyMs: 42,
    uptime: '16d 4h',
    queueDepth: 11,
    handshake: 'stable',
  },
  {
    id: 'pr-2',
    endpoint: '172.19.8.4:7070',
    transport: 'LoRa bridge',
    latencyMs: 213,
    uptime: '5d 12h',
    queueDepth: 27,
    handshake: 'degraded',
  },
  {
    id: 'pr-3',
    endpoint: '100.67.11.90:9988',
    transport: 'Bluetooth tunnel',
    latencyMs: 124,
    uptime: '2d 3h',
    queueDepth: 7,
    handshake: 'retrying',
  },
]

export const interfaceLinks: InterfaceLink[] = [
  {
    id: 'if-1',
    name: 'Northwire-TCP',
    type: 'TCP Listener',
    state: 'online',
    mtu: '1300',
    throughput: '2.3 MB/s',
    packets: '1.2M',
  },
  {
    id: 'if-2',
    name: 'RNode-Lora01',
    type: 'LoRa Serial',
    state: 'idle',
    mtu: '500',
    throughput: '180 KB/s',
    packets: '402K',
  },
  {
    id: 'if-3',
    name: 'Bridge-BLE-E',
    type: 'BLE Link',
    state: 'offline',
    mtu: '270',
    throughput: '0 KB/s',
    packets: '92K',
  },
]

export const announcements: Announcement[] = [
  {
    id: 'an-1',
    title: 'Transit Window Shift',
    author: 'relay.delta',
    audience: 'all peers',
    ttl: '12h',
    postedAt: '08:20',
    priority: 'routine',
    body: 'Northern transit window shifted by 25 minutes. Use fallback route via C7 until next digest.',
  },
  {
    id: 'an-2',
    title: 'Packet Signature Rotation',
    author: 'ops.admin',
    audience: 'verified peers',
    ttl: '24h',
    postedAt: '06:10',
    priority: 'urgent',
    body: 'Rotate signature bundles to rev-18 before 23:00 local. Legacy signatures will be dropped.',
  },
  {
    id: 'an-3',
    title: 'Paper Mirror Maint.',
    author: 'paper.node',
    audience: 'archive sync',
    ttl: '6h',
    postedAt: '03:55',
    priority: 'routine',
    body: 'Archive mirror pruning stale attachments. Temporary retrieval delay up to 90 seconds.',
  },
]

export const paperEntries: PaperEntry[] = [
  {
    id: 'pp-1',
    title: 'Handoff Playbook',
    category: 'Operations',
    revision: 'r12',
    updatedAt: 'Today 07:45',
    body: `# Handoff Playbook\n\n1. Confirm peer trust state before accepting routed traffic.\n2. Keep queue under 30 packets during relay migration.\n3. Log announce IDs in the transfer footer for traceability.\n\n## Checklist\n- [x] Link health sampled\n- [x] Backup path pre-warmed\n- [ ] Post-window checksum issued`,
  },
  {
    id: 'pp-2',
    title: 'Incident 44B Notes',
    category: 'Incidents',
    revision: 'r3',
    updatedAt: 'Today 06:11',
    body: `# Incident 44B\n\nObserved packet duplication between C12 and C7 during rain period.\n\n- Trigger: unstable lora bridge\n- Mitigation: short TTL + strict ack gating\n- Follow-up: replace bridge antenna`,
  },
]

export const attachmentItems: AttachmentItem[] = [
  {
    id: 'at-1',
    name: 'trace-44b.ndjson',
    kind: 'doc',
    size: '1.9 MB',
    owner: 'relay.alpha',
    linkedTo: 'North Relay Crew',
    sealed: true,
    modifiedAt: '08:47',
  },
  {
    id: 'at-2',
    name: 'corridor9-map.webp',
    kind: 'image',
    size: '640 KB',
    owner: 'echo.1',
    linkedTo: 'Field Team Echo',
    sealed: false,
    modifiedAt: '07:09',
  },
  {
    id: 'at-3',
    name: 'mirror-backup.tar',
    kind: 'archive',
    size: '12.3 MB',
    owner: 'paper.node',
    linkedTo: 'Archive Sync',
    sealed: true,
    modifiedAt: '05:02',
  },
  {
    id: 'at-4',
    name: 'voice-note-183.ogg',
    kind: 'audio',
    size: '2.4 MB',
    owner: 'bluebird.ops',
    linkedTo: 'Bluebird Logistics',
    sealed: false,
    modifiedAt: 'Yesterday',
  },
]
