import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Clock3,
  Mail,
  Phone,
  Search,
  UserCheck,
  UserX,
  Undo2,
  Info,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getPreceptorApprovals, setPreceptorStatus } from '../lib/api'
import type { PreceptorStatus, Profile } from '../lib/types'
import { centerFullLabel, useMasterData } from '../lib/masterData'
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageLoader,
  SectionTitle,
} from '../components/ui'
import { Modal } from '../components/Modal'

type Filter = 'pending' | 'approved' | 'rejected'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'pending', label: 'Waiting' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Not approved' },
]

// The decision an admin is about to take, held while they confirm it.
interface Decision {
  person: Profile
  status: PreceptorStatus
}

const DECISION_COPY: Record<PreceptorStatus, { title: string; verb: string; body: string }> = {
  approved: {
    title: 'Approve this preceptor?',
    verb: 'Approve',
    body: 'They will be able to publish a schedule and receive sitting requests, and abhyasis will find them in search.',
  },
  rejected: {
    title: 'Refuse this preceptor?',
    verb: 'Not a preceptor',
    body: 'They keep their account and can still request sittings, but they cannot publish a schedule and no abhyasi will find them.',
  },
  pending: {
    title: 'Put this account back in the queue?',
    verb: 'Move back to waiting',
    body: 'Their schedule stops being offered to abhyasis until an administrator decides again.',
  },
}

export default function AdminPreceptors() {
  const { profile: me } = useAuth()
  const { centers } = useMasterData()

  const [people, setPeople] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<Filter>('pending')
  const [query, setQuery] = useState('')

  const [decision, setDecision] = useState<Decision | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPeople(await getPreceptorApprovals())
    } catch (e: any) {
      setError(e.message ?? 'Could not load the preceptor list.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { pending: 0, approved: 0, rejected: 0 }
    for (const p of people) {
      const s = (p.preceptor_status ?? 'pending') as Filter
      if (s in c) c[s] += 1
    }
    return c
  }, [people])

  const q = query.trim().toLowerCase()

  const shown = useMemo(
    () =>
      people
        .filter((p) => (p.preceptor_status ?? 'pending') === filter)
        .filter(
          (p) =>
            !q ||
            p.full_name.toLowerCase().includes(q) ||
            (p.email ?? '').toLowerCase().includes(q) ||
            (p.phone ?? '').toLowerCase().includes(q) ||
            (p.city ?? '').toLowerCase().includes(q),
        ),
    [people, filter, q],
  )

  function centerLabel(p: Profile): string | null {
    const c = centers.find((x) => x.id === p.center_id)
    if (c) return centerFullLabel(c)
    return p.city ?? null
  }

  async function applyDecision() {
    if (!decision) return
    setSaving(true)
    setError(null)
    try {
      const updated = await setPreceptorStatus(decision.person.id, decision.status)
      setPeople((list) => list.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
      setDecision(null)
    } catch (e: any) {
      setError(e.message ?? 'Could not save that decision.')
      setDecision(null)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoader label="Loading preceptors…" />

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl text-ink-900">Preceptor approvals</h1>
        <p className="mt-1 text-sm text-ink-500">
          Anyone can sign up as a preceptor. Nothing they publish reaches an abhyasi until you
          approve the account here.
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={
              'flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ' +
              (filter === f.key
                ? 'border-brand-500 bg-brand-600 text-white shadow-soft'
                : 'border-brand-200 bg-white text-ink-600 hover:border-brand-400')
            }
          >
            {f.label}
            <span className={filter === f.key ? 'ml-1.5 text-brand-50' : 'ml-1.5 text-ink-400'}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a name, email, phone or city…"
          className="pl-10"
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="h-8 w-8" />}
          title={
            filter === 'pending'
              ? 'Nobody is waiting'
              : filter === 'approved'
                ? 'No approved preceptors yet'
                : 'Nobody has been refused'
          }
          subtitle={
            q
              ? 'Nothing matches that search.'
              : filter === 'pending'
                ? 'New preceptor sign-ups will appear here for your decision.'
                : undefined
          }
        />
      ) : (
        <div>
          <SectionTitle hint={`${shown.length} of ${counts[filter]}`}>
            {FILTERS.find((f) => f.key === filter)!.label}
          </SectionTitle>
          <div className="space-y-3">
            {shown.map((p) => (
              <Card key={p.id} className="space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar name={p.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-semibold text-ink-900">{p.full_name}</p>
                      <StatusBadge status={(p.preceptor_status ?? 'pending') as PreceptorStatus} />
                    </div>
                    {p.email && (
                      <p className="mt-0.5 inline-flex items-center gap-1 truncate text-sm text-ink-500">
                        <Mail className="h-3.5 w-3.5 shrink-0" /> {p.email}
                      </p>
                    )}
                    {p.phone && (
                      <a
                        href={`tel:${p.phone}`}
                        className="mt-0.5 flex items-center gap-1 text-sm font-medium text-brand-600"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {p.phone}
                      </a>
                    )}
                    {centerLabel(p) && (
                      <p className="mt-0.5 truncate text-sm text-ink-500">{centerLabel(p)}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {p.preceptor_status !== 'approved' && (
                    <Button
                      className="flex-1"
                      onClick={() => setDecision({ person: p, status: 'approved' })}
                    >
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                  )}
                  {p.preceptor_status !== 'rejected' && (
                    <Button
                      variant="danger"
                      className="flex-1"
                      onClick={() => setDecision({ person: p, status: 'rejected' })}
                      disabled={p.id === me?.id}
                    >
                      <UserX className="h-4 w-4" /> Not a preceptor
                    </Button>
                  )}
                  {p.preceptor_status !== 'pending' && (
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={() => setDecision({ person: p, status: 'pending' })}
                      disabled={p.id === me?.id}
                    >
                      <Undo2 className="h-4 w-4" /> Back to waiting
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/50 px-3.5 py-3 text-sm text-ink-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
        <p>
          Withdrawing an approval leaves any sitting already confirmed untouched — it only stops new
          requests and hides the preceptor from search. Administrators are always approved, so they
          are not listed here.
        </p>
      </div>

      <Modal
        open={!!decision}
        onClose={() => (saving ? null : setDecision(null))}
        title={decision ? DECISION_COPY[decision.status].title : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant={decision?.status === 'rejected' ? 'danger' : 'primary'}
              onClick={applyDecision}
              loading={saving}
              className="flex-1"
            >
              {decision ? DECISION_COPY[decision.status].verb : ''}
            </Button>
          </>
        }
      >
        {decision && (
          <p className="text-sm text-ink-600">
            <span className="font-medium text-ink-900">{decision.person.full_name}</span>{' '}
            {DECISION_COPY[decision.status].body}
          </p>
        )}
      </Modal>
    </div>
  )
}

function StatusBadge({ status }: { status: PreceptorStatus }) {
  if (status === 'approved')
    return (
      <Badge tone="green">
        <Check className="h-3 w-3" /> Approved
      </Badge>
    )
  if (status === 'rejected')
    return (
      <Badge tone="red">
        <UserX className="h-3 w-3" /> Not approved
      </Badge>
    )
  return (
    <Badge tone="amber">
      <Clock3 className="h-3 w-3" /> Waiting
    </Badge>
  )
}
