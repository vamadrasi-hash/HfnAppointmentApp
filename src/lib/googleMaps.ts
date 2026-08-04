// Loading the Google Maps JavaScript API, once, on demand.
//
// The key is optional. With it, a preceptor can search for a place and drop
// a pin inside the app; without it they can still use their current
// location or paste a Google Maps link — see components/LocationPicker.

const KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim()

/** Whether the in-app map is available at all. */
export const googleMapsEnabled = Boolean(KEY)

const CALLBACK = '__hfnGoogleMapsReady'

let loader: Promise<any> | null = null

/** Resolves with `google.maps`. Rejects if there is no key, or it fails. */
export function loadGoogleMaps(): Promise<any> {
  if (!KEY) {
    return Promise.reject(new Error('No Google Maps key is configured.'))
  }
  if (loader) return loader

  loader = new Promise((resolve, reject) => {
    const w = window as any
    if (w.google?.maps) {
      resolve(w.google.maps)
      return
    }

    w[CALLBACK] = () => resolve(w.google.maps)

    const script = document.createElement('script')
    script.src =
      'https://maps.googleapis.com/maps/api/js' +
      `?key=${encodeURIComponent(KEY)}` +
      '&libraries=places&loading=async&v=weekly' +
      `&callback=${CALLBACK}`
    script.async = true
    script.onerror = () => {
      loader = null // a later attempt may succeed (e.g. the network came back)
      reject(new Error('Could not load Google Maps.'))
    }
    document.head.appendChild(script)
  })

  return loader
}

/**
 * The address Google has for a point, or null if it cannot say. Only ever
 * used to *offer* an address — never to overwrite what someone typed.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const maps = await loadGoogleMaps()
    const geocoder = new maps.Geocoder()
    const { results } = await geocoder.geocode({ location: { lat, lng } })
    return results?.[0]?.formatted_address ?? null
  } catch {
    return null
  }
}
