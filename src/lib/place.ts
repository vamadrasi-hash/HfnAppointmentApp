// Turning the "where" columns into something a screen can show.
//
// A sitting happens either at a **heartspot** (a meditation place belonging
// to a center) or at the preceptor's **home**. The address and map details
// can be set at three levels; the most specific one wins:
//
//     the slot  ->  the heartspot  ->  the center
//
// So a preceptor who always sits in the same heartspot enters nothing, and
// one who uses a side room can override just the address on their slot.

import type {
  AvailabilitySlot,
  Center,
  Heartspot,
  PlaceDetails,
  ResolvedPlace,
} from './types'
import { centerFullLabel } from './centers'

type SlotPlace = Pick<
  AvailabilitySlot,
  'place_type' | 'heartspot_id' | 'address' | 'latitude' | 'longitude' | 'map_url'
>
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
    // A home has no master-data row behind it — only what the preceptor
    // typed on the slot.
    return {
      type: 'home',
      name: opts.homeName ?? HOME_PLACE_NAME,
      area,
      ...inherit(slot),
    }
  }

  return {
    type: 'heartspot',
    name: heartspot?.name ?? center?.name ?? 'Heartspot',
    area,
    ...inherit(slot, heartspot, center),
  }
}

/** One line for a card: "Adajan Heartspot · Surat · Surat-West-Adajan". */
export function placeSummary(place: ResolvedPlace): string {
  return place.area && place.area !== place.name
    ? `${place.name} · ${place.area}`
    : place.name
}

/**
 * What is missing before this place can be found. Used to nudge a
 * preceptor rather than to block them — a sitting at a well-known
 * heartspot needs no address at all.
 */
export function placeIsFindable(place: ResolvedPlace): boolean {
  return !blank(place.address) || place.latitude != null || !blank(place.map_url)
}
