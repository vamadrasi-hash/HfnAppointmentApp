import { useMemo } from 'react'
import type { Center } from '../lib/types'
import {
  centerFullLabel,
  centerGroup,
  centersInZone,
  useMasterData,
} from '../lib/masterData'
import { Combobox, type ComboOption } from './Combobox'
import { Field, Select } from './ui'

export interface ZoneCenterValue {
  zoneId: string
  centerId: string
  /** The chosen center's city, so callers can stamp it onto the profile. */
  city: string | null
}

interface Props {
  zoneId: string
  centerId: string
  onChange: (next: ZoneCenterValue) => void
  /**
   * 'profile' — the person is saying where they belong ("Select your zone").
   * 'filter'  — blank means "everywhere" ("All zones").
   */
  mode?: 'profile' | 'filter'
  disabled?: boolean
}

/**
 * The two questions the app asks about place: a **Zone**, then a searchable
 * **City / Center**. Cities and their centers live in the same list, so a
 * city name finds its centers — and centers with no city are still listed,
 * grouped at the end under "Other centers".
 *
 * Picking a center before a zone is fine: the zone fills itself in.
 */
export function ZoneCenterPicker({
  zoneId,
  centerId,
  onChange,
  mode = 'profile',
  disabled,
}: Props) {
  const { zones, centers, loading, error } = useMasterData()
  const isFilter = mode === 'filter'

  const visible = useMemo(() => centersInZone(centers, zoneId), [centers, zoneId])

  const options = useMemo<ComboOption[]>(
    () =>
      visible.map((c) => ({
        value: c.id,
        label: c.name,
        triggerLabel: centerFullLabel(c),
        group: centerGroup(c),
        keywords: c.city ?? '',
      })),
    [visible],
  )

  function emit(next: { zoneId: string; centerId: string }) {
    const center = centers.find((c) => c.id === next.centerId) ?? null
    onChange({ ...next, city: center?.city ?? null })
  }

  function onZoneChange(nextZone: string) {
    // Keep the center only if it belongs to the zone just chosen.
    const center = centers.find((c) => c.id === centerId)
    const keep = !nextZone || (center && center.zone_id === nextZone)
    emit({ zoneId: nextZone, centerId: keep ? centerId : '' })
  }

  function onCenterChange(nextCenter: string) {
    // Choosing a center is enough — it knows its own zone.
    const center: Center | undefined = centers.find((c) => c.id === nextCenter)
    emit({ zoneId: center?.zone_id ?? zoneId, centerId: nextCenter })
  }

  return (
    <div className="space-y-3">
      <Field label="Zone">
        <Select
          value={zoneId}
          onChange={(e) => onZoneChange(e.target.value)}
          disabled={disabled || loading}
        >
          <option value="">
            {loading ? 'Loading zones…' : isFilter ? 'All zones' : 'Select your zone'}
          </option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="City / Center"
        hint={
          isFilter
            ? 'Search by city (e.g. Surat) or by center name.'
            : 'Search by your city (e.g. Surat) or by center name.'
        }
      >
        <Combobox
          value={centerId}
          options={options}
          onChange={onCenterChange}
          disabled={disabled || loading}
          clearable
          placeholder={
            loading
              ? 'Loading centers…'
              : isFilter
                ? zoneId
                  ? 'All cities & centers in this zone'
                  : 'All cities & centers'
                : 'Search your city or center'
          }
          searchPlaceholder="Type a city or center…"
          emptyText={
            zoneId
              ? 'No city or center matches that in this zone. Try clearing the zone.'
              : 'No city or center matches that.'
          }
        />
      </Field>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
