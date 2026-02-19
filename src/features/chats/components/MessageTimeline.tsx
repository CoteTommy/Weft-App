import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { ChatMessage } from '@shared/types/chat'
import { getLxmfMessageDeliveryTrace } from '@lib/lxmf-api'

import { loadAttachmentPreview } from './messageTimeline/attachmentPreviewAdapter'
import { MessageDetailsDialog } from './messageTimeline/MessageDetailsDialog'
import { VirtualMessageList } from './messageTimeline/VirtualMessageList'
import { buildFailureGuidance } from './messageTimelineFormatting'

interface MessageTimelineProps {
  messages: ChatMessage[]
  className?: string
  onRetry?: (message: ChatMessage) => Promise<void> | void
}

export function MessageTimeline({ messages, className, onRetry }: MessageTimelineProps) {
  const navigate = useNavigate()
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [fetchedDeliveryTrace, setFetchedDeliveryTrace] = useState<
    NonNullable<ChatMessage['deliveryTrace']>
  >([])
  const [deliveryTraceLoading, setDeliveryTraceLoading] = useState(false)
  const holdTimeoutRef = useRef<number | null>(null)
  const holdTriggeredRef = useRef(false)
  const [stickToBottom, setStickToBottom] = useState(true)

  const selectedMessage = useMemo(
    () => messages.find(message => message.id === selectedMessageId) ?? null,
    [messages, selectedMessageId]
  )

  const deliveryTrace = useMemo(() => {
    if (!selectedMessage) {
      return []
    }
    const fromMessage = selectedMessage.deliveryTrace ?? []
    if (fromMessage.length > 0) {
      return fromMessage
    }
    if (selectedMessage.sender !== 'self') {
      return []
    }
    return fetchedDeliveryTrace
  }, [fetchedDeliveryTrace, selectedMessage])

  const selectedReasonCode = useMemo(() => {
    if (!selectedMessage) {
      return undefined
    }
    if (selectedMessage.statusReasonCode) {
      return selectedMessage.statusReasonCode
    }
    for (let index = deliveryTrace.length - 1; index >= 0; index -= 1) {
      const value = deliveryTrace[index]?.reasonCode
      if (value) {
        return value
      }
    }
    return undefined
  }, [deliveryTrace, selectedMessage])

  const failureGuidance = useMemo(
    () => buildFailureGuidance(selectedReasonCode),
    [selectedReasonCode]
  )

  const closeModal = useCallback(() => {
    setSelectedMessageId(null)
    setCopyFeedback(null)
  }, [])

  const clearHoldTimer = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }
  }, [])

  const startHold = useCallback(
    (message: ChatMessage) => {
      holdTriggeredRef.current = false
      clearHoldTimer()
      holdTimeoutRef.current = window.setTimeout(() => {
        holdTriggeredRef.current = true
        setSelectedMessageId(message.id)
        setCopyFeedback(null)
      }, 420)
    },
    [clearHoldTimer]
  )

  const openDetails = useCallback((message: ChatMessage) => {
    if (holdTriggeredRef.current) {
      holdTriggeredRef.current = false
      return
    }
    setSelectedMessageId(message.id)
    setCopyFeedback(null)
  }, [])

  useEffect(
    () => () => {
      if (holdTimeoutRef.current !== null) {
        window.clearTimeout(holdTimeoutRef.current)
      }
    },
    []
  )

  useEffect(() => {
    if (!selectedMessage) {
      return
    }
    const fromMessage = selectedMessage.deliveryTrace ?? []
    if (fromMessage.length > 0) {
      return
    }
    if (selectedMessage.sender !== 'self') {
      return
    }
    let disposed = false
    queueMicrotask(() => {
      if (!disposed) {
        setFetchedDeliveryTrace([])
        setDeliveryTraceLoading(true)
      }
    })
    void getLxmfMessageDeliveryTrace(selectedMessage.id)
      .then(trace => {
        if (disposed) {
          return
        }
        setFetchedDeliveryTrace(
          trace.transitions.map(entry => ({
            status: entry.status,
            timestamp: entry.timestamp,
            reasonCode: entry.reason_code,
          }))
        )
      })
      .catch(() => {
        if (!disposed) {
          setFetchedDeliveryTrace([])
        }
      })
      .finally(() => {
        if (!disposed) {
          setDeliveryTraceLoading(false)
        }
      })
    return () => {
      disposed = true
    }
  }, [selectedMessage])

  const withAttachmentPreview = useCallback(
    async (
      messageId: string,
      attachment: ChatMessage['attachments'][number],
      action: (value: { objectUrl: string; blob: Blob }) => void
    ) => {
      try {
        const preview = await loadAttachmentPreview(messageId, attachment)
        action({
          objectUrl: preview.objectUrl,
          blob: preview.blob,
        })
      } catch (blobError) {
        setCopyFeedback(blobError instanceof Error ? blobError.message : String(blobError))
      }
    },
    []
  )

  return (
    <>
      <VirtualMessageList
        messages={messages}
        className={className}
        stickToBottom={stickToBottom}
        onStickToBottomChange={setStickToBottom}
        onStartHold={startHold}
        onClearHoldTimer={clearHoldTimer}
        onOpenDetails={openDetails}
      />

      <MessageDetailsDialog
        message={selectedMessage}
        deliveryTrace={deliveryTrace}
        deliveryTraceLoading={deliveryTraceLoading}
        failureGuidance={failureGuidance}
        copyFeedback={copyFeedback}
        setCopyFeedback={setCopyFeedback}
        onClose={closeModal}
        onRetry={onRetry}
        onOpenAttachment={(messageId, attachment) => {
          void withAttachmentPreview(messageId, attachment, loaded => {
            window.open(loaded.objectUrl, '_blank', 'noopener,noreferrer')
          })
        }}
        onSaveAttachment={(messageId, attachment) => {
          void withAttachmentPreview(messageId, attachment, loaded => {
            const anchor = document.createElement('a')
            anchor.href = loaded.objectUrl
            anchor.download = attachment.name
            anchor.click()
          })
        }}
        onNavigate={path => {
          void navigate(path)
        }}
      />
    </>
  )
}
