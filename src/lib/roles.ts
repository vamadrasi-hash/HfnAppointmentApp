import type { Profile } from './types'

/**
 * What a role means in this app.
 *
 * An abhyasi needs nothing beyond signing in: they find preceptors and
 * request sittings straight away. A preceptor is different — saying "I am
 * a preceptor" is a claim the app cannot verify, so the account is created
 * pending and an administrator approves it. Until then the person is a
 * signed-in user like any other: they can book sittings, but they cannot
 * publish availability and no abhyasi finds them in search.
 */

/** Registered as a preceptor — approved or not. Admins count too. */
export function isPreceptorRole(p: Profile | null | undefined): boolean {
  return p?.role === 'preceptor' || p?.role === 'admin'
}

/** Cleared to give sittings: publish availability, take requests. */
export function isApprovedPreceptor(p: Profile | null | undefined): boolean {
  if (p?.role === 'admin') return true
  return p?.role === 'preceptor' && p.preceptor_status === 'approved'
}

/** Signed up as a preceptor and still waiting on an administrator. */
export function isPendingPreceptor(p: Profile | null | undefined): boolean {
  return p?.role === 'preceptor' && p.preceptor_status === 'pending'
}

/** An administrator looked and said no. */
export function isRejectedPreceptor(p: Profile | null | undefined): boolean {
  return p?.role === 'preceptor' && p.preceptor_status === 'rejected'
}

export function isAdmin(p: Profile | null | undefined): boolean {
  return p?.role === 'admin'
}

/** What this person is called on screen. */
export function roleLabel(p: Profile | null | undefined): string {
  if (p?.role === 'admin') return 'Administrator'
  if (p?.role !== 'preceptor') return 'Abhyasi'
  if (p.preceptor_status === 'approved') return 'Preceptor'
  if (p.preceptor_status === 'rejected') return 'Preceptor (not approved)'
  return 'Preceptor (awaiting approval)'
}
