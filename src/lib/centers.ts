// Naming and ordering for zones / cities / centers.
//
// These are pure helpers over the master data — no fetching — so anything
// that only needs a label can use them without pulling in the API layer.

import type { Center } from './types'

// Centers whose city is not known yet are still listed — they collect here.
export const NO_CITY_GROUP = 'Other centers'

export function centerCity(c: Pick<Center, 'city'>): string | null {
  const city = c.city?.trim()
  return city ? city : null
}

export function centerGroup(c: Pick<Center, 'city'>): string {
  return centerCity(c) ?? NO_CITY_GROUP
}

// A center reads best as "City · Center". When the center *is* its city
// (MEHSANA in Mehsana) the two collapse into one.
export function centerFullLabel(c: Pick<Center, 'name' | 'city'>): string {
  const city = centerCity(c)
  if (!city) return c.name
  if (city.toLowerCase() === c.name.trim().toLowerCase()) return c.name
  return `${city} · ${c.name}`
}

// City groups A–Z, with the "no city yet" bucket last; centers A–Z inside.
export function compareCenters(a: Center, b: Center): number {
  const ga = centerCity(a)
  const gb = centerCity(b)
  if (ga == null && gb != null) return 1
  if (ga != null && gb == null) return -1
  if (ga != null && gb != null) {
    const byCity = ga.localeCompare(gb, undefined, { sensitivity: 'base' })
    if (byCity !== 0) return byCity
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function centersInZone(centers: Center[], zoneId: string): Center[] {
  const list = zoneId ? centers.filter((c) => c.zone_id === zoneId) : centers
  return [...list].sort(compareCenters)
}

/** Every city that has at least one center, A–Z, "no city yet" last. */
export function cityGroups(centers: Center[]): string[] {
  const seen = new Map<string, string>()
  for (const c of centers) {
    const g = centerGroup(c)
    if (!seen.has(g.toLowerCase())) seen.set(g.toLowerCase(), g)
  }
  return [...seen.values()].sort((a, b) => {
    if (a === NO_CITY_GROUP) return 1
    if (b === NO_CITY_GROUP) return -1
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
}

export function centersInCity(centers: Center[], city: string): Center[] {
  if (!city) return []
  return centers.filter((c) => centerGroup(c) === city).sort(compareCenters)
}

export function countCities(centers: Center[]): number {
  const set = new Set<string>()
  for (const c of centers) {
    const city = centerCity(c)
    if (city) set.add(city.toLowerCase())
  }
  return set.size
}
