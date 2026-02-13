import { useEffect, useMemo, useRef, useState } from 'react'
import { PageHeading } from '../../../shared/ui/PageHeading'
import { Panel } from '../../../shared/ui/Panel'
import { matchesQuery } from '../../../shared/utils/search'
import { parseLxmfContactReference } from '../../../shared/utils/contactReference'
import { FOCUS_SEARCH_EVENT } from '../../../shared/runtime/shortcuts'
import { sendLocationToDestination } from '../services/mapService'
import { useMapPoints } from '../state/useMapPoints'

export function MapPage() {
  const { points, loading, error, refresh } = useMapPoints()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [destinationInput, setDestinationInput] = useState('')
  const [locationLabel, setLocationLabel] = useState('My location')
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const filteredPoints = useMemo(
    () =>
      points.filter((point) =>
        matchesQuery(query, [point.label, point.source, point.when, point.lat, point.lon]),
      ),
    [points, query],
  )
  const selectedPoint = useMemo(
    () => filteredPoints.find((point) => point.id === selectedId) ?? filteredPoints[0] ?? null,
    [filteredPoints, selectedId],
  )

  useEffect(() => {
    const onFocusSearch = () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    }
  }, [])

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel className="flex min-h-0 flex-col">
        <PageHeading
          title="Map"
          subtitle="Location points found in messages"
          action={
            <button
              onClick={() => {
                void refresh()
              }}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Refresh
            </button>
          }
        />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mb-3 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
          placeholder="Search points by label, source, or coordinates"
        />
        {loading ? <p className="text-sm text-slate-500">Loading map points...</p> : null}
        {error ? <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
        {!loading && points.length === 0 ? (
          <p className="text-sm text-slate-500">
            No location points found yet. Share messages with `geo:lat,lon` to populate this map.
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ul className="space-y-2">
            {filteredPoints.map((point) => (
              <li key={point.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(point.id)}
                  className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                    selectedPoint?.id === point.id
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-slate-900">{point.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {point.lat.toFixed(5)}, {point.lon.toFixed(5)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {point.when} • {point.source}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <PageHeading
          title={selectedPoint ? selectedPoint.label : 'Map preview'}
          subtitle={
            selectedPoint
              ? `${selectedPoint.lat.toFixed(5)}, ${selectedPoint.lon.toFixed(5)}`
              : 'Select a point'
          }
        />
        {selectedPoint ? (
          <iframe
            title="OpenStreetMap Preview"
            src={mapEmbedUrl(selectedPoint.lat, selectedPoint.lon)}
            className="mb-4 min-h-[320px] w-full flex-1 rounded-2xl border border-slate-200"
            loading="lazy"
          />
        ) : (
          <div className="mb-4 flex min-h-[320px] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
            Map preview appears after selecting a point.
          </div>
        )}
        {selectedPoint ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <a
              href={mapOpenUrl(selectedPoint.lat, selectedPoint.lon)}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Open in browser
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(`geo:${selectedPoint.lat},${selectedPoint.lon}`)
                setShareFeedback('Coordinate copied.')
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Copy coordinate
            </button>
          </div>
        ) : null}

        <form
          className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void (async () => {
              const parsedDestination = parseLxmfContactReference(destinationInput)
              if (!parsedDestination.ok) {
                setShareFeedback(parsedDestination.error)
                return
              }
              if (!navigator.geolocation) {
                setShareFeedback('Geolocation is not available on this device.')
                return
              }
              try {
                setSharing(true)
                const position = await readCurrentLocation()
                await sendLocationToDestination({
                  destination: parsedDestination.value.destinationHash,
                  lat: position.coords.latitude,
                  lon: position.coords.longitude,
                  label: locationLabel,
                })
                setShareFeedback('Location sent.')
                setDestinationInput('')
              } catch (sendError) {
                setShareFeedback(sendError instanceof Error ? sendError.message : String(sendError))
              } finally {
                setSharing(false)
              }
            })()
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Share your location
          </p>
          <input
            value={destinationInput}
            onChange={(event) => {
              setDestinationInput(event.target.value)
              setShareFeedback(null)
            }}
            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
            placeholder="Destination hash or lxma:// link"
          />
          <input
            value={locationLabel}
            onChange={(event) => setLocationLabel(event.target.value)}
            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-300"
            placeholder="Location label"
          />
          <button
            type="submit"
            disabled={sharing}
            className="mt-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {sharing ? 'Sending...' : 'Send current location'}
          </button>
          {shareFeedback ? <p className="mt-2 text-xs text-slate-600">{shareFeedback}</p> : null}
        </form>
      </Panel>
    </div>
  )
}

function mapEmbedUrl(lat: number, lon: number): string {
  const box = {
    west: lon - 0.01,
    east: lon + 0.01,
    south: lat - 0.01,
    north: lat + 0.01,
  }
  const bbox = `${box.west}%2C${box.south}%2C${box.east}%2C${box.north}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`
}

function mapOpenUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`
}

function readCurrentLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12_000,
      maximumAge: 30_000,
    })
  })
}
