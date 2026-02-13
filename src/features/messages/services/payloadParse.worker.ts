/// <reference lib="webworker" />
import type { LxmfMessageRecord } from '@lib/lxmf-payloads'
import { extractFilesFromMessages, extractMapPointsFromMessages } from './payloadParseCore'

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

self.onmessage = (event: MessageEvent<ParseWorkerRequest>) => {
  const request = event.data
  try {
    const result =
      request.kind === 'map_points'
        ? extractMapPointsFromMessages(request.messages)
        : extractFilesFromMessages(request.messages)
    const response: ParseWorkerSuccessResponse = {
      id: request.id,
      ok: true,
      result,
    }
    self.postMessage(response satisfies ParseWorkerResponse)
  } catch (error) {
    const response: ParseWorkerErrorResponse = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    self.postMessage(response satisfies ParseWorkerResponse)
  }
}

export {}
