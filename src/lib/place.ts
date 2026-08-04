// Turning the "where" columns into something a screen can show.
//
// A sitting happens either at a **heartspot** (a meditation place belonging
// to a center) or at the preceptor's **home**.
//
// A heartspot sitting inherits its address: the heartspot's, or the
// center's if the heartspot has none. So a preceptor who always sits in the
// same heartspot enters nothing at all.
//
// A home sitting carries its own address, kept in the private `slot_places`
// table — so `slot.place_details` is null whenever the viewer has not
// earned the right to see it (see migration 006).

import type {
  AvailabilitySlot,
  Center,
  Heartspot,
  PlaceDetails,
  ResolvedPlace,
} from './types'
import { centerFullLabel } from './centers'

type SlotPlace = Pick<AvailabilitySlot, 'place_type' | 'heartspot_id' | 'place_details'>
type CenterLike = Pick<Center, 'name' | 'city'> & Partial<PlaceDetails>

const blank = (s: string | null | undefined) => !s || !s.trim()

/** First level that actually has a value, level by level. */
function inherit(...levels: (Partial<PlaceDetails> | null | undefined)[]): PlaceDetails {
  const pick = <K extends keyof PlaceDetails>(key: K): PlaceDetails[K] => {
    for (const level of levels) {
      const v = level?.[key]
      if (v != null && !(typeof v === 'string' && !v.trim())) return v as PlaceDetails[K]
    }
    return null
  }
  return {
    address: pick('address'),
    latitude: pick('latitude'),
    longitude: pick('longitude'),
    map_url: pick('map_url'),
  }
}

export const HOME_PLACE_NAME = 'Preceptor’s home'
export const MY_HOME_PLACE_NAME = 'My home'

export function resolvePlace(
  slot: SlotPlace,
  heartspot: Heartspot | null | undefined,
  center: CenterLike | null | undefined,
  opts: { homeName?: string } = {},
): ResolvedPlace {
  const area = center ? centerFullLabel(center) : null

  if (slot.place_type === 'home') {
    // A home has no master-data row behind it — only the private address,
    // which is null unless this viewer is allowed to see it.
    const details = inherit(slot.place_details)
    return {
      type: 'home',
      name: opts.homeName ?? HOME_PLACE_NAME,
      area,
      ...details,
      restricted: !detailsAreUsable(details),
    }
  }

  return {
    type: 'heartspot',
    name: heartspot?.name ?? center?.name ?? 'Heartspot',
    area,
    ...inherit(heartspot, center),
    restricted: false,
  }
}

function detailsAreUsable(d: PlaceDetails): boolean {
  return !blank(d.address) || d.latitude != null || !blank(d.map_url)
}

/** One line for a card: "Adajan Heartspot · Surat · Surat-West-Adajan". */
export function placeSummary(place: ResolvedPlace): string {
  return place.area && place.area !== place.name
    ? `${place.name} · ${place.area}`
    : place.name
}

