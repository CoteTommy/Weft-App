import { invokeWithProbe, parseLxmfSendMessageResponse } from './common'
import type {
  LxmfSendCommandOptions,
  LxmfSendMessageOptions,
  LxmfSendMessageResponse,
  LxmfSendRichMessageOptions,
} from './types'

export async function sendLxmfMessage(
  options: LxmfSendMessageOptions
): Promise<LxmfSendMessageResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_send_message', options, {
    destination: options.destination,
    content: options.content,
    title: options.title ?? null,
    source: options.source ?? null,
    id: options.id ?? null,
    fields: options.fields ?? null,
    method: options.method ?? null,
    stamp_cost: options.stampCost ?? null,
    include_ticket: options.includeTicket ?? null,
    reply_to: options.replyToId ?? null,
    reaction_to: options.reaction?.to ?? null,
    reaction_emoji: options.reaction?.emoji ?? null,
    reaction_sender: options.reaction?.sender ?? null,
    telemetry_location: options.telemetryLocation ?? null,
  })
  return parseLxmfSendMessageResponse(payload)
}

export async function sendLxmfCommand(
  options: LxmfSendCommandOptions
): Promise<LxmfSendMessageResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_send_command', options, {
    destination: options.destination,
    commands: options.commands ?? null,
    commands_hex: options.commandsHex ?? null,
    content: options.content ?? null,
    title: options.title ?? null,
    source: options.source ?? null,
    id: options.id ?? null,
    method: options.method ?? null,
    stamp_cost: options.stampCost ?? null,
    include_ticket: options.includeTicket ?? null,
  })
  return parseLxmfSendMessageResponse(payload)
}

export async function sendLxmfRichMessage(
  options: LxmfSendRichMessageOptions
): Promise<LxmfSendMessageResponse> {
  const payload = await invokeWithProbe<unknown>('lxmf_send_rich_message', options, {
    destination: options.destination,
    content: options.content,
    title: options.title ?? null,
    source: options.source ?? null,
    id: options.id ?? null,
    attachments:
      options.attachments?.map(attachment => ({
        name: attachment.name,
        data_base64: attachment.dataBase64,
        mime: attachment.mime ?? null,
        size_bytes: attachment.sizeBytes ?? null,
      })) ?? null,
    method: options.method ?? null,
    stamp_cost: options.stampCost ?? null,
    include_ticket: options.includeTicket ?? null,
    reply_to: options.replyToId ?? null,
    reaction_to: options.reaction?.to ?? null,
    reaction_emoji: options.reaction?.emoji ?? null,
    reaction_sender: options.reaction?.sender ?? null,
    telemetry_location: options.telemetryLocation ?? null,
  })
  return parseLxmfSendMessageResponse(payload)
}

export async function sendLxmfRichMessageRefs(
  options: LxmfSendRichMessageOptions
): Promise<LxmfSendMessageResponse> {
  const request = {
    destination: options.destination,
    content: options.content,
    title: options.title ?? null,
    source: options.source ?? null,
    id: options.id ?? null,
    attachments:
      options.attachments?.map(attachment => ({
        name: attachment.name,
        data_base64: attachment.dataBase64,
        mime: attachment.mime ?? null,
        size_bytes: attachment.sizeBytes ?? null,
      })) ?? null,
    method: options.method ?? null,
    stamp_cost: options.stampCost ?? null,
    include_ticket: options.includeTicket ?? null,
    reply_to: options.replyToId ?? null,
    reaction_to: options.reaction?.to ?? null,
    reaction_emoji: options.reaction?.emoji ?? null,
    reaction_sender: options.reaction?.sender ?? null,
    telemetry_location: options.telemetryLocation ?? null,
  }

  try {
    const payload = await invokeWithProbe<unknown>('lxmf_send_rich_message_refs', options, request)
    return parseLxmfSendMessageResponse(payload)
  } catch {
    return await sendLxmfRichMessage(options)
  }
}
