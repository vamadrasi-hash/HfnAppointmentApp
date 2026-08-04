// Zones and centers change rarely, so the whole list (5 zones, ~140 centers)
// is fetched once per session and shared by every screen that needs it.
import { useEffect, useState } from 'react'
import { getZones, getCenters } from './api'
import type { Center, Zone } from './types'

export interface MasterData {
  zones: Zone[]
  centers: Center[]
}

let cache: Promise<MasterData> | null = null

export function loadMasterData(): Promise<MasterData> {
  if (!cache) {
    cache = Promise.all([getZones(), getCenters()])
      .then(([zones, centers]) => ({ zones, centers }))
      .catch((e) => {
        cache = null // let the next caller retry
        throw e
      })
  }
  return cache
}

export function useMasterData() {
  const [data, setData] = useState<MasterData>({ zones: [], centers: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadMasterData()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message ?? 'Could not load zones and centers.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  return { ...data, loading, error }
}

// ------------------------------------------------------------------
// Labels
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// Sorting / lookup
// ------------------------------------------------------------------

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

export function countCities(centers: Center[]): number {
  const set = new Set<string>()
  for (const c of centers) {
    const city = centerCity(c)
    if (city) set.add(city.toLowerCase())
  }
  return set.size
}
