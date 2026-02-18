import { type ParsedMapPoint as MapPoint } from '@features/messages/services/payloadParseWorker'
import { lxmfQueryMapPoints, sendLxmfMessage } from '@lib/lxmf-api'

export type { MapPoint }

export async function fetchMapPoints(): Promise<MapPoint[]> {
  const response = await lxmfQueryMapPoints({}, { limit: 1500 })
  return response.items.map(item => ({
    id: item.id,
    label: item.label,
    lat: item.lat,
    lon: item.lon,
    source: item.source,
    when: item.when,
    direction: item.direction,
  }))
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
