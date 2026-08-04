// Zones, centers and their heartspots change rarely, so the whole lot
// (5 zones, ~140 centers) is fetched once per session and shared by every
// screen that needs it. The admin master-data screen edits it, so it can
// also be invalidated — every hook re-reads when that happens.
import { useCallback, useEffect, useState } from 'react'
import { getZones, getCenters, getHeartspots } from './api'
import type { Center, Heartspot, Zone } from './types'

export interface MasterData {
  zones: Zone[]
  centers: Center[]
  heartspots: Heartspot[]
}

const EMPTY: MasterData = { zones: [], centers: [], heartspots: [] }

let cache: Promise<MasterData> | null = null
const listeners = new Set<() => void>()

export function loadMasterData(): Promise<MasterData> {
  if (!cache) {
    cache = Promise.all([getZones(), getCenters(), getHeartspots()])
      .then(([zones, centers, heartspots]) => ({ zones, centers, heartspots }))
      .catch((e) => {
        cache = null // let the next caller retry
        throw e
      })
  }
  return cache
}

/** Throw the cache away and tell every mounted hook to load it again. */
export function invalidateMasterData(): void {
  cache = null
  listeners.forEach((fn) => fn())
}

export function useMasterData() {
  const [data, setData] = useState<MasterData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setError(null)
    loadMasterData()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message ?? 'Could not load zones and centers.'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [nonce])

  // Re-read whenever anyone edits the master data.
  useEffect(() => {
    const onChange = () => setNonce((n) => n + 1)
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [])

  const reload = useCallback(() => invalidateMasterData(), [])

  return { ...data, loading, error, reload }
}

// ------------------------------------------------------------------
// Heartspots
// ------------------------------------------------------------------

/** A center's heartspots, active ones first, A–Z. */
export function heartspotsInCenter(heartspots: Heartspot[], centerId: string): Heartspot[] {
  if (!centerId) return []
  return heartspots
    .filter((h) => h.center_id === centerId)
    .sort(
      (a, b) =>
        Number(b.is_active) - Number(a.is_active) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
}

export function findHeartspot(
  heartspots: Heartspot[],
  id: string | null | undefined,
): Heartspot | null {
  if (!id) return null
  return heartspots.find((h) => h.id === id) ?? null
}

// ------------------------------------------------------------------
// Labels and ordering live in ./centers — re-exported here because
// most screens reach for them through this module.
// ------------------------------------------------------------------
export {
  NO_CITY_GROUP,
  centerCity,
  centerGroup,
  centerFullLabel,
  compareCenters,
  centersInZone,
  centersInCity,
  cityGroups,
  countCities,
} from './centers'
