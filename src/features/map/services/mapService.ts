import { listLxmfMessages, sendLxmfMessage } from '@lib/lxmf-api'
import {
  parseMapPointsOffThread,
  type ParsedMapPoint as MapPoint,
} from '@features/messages/services/payloadParseWorker'

export type { MapPoint }

export async function fetchMapPoints(): Promise<MapPoint[]> {
  const response = await listLxmfMessages()
  return await parseMapPointsOffThread(response.messages)
}

export async function sendLocationToDestination(input: {
  destination: string
  lat: number
  lon: number
  label?: string
}): Promise<void> {
  const headline = input.label?.trim() || 'Shared location'
  const content = `${headline}\ngeo:${input.lat.toFixed(6)},${input.lon.toFixed(6)}`
  await sendLxmfMessage({
    destination: input.destination,
    title: 'Location',
    content,
    telemetryLocation: {
      lat: input.lat,
      lon: input.lon,
    },
    fields: {
      location: {
        lat: input.lat,
        lon: input.lon,
      },
    },
  })
}
