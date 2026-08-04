import { useEffect, useRef, useState } from 'react'
import { Check, Crosshair, Link2, Loader2, MapPin, Map as MapIcon, X } from 'lucide-react'
import { Button, Field, Input } from './ui'
import { googleMapsEnabled, loadGoogleMaps, reverseGeocode } from '../lib/googleMaps'
import { formatLatLng, isShortMapsLink, isMapsLink, mapsUrl, parseLatLng } from '../lib/geo'
import { cx } from '../lib/utils'

/** The four columns every place (slot, heartspot, center) carries. */
export interface PlaceValue {
  address: string
  latitude: number | null
  longitude: number | null
  map_url: string | null
}

export const emptyPlaceValue = (): PlaceValue => ({
  address: '',
  latitude: null,
  longitude: null,
  map_url: null,
})

export function toPlaceValue(p: {
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  map_url?: string | null
}): PlaceValue {
  return {
    address: p.address ?? '',
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    map_url: p.map_url ?? null,
  }
}

interface Props {
  value: PlaceValue
  onChange: (next: PlaceValue) => void
  addressLabel?: string
  addressHint?: string
  addressPlaceholder?: string
}

// Roughly the middle of India, so an unset map opens somewhere sensible.
const DEFAULT_CENTER = { lat: 22.9, lng: 78.6 }

/**
 * Address + Google location for a place.
 *
 * With `VITE_GOOGLE_MAPS_API_KEY` set, the map opens inside the app: search
 * for a place or drag the map under the pin. Without a key — and as a
 * shortcut for people who already have the place open in Google Maps —
 * "use my current location" and pasting a Google Maps link both work.
 */
export function LocationPicker({
  value,
  onChange,
  addressLabel = 'Address',
  addressHint,
  addressPlaceholder = 'Building, street, area, landmark…',
}: Props) {
  const [panelOpen, setPanelOpen] = useState(false)
  const [mapState, setMapState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [link, setLink] = useState('')
  const [linkMsg, setLinkMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  // An address Google offered for the pin. Never applied without a tap.
  const [suggested, setSuggested] = useState<string | null>(null)

  const mapDivRef = useRef<HTMLDivElement>(null)
  const searchDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  const hasPin = value.latitude != null && value.longitude != null
  const openUrl = mapsUrl(value)

  function patch(next: Partial<PlaceValue>) {
    onChange({ ...value, ...next })
  }

  // ---- the in-app map ------------------------------------------------
  useEffect(() => {
    if (!panelOpen || !googleMapsEnabled) return
    let cancelled = false
    const listeners: any[] = []

    setMapState('loading')
    ;(async () => {
      try {
        const maps = await loadGoogleMaps()
        if (cancelled || !mapDivRef.current) return

        const map = new maps.Map(mapDivRef.current, {
          center: hasPin ? { lat: value.latitude!, lng: value.longitude! } : DEFAULT_CENTER,
          zoom: hasPin ? 17 : 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        })
        mapRef.current = map
        // Tapping the map is the quick way to move the pin there.
        listeners.push(
          map.addListener('click', (e: any) => e.latLng && map.panTo(e.latLng)),
        )
        mountSearch(maps, map)
        if (!cancelled) setMapState('ready')
      } catch {
        if (!cancelled) setMapState('error')
      }
    })()

    return () => {
      cancelled = true
      listeners.forEach((l) => l?.remove?.())
      mapRef.current = null
    }
    // Opening the panel is what builds the map; later edits must not rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen])

  // Places search, if this key has it. The map still works without it.
  function mountSearch(maps: any, map: any) {
    const host = searchDivRef.current
    if (!host) return
    host.innerHTML = ''
    const places = maps.places
    if (!places) return

    const centreOn = (lat: number, lng: number, address?: string | null) => {
      map.setCenter({ lat, lng })
      map.setZoom(17)
      if (address) setSuggested(address)
    }

    try {
      if (places.PlaceAutocompleteElement) {
        const el = new places.PlaceAutocompleteElement()
        el.style.width = '100%'
        const onSelect = async (ev: any) => {
          try {
            const prediction = ev?.placePrediction ?? ev?.detail?.placePrediction
            const place = prediction ? prediction.toPlace() : (ev?.place ?? ev?.detail?.place)
            if (!place) return
            await place.fetchFields({ fields: ['location', 'formattedAddress'] })
            const loc = place.location
            if (loc) centreOn(loc.lat(), loc.lng(), place.formattedAddress)
          } catch {
            /* a failed lookup just leaves the map where it was */
          }
        }
        // The event was renamed; listening for both covers either version.
        el.addEventListener('gmp-select', onSelect)
        el.addEventListener('gmp-placeselect', onSelect)
        host.appendChild(el)
        return
      }

      if (places.Autocomplete) {
        const input = document.createElement('input')
        input.placeholder = 'Search for a place…'
        input.className =
          'w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 ' +
          'placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'
        host.appendChild(input)
        const ac = new places.Autocomplete(input, {
          fields: ['geometry', 'formatted_address'],
        })
        ac.addListener('place_changed', () => {
          const p = ac.getPlace()
          const loc = p?.geometry?.location
          if (loc) centreOn(loc.lat(), loc.lng(), p.formatted_address)
        })
      }
    } catch {
      /* no search box; dragging the map still works */
    }
  }

  async function useMapCentre() {
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter()
    if (!c) return
    const lat = c.lat()
    const lng = c.lng()
    patch({ latitude: lat, longitude: lng, map_url: null })
    setPanelOpen(false)
    setLinkMsg(null)
    if (!suggested) setSuggested(await reverseGeocode(lat, lng))
  }

  // ---- the device's own location -------------------------------------
  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setGeoState('error')
      return
    }
    setGeoState('loading')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        patch({ latitude, longitude, map_url: null })
        setGeoState('idle')
        setLinkMsg(null)
        setSuggested(await reverseGeocode(latitude, longitude))
      },
      () => setGeoState('error'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // ---- a pasted Google Maps link -------------------------------------
  function useLink() {
    const text = link.trim()
    if (!text) return
    const found = parseLatLng(text)
    if (found) {
      patch({
        latitude: found.lat,
        longitude: found.lng,
        map_url: isMapsLink(text) ? text : null,
      })
      setLink('')
      setLinkMsg({ tone: 'ok', text: 'Location pinned from that link.' })
      return
    }
    if (isShortMapsLink(text)) {
      setLinkMsg({
        tone: 'bad',
        text: 'Short links hide the coordinates. Open the link in Google Maps, then copy the full address bar link.',
      })
      return
    }
    if (isMapsLink(text)) {
      // Still worth keeping — it opens the right place, it just cannot be
      // used for distance sorting.
      patch({ map_url: text })
      setLink('')
      setLinkMsg({
        tone: 'ok',
        text: 'Link saved. Drop a pin as well so “near me” can measure the distance.',
      })
      return
    }
    setLinkMsg({
      tone: 'bad',
      text: 'That does not look like a Google Maps link. You can also paste “21.17, 72.83”.',
    })
  }

  const showSuggestion = suggested && suggested.trim() !== value.address.trim()

  return (
    <div className="space-y-3">
      <Field label={addressLabel} hint={addressHint}>
        <textarea
          value={value.address}
          onChange={(e) => patch({ address: e.target.value })}
          rows={2}
          placeholder={addressPlaceholder}
          className="w-full rounded-xl border border-brand-200 bg-white px-3.5 py-2.5 text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </Field>

      {showSuggestion && (
        <button
          type="button"
          onClick={() => {
            patch({ address: suggested! })
            setSuggested(null)
          }}
          className="flex w-full items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-2.5 text-left text-sm text-ink-600 hover:border-brand-300"
        >
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
          <span>
            <span className="font-medium text-brand-700">Use this address:</span> {suggested}
          </span>
        </button>
      )}

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-700">Google location</p>

        {hasPin ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0" />
              Pinned at {formatLatLng({ lat: value.latitude!, lng: value.longitude! })}
            </span>
            <span className="flex items-center gap-3">
              {openUrl && (
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium underline"
                >
                  Open in Maps
                </a>
              )}
              <button
                type="button"
                onClick={() => patch({ latitude: null, longitude: null, map_url: null })}
                className="inline-flex items-center gap-1 text-xs font-medium underline"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            </span>
          </div>
        ) : value.map_url ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
            <span className="inline-flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0" /> A map link is saved, but no pin
            </span>
            <button
              type="button"
              onClick={() => patch({ map_url: null })}
              className="text-xs font-medium underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-brand-200 px-3.5 py-2.5 text-sm text-ink-400">
            No location yet. Abhyasis will not get directions without one.
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          {googleMapsEnabled && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPanelOpen((o) => !o)}
              className="flex-1"
            >
              <MapIcon className="h-4 w-4" />
              {panelOpen ? 'Close map' : hasPin ? 'Move the pin' : 'Pick on the map'}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={useMyLocation}
            disabled={geoState === 'loading'}
            className="flex-1"
          >
            {geoState === 'loading' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Crosshair className="h-4 w-4" />
            )}
            {geoState === 'loading' ? 'Getting location…' : 'I am here now'}
          </Button>
        </div>

        {geoState === 'error' && (
          <p className="mt-2 text-xs text-amber-700">
            Couldn’t read your location. Allow location access, or paste a Google Maps link below.
          </p>
        )}

        {/* The in-app map */}
        {panelOpen && googleMapsEnabled && (
          <div className="mt-2 space-y-2 rounded-xl border border-brand-100 bg-brand-50/30 p-3">
            <div ref={searchDivRef} />
            <div className="relative overflow-hidden rounded-xl border border-brand-100">
              <div ref={mapDivRef} className="h-56 w-full bg-brand-50" />
              {/* A fixed pin over the middle: drag the map, not the pin. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <MapPin
                  className="h-8 w-8 -translate-y-3 text-brand-700 drop-shadow"
                  fill="currentColor"
                />
              </div>
              {mapState !== 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-ink-500">
                  {mapState === 'error' ? 'Could not load the map.' : 'Loading the map…'}
                </div>
              )}
            </div>
            <p className="text-xs text-ink-500">
              Search, or drag the map so the pin sits on the entrance.
            </p>
            <Button type="button" full onClick={useMapCentre} disabled={mapState !== 'ready'}>
              <Check className="h-4 w-4" /> Use this point
            </Button>
          </div>
        )}

        {/* Paste a link — always available, and the only way without a key */}
        <div className="mt-2 flex gap-2">
          <Input
            value={link}
            onChange={(e) => {
              setLink(e.target.value)
              setLinkMsg(null)
            }}
            placeholder="…or paste a Google Maps link"
            inputMode="url"
          />
          <Button type="button" variant="secondary" onClick={useLink} disabled={!link.trim()}>
            <Link2 className="h-4 w-4" /> Use
          </Button>
        </div>
        {linkMsg && (
          <p
            className={cx(
              'mt-1.5 text-xs',
              linkMsg.tone === 'ok' ? 'text-emerald-700' : 'text-amber-700',
            )}
          >
            {linkMsg.text}
          </p>
        )}
      </div>
    </div>
  )
}
