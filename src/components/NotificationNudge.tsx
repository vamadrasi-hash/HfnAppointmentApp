import { Link } from 'react-router-dom'
import { Bell, ArrowRight } from 'lucide-react'
import { pushPermission } from '../lib/push'
import { needsInstallForNotifications } from '../lib/install'
import { Card } from './ui'

/**
 * A quiet line on the dashboard for somebody who has not yet said yes to
 * pop-ups. It only points at the notifications screen — asking has to
 * happen from a tap there, because browsers refuse the question
 * otherwise, and because the answer is worth making deliberately.
 *
 * Nothing shows once the answer is in, either way: a preceptor who has
 * allowed them does not need reminding, and one who has refused should
 * not be nagged.
 */
export function NotificationNudge() {
  const permission = pushPermission()

  // 'granted' and 'denied' are both settled. 'unsupported' on an iPhone
  // means the app is not installed yet — the install nudge next to this
  // one is the useful thing to show there, not this.
  if (permission !== 'default' || needsInstallForNotifications()) return null

  return (
    <Link to="/notifications">
      <Card className="flex items-center gap-3 py-3 transition-shadow hover:shadow-lift">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Bell className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-800">Turn on notifications</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Hear the moment a sitting request arrives or is answered.
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-300" />
      </Card>
    </Link>
  )
}
