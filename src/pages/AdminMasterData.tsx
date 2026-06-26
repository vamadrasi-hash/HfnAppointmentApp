import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Layers, Building2, MapPin, Info } from 'lucide-react'
import { getZones, getCenters, getAreas } from '../lib/api'
import type { Zone, Center, Area } from '../lib/types'
import { Badge, Card, PageLoader } from '../components/ui'
import { cx } from '../lib/utils'

export default function AdminMasterData() {
  const [zones, setZones] = useState<Zone[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openZone, setOpenZone] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getZones(), getCenters(), getAreas()])
      .then(([z, c, a]) => {
        setZones(z)
        setCenters(c)
        setAreas(a)
        setOpenZone(z[0]?.id ?? null)
      })
      .catch((e) => setError(e.message ?? 'Could not load master data.'))
      .finally(() => setLoading(false))
  }, [])

  const centersByZone = useMemo(() => {
    const m = new Map<string, Center[]>()
    for (const c of centers) {
      const list = m.get(c.zone_id) ?? []
      list.push(c)
      m.set(c.zone_id, list)
    }
    return m
  }, [centers])

  const areasByCenter = useMemo(() => {
    const m = new Map<string, Area[]>()
    for (const a of areas) {
      const list = m.get(a.center_id) ?? []
      list.push(a)
      m.set(a.center_id, list)
    }
    return m
  }, [areas])

  if (loading) return <PageLoader label="Loading master data…" />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl text-ink-900">Master data</h1>
        <p className="mt-1 text-sm text-ink-500">
          Zones, centers and areas across South Gujarat.
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
          <Building2 className="mx-auto h-5 w-5 text-brand-500" />
          <p className="mt-1 font-serif text-xl text-ink-900">{centers.length}</p>
          <p className="text-xs text-ink-500">Centers</p>
        </Card>
        <Card className="text-center">
          <MapPin className="mx-auto h-5 w-5 text-brand-500" />
          <p className="mt-1 font-serif text-xl text-ink-900">{areas.length}</p>
          <p className="text-xs text-ink-500">Areas</p>
        </Card>
      </div>

      {/* Zone tree */}
      <div className="space-y-3">
        {zones.map((z) => {
          const zCenters = centersByZone.get(z.id) ?? []
          const isOpen = openZone === z.id
          return (
            <Card key={z.id} className="overflow-hidden p-0">
              <button
                onClick={() => setOpenZone(isOpen ? null : z.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-ink-900">{z.name}</span>
                  <Badge tone="neutral">{zCenters.length} centers</Badge>
                </span>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-ink-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-ink-400" />
                )}
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-brand-50 px-4 py-3">
                  {zCenters.length === 0 && (
                    <p className="text-sm text-ink-400">No centers in this zone yet.</p>
                  )}
                  {zCenters.map((c) => {
                    const cAreas = areasByCenter.get(c.id) ?? []
                    return (
                      <div key={c.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-brand-500" />
                          <span className="font-medium text-ink-800">{c.name}</span>
                          <span className="text-sm text-ink-400">· {c.city}</span>
                        </div>
                        {cAreas.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                            {cAreas.map((a) => (
                              <span
                                key={a.id}
                                className={cx(
                                  'rounded-full border border-brand-100 bg-brand-50/60 px-2.5 py-0.5',
                                  'text-xs text-brand-700',
                                )}
                              >
                                {a.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-3 text-sm text-ink-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
        <p>
          This is a read-only overview. To add or edit zones, centers and areas, use the Supabase
          Table Editor (or update <span className="font-medium">seed.sql</span>). See the README for
          step-by-step instructions.
        </p>
      </div>
    </div>
  )
}
