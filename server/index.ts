import { parseLxmfDaemonLocalStatus, parseLxmfProbeReport } from '../shared/lxmf-probe'

const PORT = Number(process.env.WEFT_API_PORT ?? '8787')
const HOST = process.env.WEFT_API_HOST ?? '127.0.0.1'
const LXMF_BIN = process.env.LXMF_BIN ?? 'lxmf'

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch: async (request) => {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse(200, { ok: true, service: 'weft-api' })
    }

    if (request.method === 'GET' && url.pathname === '/api/lxmf/probe') {
      return handleProbe(url)
    }
    if (request.method === 'GET' && url.pathname === '/api/lxmf/daemon/status') {
      return handleDaemonStatus(url)
    }
    if (request.method === 'POST' && url.pathname === '/api/lxmf/daemon/start') {
      return handleDaemonMutation(request, url, 'start')
    }
    if (request.method === 'POST' && url.pathname === '/api/lxmf/daemon/stop') {
      return handleDaemonMutation(request, url, 'stop')
    }
    if (request.method === 'POST' && url.pathname === '/api/lxmf/daemon/restart') {
      return handleDaemonMutation(request, url, 'restart')
    }

    return jsonResponse(404, { error: 'not_found' })
  },
})

console.log(`weft api listening on http://${server.hostname}:${server.port}`)

async function handleProbe(url: URL): Promise<Response> {
  const { profile, rpc, error } = parseRuntimeSelector(url)
  if (error) {
    return jsonResponse(400, { error })
  }

  try {
    const raw = await runLxmfJson(profile, rpc, ['daemon', 'probe'])
    const report = parseLxmfProbeReport(raw)
    return jsonResponse(200, report)
  } catch (error) {
    const detail = formatError(error)
    const status = detail.includes('Executable not found') ? 502 : 500
    return jsonResponse(status, {
      error: 'probe execution error',
      detail,
      hint: detail.includes('Executable not found')
        ? 'set LXMF_BIN to the lxmf binary path or add lxmf to PATH'
        : null,
    })
  }
}

async function handleDaemonStatus(url: URL): Promise<Response> {
  const { profile, rpc, error } = parseRuntimeSelector(url)
  if (error) {
    return jsonResponse(400, { error })
  }
  try {
    const raw = await runLxmfJson(profile, rpc, ['daemon', 'status'])
    const status = parseLxmfDaemonLocalStatus(extractLocalStatus(raw))
    return jsonResponse(200, status)
  } catch (error) {
    return daemonErrorResponse(error)
  }
}

async function handleDaemonMutation(
  request: Request,
  url: URL,
  action: 'start' | 'stop' | 'restart',
): Promise<Response> {
  const { profile, rpc, error } = parseRuntimeSelector(url)
  if (error) {
    return jsonResponse(400, { error })
  }

  let payload: {
    managed?: unknown
    reticulumd?: unknown
    transport?: unknown
  }
  try {
    payload = (await request.json()) as typeof payload
  } catch {
    payload = {}
  }

  const managed = typeof payload.managed === 'boolean' ? payload.managed : undefined
  const reticulumd = normalizeArg(asString(payload.reticulumd))
  const transport = normalizeArg(asString(payload.transport))

  try {
    const command = ['daemon', action]
    if (managed) {
      command.push('--managed')
    }
    if (reticulumd) {
      command.push('--reticulumd', reticulumd)
    }
    if (transport) {
      command.push('--transport', transport)
    }

    const raw = await runLxmfJson(profile, rpc, command)
    const status = parseLxmfDaemonLocalStatus(extractLocalStatus(raw))
    return jsonResponse(200, status)
  } catch (error) {
    return daemonErrorResponse(error)
  }
}

function parseRuntimeSelector(url: URL): {
  profile: string
  rpc: string | null
  error: string | null
} {
  const profile = normalizeArg(url.searchParams.get('profile')) ?? 'default'
  const rpc = normalizeArg(url.searchParams.get('rpc'))

  if (!isValidProfile(profile)) {
    return { profile, rpc, error: 'invalid profile value' }
  }
  if (rpc !== null && rpc.length > 256) {
    return { profile, rpc, error: 'invalid rpc value' }
  }

  return { profile, rpc, error: null }
}

async function runLxmfJson(profile: string, rpc: string | null, command: string[]): Promise<unknown> {
  const args = [LXMF_BIN, '--json', '--profile', profile]
  if (rpc) {
    args.push('--rpc', rpc)
  }
  args.push(...command)

  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    readStreamText(proc.stdout),
    readStreamText(proc.stderr),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `exit code ${exitCode}`)
  }

  return JSON.parse(stdout)
}

function daemonErrorResponse(error: unknown): Response {
  const detail = formatError(error)
  const status = detail.includes('Executable not found') ? 502 : 500
  return jsonResponse(status, {
    error: 'daemon command failed',
    detail,
    hint: detail.includes('Executable not found')
      ? 'set LXMF_BIN to the lxmf binary path or add lxmf to PATH'
      : null,
  })
}

function extractLocalStatus(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value
  }
  const record = value as Record<string, unknown>
  if (typeof record.local === 'object' && record.local !== null && !Array.isArray(record.local)) {
    return record.local
  }
  return value
}

function normalizeArg(value: string | null): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isValidProfile(value: string): boolean {
  return value.length <= 64 && /^[A-Za-z0-9._-]+$/.test(value)
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }
  return null
}

async function readStreamText(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) {
    return ''
  }
  return await new Response(stream).text()
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
