// Zones, centers, their heartspots and the kinds of sitting change
// rarely, so the whole lot (5 zones, ~140 centers) is fetched once per
// session and shared by every screen that needs it. The admin master-data
// screen edits it, so it can also be invalidated — every hook re-reads
// when that happens.
import { useCallback, useEffect, useState } from 'react'
import { getZones, getCenters, getHeartspots, getSessionTypes } from './api'
import type { Center, Heartspot, SessionType, Zone } from './types'

export interface MasterData {
  zones: Zone[]
  centers: Center[]
  heartspots: Heartspot[]
  sessionTypes: SessionType[]
}

const EMPTY: MasterData = { zones: [], centers: [], heartspots: [], sessionTypes: [] }

let cache: Promise<MasterData> | null = null
const listeners = new Set<() => void>()

export function loadMasterData(): Promise<MasterData> {
  if (!cache) {
    cache = Promise.all([getZones(), getCenters(), getHeartspots(), getSessionTypes()])
      .then(([zones, centers, heartspots, sessionTypes]) => ({
        zones,
        centers,
        heartspots,
        sessionTypes,
      }))
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
// Session types
// ------------------------------------------------------------------

/** The kinds of sitting a seeker can pick from, in the admin's order. */
export function activeSessionTypes(types: SessionType[]): SessionType[] {
  return types.filter((t) => t.is_active)
}

/** What to preselect: the first active kind, or nothing if there is none. */
export function defaultSessionTypeId(types: SessionType[]): string {
  return activeSessionTypes(types)[0]?.id ?? ''
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
