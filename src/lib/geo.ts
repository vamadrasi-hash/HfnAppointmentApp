// Reading a place out of a Google Maps link, and building links back to it.
//
// The picker lets a preceptor drop a pin inside the app, but people are
// used to finding a place in Google Maps and sharing the link — so we also
// read the coordinates straight out of whatever they paste.

export interface LatLng {
  lat: number
  lng: number
}

const isLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90
const isLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180

function pair(a: string, b: string): LatLng | null {
  const lat = Number(a)
  const lng = Number(b)
  if (!isLat(lat) || !isLng(lng)) return null
  // 0,0 is in the Atlantic — it always means "nothing was picked".
  if (lat === 0 && lng === 0) return null
  return { lat, lng }
}

// Tried in order: the exact place marker, then the map's centre, then the
// query parameters, then a bare "lat, lng" someone typed or copied.
const PATTERNS: RegExp[] = [
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, //   .../data=…!3dLAT!4dLNG
  /[@/](-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, //  /@LAT,LNG,17z  or  /place/LAT,LNG
  /[?&](?:q|query|ll|sll|daddr|center|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
  /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*$/, //          21.17, 72.83
]

/**
 * Pull coordinates out of a Google Maps link, a "lat, lng" pair, or any
 * text that happens to contain either. Returns null when there is nothing
 * usable in it.
 */
export function parseLatLng(input: string): LatLng | null {
  const text = (input ?? '').trim()
  if (!text) return null
  const decoded = safeDecode(text)
  for (const re of PATTERNS) {
    const m = decoded.match(re) ?? text.match(re)
    if (m) {
      const hit = pair(m[1], m[2])
      if (hit) return hit
    }
  }
  return null
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Shortened links (maps.app.goo.gl / goo.gl/maps) hide the coordinates
 * behind a redirect the browser will not let us follow, so the app asks
 * for the full link instead.
 */
export function isShortMapsLink(input: string): boolean {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(input ?? '')
}

export function isMapsLink(input: string): boolean {
  return /(?:google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(
    input ?? '',
  )
}

// ---- Links out to Google Maps ---------------------------------------

export function formatLatLng({ lat, lng }: LatLng): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

interface Placeish {
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  map_url?: string | null
}

function coordsOf(p: Placeish): LatLng | null {
  if (p.latitude == null || p.longitude == null) return null
  return { lat: p.latitude, lng: p.longitude }
}

/** A link that opens this place in Google Maps — null if we know nothing. */
export function mapsUrl(p: Placeish): string | null {
  if (p.map_url) return p.map_url
  const c = coordsOf(p)
  if (c) return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
  if (p.address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address.trim())}`
  }
  return null
}

/** A link that starts navigation to this place. */
export function directionsUrl(p: Placeish): string | null {
  const c = coordsOf(p)
  if (c) {
    return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`
  }
  if (p.address?.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      p.address.trim(),
    )}`
  }
  return p.map_url ?? null
}

export function hasLocation(p: Placeish): boolean {
  return Boolean(coordsOf(p) || p.map_url || p.address?.trim())
}
