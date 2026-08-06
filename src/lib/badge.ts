// The count on the app icon.
//
// Distinct from the two other things called a badge in this app: the
// number on the bell in the header, and the small monochrome glyph a
// notification carries in the Android status bar. This one is the dot
// with a number on the Home Screen icon, the thing a preceptor sees
// without opening anything.
//
// It needs the app installed — an icon to draw on — and browser support
// (Chrome on Android and desktop, Safari on iOS 16.4+ once added to the
// Home Screen). Everywhere else these calls do nothing at all, quietly,
// which is the right outcome for decoration.

// The DOM types declare these as always present; older browsers, and
// every browser on a desktop without an icon to draw on, disagree.
interface BadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export function appBadgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator
}

/** Show `count` on the icon, or clear it when there is nothing unread. */
export function setAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return
  const nav = navigator as unknown as BadgeNavigator
  try {
    const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.()
    // A rejected promise here is a browser declining, not a fault.
    void done?.catch(() => {})
  } catch {
    /* older browser; there is no badge to set */
  }
}
