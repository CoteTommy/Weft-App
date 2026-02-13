import type { LxmfMessageRecord } from '@lib/lxmf-payloads'
import type { FileItem } from '@shared/types/files'
import {
  extractFilesFromMessages,
  extractMapPointsFromMessages,
  type ParsedMapPoint,
} from './payloadParseCore'

export type { ParsedMapPoint } from './payloadParseCore'

type ParseJobKind = 'map_points' | 'file_items'

interface ParseWorkerRequest {
  id: number
  kind: ParseJobKind
  messages: LxmfMessageRecord[]
}

interface ParseWorkerSuccessResponse {
  id: number
  ok: true
  result: unknown
}

interface ParseWorkerErrorResponse {
  id: number
  ok: false
  error: string
}

type ParseWorkerResponse = ParseWorkerSuccessResponse | ParseWorkerErrorResponse

let worker: Worker | null = null
let workerFailed = false
let jobId = 0
const pending = new Map<
  number,
  {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }
>()

export async function parseMapPointsOffThread(
  messages: LxmfMessageRecord[],
): Promise<ParsedMapPoint[]> {
  try {
    const parsed = await runParseJob('map_points', messages)
    return parsed as ParsedMapPoint[]
  } catch {
    return extractMapPointsFromMessages(messages)
  }
}

export async function parseFileItemsOffThread(
  messages: LxmfMessageRecord[],
): Promise<FileItem[]> {
  try {
    const parsed = await runParseJob('file_items', messages)
    return parsed as FileItem[]
  } catch {
    return extractFilesFromMessages(messages)
  }
}

function runParseJob(kind: ParseJobKind, messages: LxmfMessageRecord[]): Promise<unknown> {
  const instance = getWorker()
  if (!instance) {
    return Promise.reject(new Error('worker unavailable'))
  }
  const id = ++jobId
  const request: ParseWorkerRequest = { id, kind, messages }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    try {
      instance.postMessage(request)
    } catch (error) {
      pending.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function getWorker(): Worker | null {
  if (workerFailed || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null
  }
  if (worker) {
    return worker
  }
  try {
    worker = new Worker(new URL('./payloadParse.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<ParseWorkerResponse>) => {
      const response = event.data
      const job = pending.get(response.id)
      if (!job) {
        return
      }
      pending.delete(response.id)
      if (response.ok) {
        job.resolve(response.result)
      } else {
        job.reject(new Error(response.error))
      }
    }
    worker.onerror = () => {
      workerFailed = true
      worker?.terminate()
      worker = null
      for (const [, job] of pending.entries()) {
        job.reject(new Error('payload parse worker crashed'))
      }
      pending.clear()
    }
    return worker
  } catch {
    workerFailed = true
    return null
  }
}
