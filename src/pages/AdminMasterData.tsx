import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Layers, Building2, MapPin, Info, Search } from 'lucide-react'
import type { Center } from '../lib/types'
import {
  NO_CITY_GROUP,
  centerGroup,
  compareCenters,
  countCities,
  useMasterData,
} from '../lib/masterData'
import { Badge, Card, Input, PageLoader } from '../components/ui'

export default function AdminMasterData() {
  const { zones, centers, loading, error } = useMasterData()
  const [openZone, setOpenZone] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()

  // Zone -> city -> centers, which is exactly how the app's picker reads.
  const byZone = useMemo(() => {
    const matched = q
      ? centers.filter(
          (c) =>
            c.name.toLowerCase().includes(q) || (c.city ?? '').toLowerCase().includes(q),
        )
      : centers

    const m = new Map<string, Map<string, Center[]>>()
    for (const c of [...matched].sort(compareCenters)) {
      const cities = m.get(c.zone_id) ?? new Map<string, Center[]>()
      const list = cities.get(centerGroup(c)) ?? []
      list.push(c)
      cities.set(centerGroup(c), list)
      m.set(c.zone_id, cities)
    }
    return m
  }, [centers, q])

  if (loading) return <PageLoader label="Loading master data…" />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl text-ink-900">Master data</h1>
        <p className="mt-1 text-sm text-ink-500">
          The zones, cities and centers behind the “Zone” and “City / Center” dropdowns.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Summary counts */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <Layers className="mx-auto h-5 w-5 text-brand-500" />
          <p className="mt-1 font-serif text-xl text-ink-900">{zones.length}</p>
          <p className="text-xs text-ink-500">Zones</p>
        </Card>
        <Card className="text-center">
          <MapPin className="mx-auto h-5 w-5 text-brand-500" />
          <p className="mt-1 font-serif text-xl text-ink-900">{countCities(centers)}</p>
          <p className="text-xs text-ink-500">Cities</p>
        </Card>
        <Card className="text-center">
          <Building2 className="mx-auto h-5 w-5 text-brand-500" />
          <p className="mt-1 font-serif text-xl text-ink-900">{centers.length}</p>
          <p className="text-xs text-ink-500">Centers</p>
        </Card>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a city or center…"
          className="pl-10"
        />
      </div>

      {/* Zone tree */}
      <div className="space-y-3">
        {zones.map((z) => {
          const cities = byZone.get(z.id) ?? new Map<string, Center[]>()
          const zCount = [...cities.values()].reduce((n, list) => n + list.length, 0)
          // A search auto-opens the zones that have a hit.
          const isOpen = q ? zCount > 0 : openZone === z.id
          return (
            <Card key={z.id} className="overflow-hidden p-0">
              <button
                onClick={() => setOpenZone(isOpen ? null : z.id)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900">{z.name}</span>
                  <Badge tone="neutral">
                    {zCount} center{zCount === 1 ? '' : 's'}
                  </Badge>
                </span>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" />
                )}
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-brand-50 px-4 py-3">
                  {zCount === 0 && (
                    <p className="text-sm text-ink-400">No centers in this zone yet.</p>
                  )}
                  {[...cities.entries()].map(([city, list]) => (
                    <div key={city}>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-brand-500" />
                        <span
                          className={
                            city === NO_CITY_GROUP
                              ? 'text-sm italic text-ink-400'
                              : 'font-medium text-ink-800'
                          }
                        >
                          {city}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                        {list.map((c) => (
                          <span
                            key={c.id}
                            className="rounded-full border border-brand-100 bg-brand-50/60 px-2.5 py-0.5 text-xs text-brand-700"
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-3 text-sm text-ink-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
        <p>
          This is a read-only overview. To add or edit zones and centers, use the Supabase Table
          Editor (or update <span className="font-medium">seed.sql</span>). A center with no city
          yet still appears everywhere — it is listed under “{NO_CITY_GROUP}”.
        </p>
      </div>
    </div>
  )
}
