import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import {
  Activity,
  AlertTriangle,
  Antenna,
  Archive,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Download,
  FileText,
  Filter,
  Image,
  Megaphone,
  MessageCircle,
  Mic,
  Network,
  Paperclip,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { daemonRestart, daemonStart, daemonStop, probeLxmf } from './lib/lxmf-api'
import {
  announcements,
  attachmentItems,
  contacts,
  interfaceLinks,
  paperEntries,
  peers,
  threads,
  type AttachmentItem,
  type InterfaceLink,
} from './lib/mock-data'

type NavItem = {
  id: string
  label: string
  hint: string
  to: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { id: 'messages', label: 'Messages', hint: 'Live conversations', to: '/messages', icon: MessageCircle },
  { id: 'contacts', label: 'Contacts', hint: 'Directory + trust', to: '/contacts', icon: Users },
  { id: 'peers', label: 'Peers', hint: 'Active links', to: '/peers', icon: Network },
  { id: 'interfaces', label: 'Interfaces', hint: 'Transport controls', to: '/interfaces', icon: SlidersHorizontal },
  { id: 'announces', label: 'Announces', hint: 'Broadcast queue', to: '/announces', icon: Megaphone },
  { id: 'paper', label: 'Paper', hint: 'Knowledge notes', to: '/paper', icon: FileText },
  { id: 'attachments', label: 'Attachments', hint: 'Media vault', to: '/attachments', icon: Paperclip },
]

const trustTone = {
  verified: 'bg-emerald-400/15 text-emerald-200 ring-emerald-500/25',
  observed: 'bg-amber-400/15 text-amber-200 ring-amber-500/25',
  pending: 'bg-rose-400/15 text-rose-200 ring-rose-500/25',
}

const handshakeTone = {
  stable: 'text-emerald-300',
  degraded: 'text-amber-200',
  retrying: 'text-rose-300',
}

const interfaceTone = {
  online: 'bg-emerald-400/20 text-emerald-200',
  idle: 'bg-amber-400/20 text-amber-100',
  offline: 'bg-slate-600/35 text-slate-200',
}

const pageEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.24 },
}

function App() {
  const location = useLocation()
  const [probe, setProbe] = useState<Awaited<ReturnType<typeof probeLxmf>> | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const [daemonAction, setDaemonAction] = useState<'start' | 'stop' | 'restart' | null>(null)

  const refreshProbe = useCallback(async () => {
    try {
      setProbing(true)
      setProbeError(null)
      const result = await probeLxmf()
      setProbe(result)
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : String(error))
    } finally {
      setProbing(false)
    }
  }, [])

  useEffect(() => {
    void refreshProbe()
  }, [refreshProbe])

  const runDaemonAction = useCallback(
    async (action: 'start' | 'stop' | 'restart') => {
      try {
        setDaemonAction(action)
        setProbeError(null)
        if (action === 'start') {
          await daemonStart({ managed: true })
        } else if (action === 'stop') {
          await daemonStop()
        } else {
          await daemonRestart({ managed: true })
        }
        await refreshProbe()
      } catch (error) {
        setProbeError(error instanceof Error ? error.message : String(error))
      } finally {
        setDaemonAction(null)
      }
    },
    [refreshProbe],
  )

  const probeHealthy = probe?.rpc.reachable === true && probe.events.reachable === true
  const daemonRunning = probe?.local.running === true
  const probeSummary = probeHealthy
    ? `online via ${probe?.rpc.method ?? 'status'}`
    : probeError ?? probe?.rpc.errors[0] ?? 'daemon unreachable'

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-strong)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="mesh-a" />
        <div className="mesh-b" />
        <div className="grain" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] gap-4 p-3 lg:p-6">
        <aside className="hidden w-72 shrink-0 flex-col rounded-3xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl lg:flex">
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Weft Control Surface</p>
            <h1 className="font-display text-3xl leading-none text-[var(--text-strong)]">LXMF</h1>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Packet-grade messaging operations console</p>
          </div>

          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'group flex items-center justify-between rounded-2xl border px-3 py-2.5 transition',
                    isActive
                      ? 'border-[var(--accent-cyan)]/45 bg-[var(--panel-strong)] shadow-[0_0_0_1px_rgba(98,224,255,0.25)]'
                      : 'border-transparent bg-white/0 hover:border-white/15 hover:bg-white/5',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <item.icon
                        className={clsx('h-4 w-4', isActive ? 'text-[var(--accent-cyan)]' : 'text-[var(--text-soft)]')}
                      />
                      <div>
                        <p className="font-medium text-[var(--text-strong)]">{item.label}</p>
                        <p className="text-xs text-[var(--text-muted)]">{item.hint}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)] transition group-hover:translate-x-0.5" />
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl border border-[var(--accent-amber)]/25 bg-[var(--panel-soft)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Queue health</p>
            <p className="mt-1 font-display text-2xl text-[var(--text-strong)]">92%</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
              <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--accent-amber)]" />
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">2 links need attention in the next 30 minutes</p>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col rounded-3xl border border-white/10 bg-black/45 backdrop-blur-xl">
          <header className="border-b border-white/10 px-4 py-3 sm:px-5 lg:px-7">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  className="field w-full rounded-2xl py-2.5 pl-9 pr-3 text-sm"
                  placeholder="Search callsign, route, announce ID..."
                />
              </div>
              <button className="action-button">
                <Plus className="h-4 w-4" />
                New Session
              </button>
              <button className="action-button-alt">
                <Download className="h-4 w-4" />
                Sync
              </button>
              <button onClick={refreshProbe} className="action-button-alt" disabled={probing}>
                <Activity className="h-4 w-4" />
                {probing ? 'Probing...' : 'Probe LXMF'}
              </button>
              <button
                onClick={() => {
                  void runDaemonAction('start')
                }}
                className="action-button-alt"
                disabled={daemonAction !== null}
              >
                Start
              </button>
              <button
                onClick={() => {
                  void runDaemonAction('stop')
                }}
                className="action-button-alt"
                disabled={daemonAction !== null}
              >
                Stop
              </button>
              <button
                onClick={() => {
                  void runDaemonAction('restart')
                }}
                className="action-button-alt"
                disabled={daemonAction !== null}
              >
                Restart
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={clsx(
                  'pill px-2 py-1 text-xs',
                  probeHealthy
                    ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100'
                    : 'border-rose-300/35 bg-rose-400/12 text-rose-100',
                )}
              >
                <CircleDot className="h-3.5 w-3.5" />
                LXMF {probeHealthy ? 'Connected' : 'Disconnected'}
              </span>
              <span className="text-xs text-[var(--text-muted)]">{probeSummary}</span>
              <span className="text-xs text-[var(--text-muted)]">
                daemon {daemonRunning ? 'running' : 'stopped'}
              </span>
              {probe?.rpc.identity_hash ? (
                <span className="text-xs text-[var(--text-muted)]">identity {probe.rpc.identity_hash.slice(0, 8)}...</span>
              ) : null}
            </div>

            <div className="mt-3 flex gap-2 overflow-auto pb-1 lg:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm',
                      isActive
                        ? 'border-[var(--accent-cyan)]/50 bg-[var(--panel-strong)] text-[var(--text-strong)]'
                        : 'border-white/15 bg-white/0 text-[var(--text-muted)]',
                    )
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 lg:px-7 lg:py-6">
            <AnimatePresence mode="wait">
              <motion.div key={location.pathname} {...pageEnter}>
                <Routes>
                  <Route path="/" element={<Navigate replace to="/messages" />} />
                  <Route path="/messages" element={<MessagesPage />} />
                  <Route path="/contacts" element={<ContactsPage />} />
                  <Route path="/peers" element={<PeersPage />} />
                  <Route path="/interfaces" element={<InterfacesPage />} />
                  <Route path="/announces" element={<AnnouncesPage />} />
                  <Route path="/paper" element={<PaperPage />} />
                  <Route path="/attachments" element={<AttachmentsPage />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  )
}

function MessagesPage() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(threads[0]?.id ?? '')
  const [draft, setDraft] = useState('')
  const [filterUnread, setFilterUnread] = useState(false)

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      const matchQuery =
        thread.label.toLowerCase().includes(query.toLowerCase()) ||
        thread.channel.toLowerCase().includes(query.toLowerCase())
      const matchUnread = filterUnread ? thread.unread > 0 : true
      return matchQuery && matchUnread
    })
  }, [filterUnread, query])

  const activeThread = filteredThreads.find((thread) => thread.id === selectedId) ?? filteredThreads[0]

  if (!activeThread) {
    return <div className="panel p-6 text-sm text-[var(--text-muted)]">No threads match this filter.</div>
  }

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Messaging"
        subtitle="Route-aware conversation flow with trust and signal visibility"
        chips={[
          { label: '3 active channels' },
          { label: '11 queued packets' },
          { label: 'path C7 preferred' },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_290px]">
        <article className="panel p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="section-title">Threads</p>
            <button
              onClick={() => setFilterUnread((prev) => !prev)}
              className={clsx('pill px-2 py-1 text-xs', filterUnread && 'ring-1 ring-[var(--accent-cyan)]/35')}
            >
              <Filter className="h-3.5 w-3.5" />
              Unread only
            </button>
          </div>

          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter threads"
              className="field w-full rounded-xl py-2 pl-9 pr-3 text-sm"
            />
          </label>

          <div className="space-y-2">
            {filteredThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedId(thread.id)}
                className={clsx(
                  'w-full rounded-xl border px-3 py-2 text-left transition',
                  thread.id === activeThread.id
                    ? 'border-[var(--accent-cyan)]/45 bg-[var(--panel-strong)]'
                    : 'border-white/10 bg-[var(--panel-soft)] hover:border-white/25',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--text-strong)]">{thread.label}</p>
                    <p className="text-xs text-[var(--text-muted)]">{thread.channel}</p>
                  </div>
                  {thread.unread > 0 ? (
                    <span className="rounded-full bg-[var(--accent-cyan)]/20 px-2 py-0.5 text-xs text-[var(--accent-cyan)]">
                      {thread.unread}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>signal {thread.signal}%</span>
                  <span>{thread.lastSeen}</span>
                </div>
              </button>
            ))}
          </div>
        </article>

        <article className="panel flex min-h-[520px] flex-col p-4">
          <div className="border-b border-white/10 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-2xl text-[var(--text-strong)]">{activeThread.label}</h3>
              <span className={clsx('rounded-full px-2 py-1 text-xs ring-1', trustTone[activeThread.trust])}>
                {activeThread.trust}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{activeThread.channel}</p>
          </div>

          <div className="scroll-soft mt-3 flex-1 space-y-3 overflow-auto pr-1">
            {activeThread.messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, x: message.sender === 'self' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
                className={clsx('flex', message.sender === 'self' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={clsx(
                    'max-w-[75%] rounded-2xl border px-3 py-2',
                    message.sender === 'self'
                      ? 'border-[var(--accent-cyan)]/40 bg-[var(--panel-strong)]'
                      : 'border-white/10 bg-[var(--panel-soft)]',
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <span>{message.author}</span>
                    <CircleDot className="h-2.5 w-2.5" />
                    <span>{message.sentAt}</span>
                  </div>
                  <p className="text-sm text-[var(--text-soft)]">{message.body}</p>
                  {message.attachment ? (
                    <div className="mt-2 rounded-xl border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-[var(--text-muted)]">
                      <div className="flex items-center gap-1.5 text-[var(--text-strong)]">
                        <Paperclip className="h-3.5 w-3.5" />
                        {message.attachment.name}
                      </div>
                      <p className="mt-0.5">{message.attachment.size}</p>
                    </div>
                  ) : null}
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-[var(--panel-soft)] p-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              placeholder="Write message payload..."
              className="field min-h-[80px] w-full rounded-xl p-2 text-sm"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
              <div className="flex items-center gap-2">
                <button className="pill px-2 py-1">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach
                </button>
                <button className="pill px-2 py-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  Condense
                </button>
              </div>
              <button className="action-button px-3 py-1.5 text-xs">
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            </div>
          </div>
        </article>

        <article className="panel p-4">
          <p className="section-title">Thread Telemetry</p>
          <div className="mt-3 space-y-3 text-sm">
            <MetricRow label="Signal" value={`${activeThread.signal}%`} />
            <MetricRow label="Unread" value={String(activeThread.unread)} />
            <MetricRow label="Last activity" value={activeThread.lastSeen} />
            <MetricRow label="Trust" value={activeThread.trust} />
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-[var(--panel-soft)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Quick actions</p>
            <div className="mt-2 space-y-2 text-sm">
              <button className="menu-action">Pin route lock</button>
              <button className="menu-action">Generate announce from thread</button>
              <button className="menu-action">Archive with paper note</button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              Bridge drift warning
            </div>
            <p className="mt-1 text-amber-50/90">LoRa path C12 reports jitter above threshold for 18 minutes.</p>
          </div>
        </article>
      </div>
    </section>
  )
}

function ContactsPage() {
  const [query, setQuery] = useState('')
  const [trustFilter, setTrustFilter] = useState<'all' | 'verified' | 'observed' | 'pending'>('all')

  const filteredContacts = contacts.filter((contact) => {
    const matchesQuery =
      contact.callsign.toLowerCase().includes(query.toLowerCase()) ||
      contact.route.toLowerCase().includes(query.toLowerCase())
    const matchesTrust = trustFilter === 'all' ? true : contact.trust === trustFilter
    return matchesQuery && matchesTrust
  })

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Contacts"
        subtitle="Identity and trust states across all reachable operators"
        chips={[{ label: `${contacts.length} indexed contacts` }, { label: '2 verified pathways' }, { label: '1 pending review' }]}
      />

      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              className="field w-full rounded-xl py-2 pl-9 pr-3 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter contacts"
            />
          </div>
          {(['all', 'verified', 'observed', 'pending'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setTrustFilter(mode)}
              className={clsx('pill px-3 py-1 text-sm capitalize', trustFilter === mode && 'ring-1 ring-[var(--accent-cyan)]/35')}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {filteredContacts.map((contact) => (
          <article key={contact.id} className="panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-2xl text-[var(--text-strong)]">{contact.callsign}</h3>
                <p className="text-xs text-[var(--text-muted)]">{contact.route}</p>
              </div>
              <span className={clsx('rounded-full px-2 py-1 text-xs ring-1 capitalize', trustTone[contact.trust])}>
                {contact.trust}
              </span>
            </div>
            <p className="mt-3 text-sm text-[var(--text-soft)]">{contact.notes}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <InfoTag label="Role" value={contact.role} />
              <InfoTag label="Last exchange" value={contact.lastExchange} />
            </div>
            <div className="mt-4 flex gap-2">
              <button className="action-button px-3 py-1.5 text-xs">
                <MessageCircle className="h-3.5 w-3.5" />
                Message
              </button>
              <button className="action-button-alt px-3 py-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verify
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function PeersPage() {
  return (
    <section className="space-y-4">
      <PanelHeader
        title="Peers"
        subtitle="Live link health and queue pressure monitoring"
        chips={[{ label: `${peers.length} connected peers` }, { label: '1 degraded handshake' }, { label: '45ms median latency' }]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {peers.map((peer) => (
          <article key={peer.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl text-[var(--text-strong)]">{peer.transport}</p>
                <p className="text-xs text-[var(--text-muted)]">{peer.endpoint}</p>
              </div>
              <span className={clsx('text-xs uppercase tracking-[0.12em]', handshakeTone[peer.handshake])}>{peer.handshake}</span>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <MetricRow label="Latency" value={`${peer.latencyMs} ms`} />
              <MetricRow label="Uptime" value={peer.uptime} />
              <MetricRow label="Queue depth" value={String(peer.queueDepth)} />
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Queue pressure</span>
                <span>{Math.min(peer.queueDepth * 3, 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/40">
                <div
                  className={clsx(
                    'h-full rounded-full',
                    peer.queueDepth > 20
                      ? 'bg-gradient-to-r from-amber-400 to-orange-300'
                      : 'bg-gradient-to-r from-[var(--accent-cyan)] to-emerald-300',
                  )}
                  style={{ width: `${Math.min(peer.queueDepth * 3, 100)}%` }}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      <article className="panel p-4">
        <p className="section-title">Peer event stream</p>
        <div className="mt-3 space-y-2 text-sm">
          <EventRow icon={Antenna} text="10.88.4.21 handshake renewed (TLS cert: rev-19)" tone="good" />
          <EventRow icon={AlertTriangle} text="172.19.8.4 latency crossed 200ms for 4 samples" tone="warn" />
          <EventRow icon={Activity} text="100.67.11.90 packet queue drained to baseline" tone="neutral" />
        </div>
      </article>
    </section>
  )
}

function InterfacesPage() {
  const [links, setLinks] = useState(interfaceLinks)

  const toggleInterface = (id: string) => {
    setLinks((current) =>
      current.map((link) => {
        if (link.id !== id) {
          return link
        }

        const state: InterfaceLink['state'] = link.state === 'offline' ? 'online' : 'offline'
        const throughput = state === 'offline' ? '0 KB/s' : link.type === 'LoRa Serial' ? '182 KB/s' : '2.4 MB/s'

        return { ...link, state, throughput }
      }),
    )
  }

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Interface Management"
        subtitle="Transport links, packet throughput, and operational controls"
        chips={[{ label: `${links.length} configured interfaces` }, { label: '1 idle link' }, { label: 'manual failover ready' }]}
      />

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/25 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">MTU</th>
                <th className="px-4 py-3 font-medium">Throughput</th>
                <th className="px-4 py-3 font-medium">Packets</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-t border-white/10">
                  <td className="px-4 py-3 font-medium text-[var(--text-strong)]">{link.name}</td>
                  <td className="px-4 py-3 text-[var(--text-soft)]">{link.type}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('rounded-full px-2 py-1 text-xs uppercase tracking-[0.08em]', interfaceTone[link.state])}>
                      {link.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-soft)]">{link.mtu}</td>
                  <td className="px-4 py-3 text-[var(--text-soft)]">{link.throughput}</td>
                  <td className="px-4 py-3 text-[var(--text-soft)]">{link.packets}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleInterface(link.id)}
                      className={clsx(
                        'rounded-lg px-2.5 py-1.5 text-xs font-medium',
                        link.state === 'offline'
                          ? 'bg-emerald-300/20 text-emerald-100'
                          : 'bg-slate-500/30 text-slate-100',
                      )}
                    >
                      {link.state === 'offline' ? 'Enable' : 'Disable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="panel p-4 xl:col-span-2">
          <p className="section-title">Queue balancing profile</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InfoTag label="Inbound" value="4.2 MB/min" />
            <InfoTag label="Outbound" value="3.6 MB/min" />
            <InfoTag label="Pending retries" value="17" />
          </div>
          <p className="mt-4 text-sm text-[var(--text-soft)]">
            Relay migration mode is active. New sessions are weighted toward TCP links while LoRa recovers.
          </p>
        </article>

        <article className="panel p-4">
          <p className="section-title">Interface actions</p>
          <div className="mt-3 space-y-2 text-sm">
            <button className="menu-action">Create transport profile</button>
            <button className="menu-action">Run packet flush</button>
            <button className="menu-action">Rebind listener socket</button>
          </div>
        </article>
      </div>
    </section>
  )
}

function AnnouncesPage() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all peers')

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Announces"
        subtitle="Broadcast digest composition and distribution timeline"
        chips={[{ label: `${announcements.length} open announces` }, { label: 'urgent signature rotation' }, { label: 'next digest 09:00' }]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <article className="panel p-4">
          <p className="section-title">Timeline</p>
          <div className="mt-3 space-y-3">
            {announcements.map((announce) => (
              <div key={announce.id} className="rounded-2xl border border-white/10 bg-[var(--panel-soft)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-[var(--text-strong)]">{announce.title}</h3>
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-xs uppercase tracking-[0.08em]',
                      announce.priority === 'urgent'
                        ? 'bg-rose-400/20 text-rose-100'
                        : 'bg-cyan-300/20 text-cyan-100',
                    )}
                  >
                    {announce.priority}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {announce.author} to {announce.audience} | ttl {announce.ttl} | {announce.postedAt}
                </p>
                <p className="mt-2 text-sm text-[var(--text-soft)]">{announce.body}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel p-4">
          <p className="section-title">Compose announce</p>
          <label className="mt-3 block text-xs text-[var(--text-muted)]">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="field mt-1 w-full rounded-xl px-3 py-2 text-sm"
              placeholder="Add announce title"
            />
          </label>

          <label className="mt-3 block text-xs text-[var(--text-muted)]">
            Audience
            <select
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              className="field mt-1 w-full rounded-xl px-3 py-2 text-sm"
            >
              <option value="all peers">All peers</option>
              <option value="verified peers">Verified peers</option>
              <option value="archive sync">Archive sync</option>
            </select>
          </label>

          <label className="mt-3 block text-xs text-[var(--text-muted)]">
            Body
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              className="field mt-1 w-full rounded-xl px-3 py-2 text-sm"
              placeholder="Write the announcement payload"
            />
          </label>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="action-button px-3 py-2 text-sm">
              <Megaphone className="h-4 w-4" />
              Queue
            </button>
            <button className="action-button-alt px-3 py-2 text-sm">
              <Upload className="h-4 w-4" />
              Draft
            </button>
          </div>
        </article>
      </div>
    </section>
  )
}

function PaperPage() {
  const [selectedId, setSelectedId] = useState(paperEntries[0]?.id ?? '')
  const selectedPaper = paperEntries.find((entry) => entry.id === selectedId) ?? paperEntries[0]
  const [draft, setDraft] = useState(selectedPaper?.body ?? '')

  if (!selectedPaper) {
    return <div className="panel p-6 text-sm text-[var(--text-muted)]">No paper entries available.</div>
  }

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Paper"
        subtitle="Operational notes, playbooks, and incident write-ups"
        chips={[{ label: `${paperEntries.length} documents` }, { label: 'latest rev r12' }, { label: 'mirror synced 5m ago' }]}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <article className="panel p-3">
          <p className="section-title px-2 pb-2">Documents</p>
          <div className="space-y-2">
            {paperEntries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => {
                  setSelectedId(entry.id)
                  setDraft(entry.body)
                }}
                className={clsx(
                  'w-full rounded-xl border px-3 py-2 text-left transition',
                  entry.id === selectedPaper.id
                    ? 'border-[var(--accent-cyan)]/45 bg-[var(--panel-strong)]'
                    : 'border-white/10 bg-[var(--panel-soft)] hover:border-white/20',
                )}
              >
                <p className="font-medium text-[var(--text-strong)]">{entry.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{entry.category}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {entry.revision} | {entry.updatedAt}
                </p>
              </button>
            ))}
          </div>
        </article>

        <article className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <h3 className="font-display text-2xl text-[var(--text-strong)]">{selectedPaper.title}</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {selectedPaper.category} | {selectedPaper.revision} | {selectedPaper.updatedAt}
              </p>
            </div>
            <button className="action-button-alt px-3 py-2 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Save revision
            </button>
          </div>

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="field mt-3 min-h-[360px] w-full rounded-2xl p-3 font-mono text-[13px]"
          />
        </article>
      </div>
    </section>
  )
}

function AttachmentsPage() {
  const [kindFilter, setKindFilter] = useState<'all' | AttachmentItem['kind']>('all')

  const visibleAttachments = attachmentItems.filter((item) => (kindFilter === 'all' ? true : item.kind === kindFilter))

  return (
    <section className="space-y-4">
      <PanelHeader
        title="Attachments"
        subtitle="Payload files, linked sessions, and sealed state"
        chips={[{ label: `${attachmentItems.length} indexed files` }, { label: '2 sealed payloads' }, { label: 'vault usage 61%' }]}
      />

      <div className="panel p-4">
        <div className="flex flex-wrap gap-2">
          {(['all', 'image', 'doc', 'archive', 'audio'] as const).map((kind) => (
            <button
              key={kind}
              onClick={() => setKindFilter(kind)}
              className={clsx('pill px-3 py-1 text-sm capitalize', kindFilter === kind && 'ring-1 ring-[var(--accent-cyan)]/35')}
            >
              {kind}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <article className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleAttachments.map((item) => {
            const Icon = iconForAttachment(item.kind)
            return (
              <div key={item.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="rounded-xl border border-white/10 bg-[var(--panel-soft)] p-2">
                    <Icon className="h-5 w-5 text-[var(--accent-cyan)]" />
                  </div>
                  <span
                    className={clsx(
                      'rounded-full px-2 py-0.5 text-xs uppercase tracking-[0.08em]',
                      item.sealed ? 'bg-emerald-400/20 text-emerald-100' : 'bg-slate-500/35 text-slate-100',
                    )}
                  >
                    {item.sealed ? 'sealed' : 'open'}
                  </span>
                </div>
                <h3 className="mt-3 font-medium text-[var(--text-strong)]">{item.name}</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{item.size}</p>
                <div className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
                  <p>Owner: {item.owner}</p>
                  <p>Linked: {item.linkedTo}</p>
                  <p>Updated: {item.modifiedAt}</p>
                </div>
              </div>
            )
          })}
        </article>

        <article className="panel p-4">
          <p className="section-title">Ingest</p>
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--accent-cyan)]/45 bg-[var(--panel-soft)] p-5 text-center">
            <Upload className="mx-auto h-8 w-8 text-[var(--accent-cyan)]" />
            <p className="mt-3 text-sm text-[var(--text-soft)]">Drop files or route from message threads</p>
            <button className="action-button mt-3 px-3 py-2 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Select files
            </button>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <button className="menu-action">Seal selected attachments</button>
            <button className="menu-action">Attach to active announce</button>
            <button className="menu-action">Push to paper mirror</button>
          </div>
        </article>
      </div>
    </section>
  )
}

function PanelHeader({
  title,
  subtitle,
  chips,
}: {
  title: string
  subtitle: string
  chips: Array<{ label: string }>
}) {
  return (
    <div className="panel px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl leading-none text-[var(--text-strong)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span key={chip.label} className="pill px-2.5 py-1 text-xs">
              {chip.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-2.5 py-2 text-xs">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-medium text-[var(--text-strong)]">{value}</span>
    </div>
  )
}

function InfoTag({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
      <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm text-[var(--text-soft)]">{value}</p>
    </div>
  )
}

function EventRow({
  icon: Icon,
  text,
  tone,
}: {
  icon: LucideIcon
  text: string
  tone: 'good' | 'warn' | 'neutral'
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[var(--panel-soft)] px-3 py-2">
      <Icon
        className={clsx(
          'h-4 w-4',
          tone === 'good' && 'text-emerald-300',
          tone === 'warn' && 'text-amber-200',
          tone === 'neutral' && 'text-cyan-200',
        )}
      />
      <p className="text-[var(--text-soft)]">{text}</p>
    </div>
  )
}

function iconForAttachment(kind: AttachmentItem['kind']): LucideIcon {
  switch (kind) {
    case 'image':
      return Image
    case 'archive':
      return Archive
    case 'audio':
      return Mic
    default:
      return FileText
  }
}

export default App
