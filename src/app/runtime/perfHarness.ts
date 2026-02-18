type Summary = {
  count: number
  minMs: number | null
  maxMs: number | null
  meanMs: number | null
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
}

type ThreadOpenBenchOptions = {
  samples?: number
  warmup?: number
  settleMs?: number
}

type MessageSearchBenchOptions = {
  samples?: number
  warmup?: number
  terms?: string[]
}

type ScrollBenchOptions = {
  durationMs?: number
}

type InteractionSuiteOptions = {
  threadOpen?: ThreadOpenBenchOptions
  search?: MessageSearchBenchOptions
  scroll?: ScrollBenchOptions
}

type InteractionSuiteResult = {
  generatedAt: string
  startupInteractiveMs: number | null
  threadOpen: Summary & { targetP95Ms: number; pass: boolean }
  search: Summary & { targetP95Ms: number; pass: boolean }
  scroll: {
    durationMs: number
    slowFramePercent: number
    targetSlowFramePercent: number
    pass: boolean
  }
  startup: { targetInteractiveMs: number; pass: boolean }
}

type PerfHarnessApi = {
  enabled: true
  startupInteractiveMs: () => number | null
  runThreadOpenBenchmark: (options?: ThreadOpenBenchOptions) => Promise<Summary>
  runMessageSearchBenchmark: (options?: MessageSearchBenchOptions) => Promise<Summary>
  runScrollBenchmark: (options?: ScrollBenchOptions) => Promise<{
    durationMs: number
    slowFramePercent: number
  }>
  runInteractionSuite: (options?: InteractionSuiteOptions) => Promise<InteractionSuiteResult>
}

declare global {
  interface Window {
    __WEFT_PERF__?: PerfHarnessApi
  }
}

const PERF_ENABLED =
  import.meta.env.DEV || String(import.meta.env.VITE_ENABLE_PERF_HARNESS ?? '') === 'true'

const state = {
  bootAtMs: 0,
  interactiveAtMs: null as number | null,
  interactiveMarker: '' as string,
}

export function initWeftPerfHarness() {
  if (!PERF_ENABLED || typeof window === 'undefined') {
    return
  }
  if (window.__WEFT_PERF__) {
    return
  }
  state.bootAtMs = performance.now()

  window.__WEFT_PERF__ = {
    enabled: true,
    startupInteractiveMs: () => {
      if (state.interactiveAtMs === null) {
        return null
      }
      return round(state.interactiveAtMs - state.bootAtMs)
    },
    runThreadOpenBenchmark,
    runMessageSearchBenchmark,
    runScrollBenchmark,
    runInteractionSuite,
  }
}

export function markWeftInteractive(marker: string) {
  if (!PERF_ENABLED || typeof window === 'undefined') {
    return
  }
  if (state.interactiveAtMs !== null) {
    return
  }
  state.interactiveAtMs = performance.now()
  state.interactiveMarker = marker
}

async function runThreadOpenBenchmark(options: ThreadOpenBenchOptions = {}): Promise<Summary> {
  const samples = clampInt(options.samples ?? 32, 1, 500)
  const warmup = clampInt(options.warmup ?? 8, 0, 200)
  const settleMs = clampInt(options.settleMs ?? 36, 0, 1000)
  const totalRuns = warmup + samples
  const durations: number[] = []

  for (let i = 0; i < totalRuns; i += 1) {
    const links = getThreadLinks()
    if (links.length < 1) {
      throw new Error('No thread links found. Open Chats first and ensure data is loaded.')
    }
    const target = links[i % links.length]
    const startedAt = performance.now()
    target.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, view: window })
    )
    await waitFor(() => Boolean(getThreadSearchInput()), 5_000)
    await nextFrame()
    await nextFrame()
    const elapsed = performance.now() - startedAt
    if (i >= warmup) {
      durations.push(elapsed)
    }
    if (settleMs > 0) {
      await sleep(settleMs)
    }
  }

  return summarize(durations)
}

async function runMessageSearchBenchmark(
  options: MessageSearchBenchOptions = {}
): Promise<Summary> {
  const samples = clampInt(options.samples ?? 36, 1, 500)
  const warmup = clampInt(options.warmup ?? 8, 0, 200)
  const terms = (options.terms ?? ['status', 'relay', 'receipt', 'retry', 'update'])
    .map(value => value.trim().toLowerCase())
    .filter(value => value.length >= 3)
  if (terms.length === 0) {
    throw new Error('Search terms must include at least one token with length >= 3.')
  }
  const input = getThreadSearchInput()
  if (!input) {
    throw new Error('Message search input not found. Open a specific thread first.')
  }

  const durations: number[] = []
  const totalRuns = warmup + samples
  for (let i = 0; i < totalRuns; i += 1) {
    const term = `${terms[i % terms.length]} ${i % 11}`
    const startedAt = performance.now()
    input.value = term
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextFrame()
    await nextFrame()
    const elapsed = performance.now() - startedAt
    if (i >= warmup) {
      durations.push(elapsed)
    }
  }
  input.value = ''
  input.dispatchEvent(new Event('input', { bubbles: true }))

  return summarize(durations)
}

async function runScrollBenchmark(options: ScrollBenchOptions = {}): Promise<{
  durationMs: number
  slowFramePercent: number
}> {
  const durationMs = clampInt(options.durationMs ?? 12_000, 1_000, 120_000)
  const container = await waitForScrollContainer(5_000)
  await nextFrame()

  const result = await new Promise<{ slowFramePercent: number }>(resolve => {
    const startedAt = performance.now()
    let lastFrameAt = startedAt
    let frameCount = 0
    let slowFrameCount = 0
    const cycleMs = 2_200

    const step = (now: number) => {
      frameCount += 1
      const delta = now - lastFrameAt
      if (delta > 18) {
        slowFrameCount += 1
      }
      lastFrameAt = now

      const maxScroll = Math.max(container.scrollHeight - container.clientHeight, 0)
      const phase = ((now - startedAt) % cycleMs) / cycleMs
      const pingPong = phase < 0.5 ? phase * 2 : (1 - phase) * 2
      container.scrollTop = Math.round(maxScroll * pingPong)

      if (now - startedAt < durationMs) {
        window.requestAnimationFrame(step)
        return
      }

      const slowFramePercent = frameCount > 0 ? (slowFrameCount / frameCount) * 100 : 0
      resolve({ slowFramePercent: round(slowFramePercent) })
    }

    window.requestAnimationFrame(step)
  })

  return {
    durationMs,
    slowFramePercent: result.slowFramePercent,
  }
}

async function runInteractionSuite(
  options: InteractionSuiteOptions = {}
): Promise<InteractionSuiteResult> {
  const threadOpen = await runThreadOpenBenchmark(options.threadOpen)
  const search = await runMessageSearchBenchmark(options.search)
  const scroll = await runScrollBenchmark(options.scroll)
  const startupInteractiveMs =
    state.interactiveAtMs === null ? null : round(state.interactiveAtMs - state.bootAtMs)

  const output: InteractionSuiteResult = {
    generatedAt: new Date().toISOString(),
    startupInteractiveMs,
    threadOpen: {
      ...threadOpen,
      targetP95Ms: 100,
      pass: threadOpen.p95Ms !== null ? threadOpen.p95Ms < 100 : false,
    },
    search: {
      ...search,
      targetP95Ms: 100,
      pass: search.p95Ms !== null ? search.p95Ms < 100 : false,
    },
    scroll: {
      ...scroll,
      targetSlowFramePercent: 10,
      pass: scroll.slowFramePercent < 10,
    },
    startup: {
      targetInteractiveMs: 1800,
      pass: startupInteractiveMs !== null ? startupInteractiveMs < 1800 : false,
    },
  }
  return output
}

function getThreadLinks(): HTMLAnchorElement[] {
  const anchors = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
  return anchors.filter(anchor => {
    const href = anchor.getAttribute('href') ?? ''
    return /^\/?chats\/[^/]+/.test(href.replace(/^#/, ''))
  })
}

function getThreadSearchInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    'input[placeholder="Search messages in this thread"]'
  )
}

async function waitForScrollContainer(timeoutMs: number): Promise<HTMLDivElement> {
  const found = await waitFor(
    () => document.querySelector<HTMLDivElement>('[data-weft-message-scroll-container="true"]'),
    timeoutMs
  )
  if (!found) {
    throw new Error('Message timeline scroll container not found.')
  }
  return found
}

async function waitFor<T>(
  check: () => T | null | undefined | false,
  timeoutMs: number
): Promise<T | null> {
  const startedAt = performance.now()
  while (performance.now() - startedAt <= timeoutMs) {
    const value = check()
    if (value) {
      return value
    }
    await sleep(16)
  }
  return null
}

function sleep(ms: number) {
  return new Promise<void>(resolve => {
    window.setTimeout(resolve, ms)
  })
}

function nextFrame() {
  return new Promise<void>(resolve => {
    window.requestAnimationFrame(() => resolve())
  })
}

function summarize(values: number[]): Summary {
  if (values.length === 0) {
    return {
      count: 0,
      minMs: null,
      maxMs: null,
      meanMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((total, value) => total + value, 0)
  return {
    count: values.length,
    minMs: round(sorted[0]),
    maxMs: round(sorted[sorted.length - 1]),
    meanMs: round(sum / values.length),
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
  }
}

function percentile(sorted: number[], percentileValue: number): number {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  )
  return sorted[index]
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
