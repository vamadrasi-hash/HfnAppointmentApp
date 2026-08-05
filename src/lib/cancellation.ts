// A preceptor cancelling a sitting they had already confirmed.
//
// Two things have to say exactly the same thing: the notification the
// seeker gets inside the app, and the WhatsApp message the preceptor
// sends them. So both are built from the words the preceptor typed —
// never a paraphrase — wrapped in a frame that is written out twice, in
// English and in Hindi.
//
// The frame is translated here because it is fixed text. The preceptor's
// own message cannot be: nothing in the app can translate a sentence
// faithfully, and a cancellation is the wrong place to guess. So the
// screen offers a Hindi box alongside the English one, pre-filled by the
// common reasons below, and whatever ends up in it is what goes out. Left
// empty, the English words are repeated under the Hindi frame rather than
// mangled.

import { formatTimeRange, fromISODate, prettyDate } from './utils'

export interface CancellationReason {
  id: string
  en: string
  hi: string
}

/**
 * The reasons a sitting is usually called off, each with its Hindi
 * counterpart. Tapping one fills both boxes; the preceptor is free to
 * edit either afterwards, or to ignore them and write their own.
 */
export const CANCELLATION_REASONS: CancellationReason[] = [
  {
    id: 'unwell',
    en: 'I am unwell and will not be able to give the sitting.',
    hi: 'मैं अस्वस्थ हूँ और सिटिंग नहीं दे पाऊँगा/पाऊँगी।',
  },
  {
    id: 'travelling',
    en: 'I am travelling and will not be at the sitting place at that time.',
    hi: 'मैं यात्रा पर हूँ और उस समय सिटिंग स्थान पर नहीं रहूँगा/रहूँगी।',
  },
  {
    id: 'urgent',
    en: 'Something urgent has come up at that time.',
    hi: 'उस समय कोई ज़रूरी काम आ गया है।',
  },
  {
    id: 'place',
    en: 'The sitting place is not available at that time.',
    hi: 'उस समय सिटिंग स्थान उपलब्ध नहीं है।',
  },
  {
    id: 'rebook',
    en: 'Please book another time — I will be glad to give you the sitting then.',
    hi: 'कृपया कोई दूसरा समय बुक करें — तब मैं आपको सिटिंग देकर प्रसन्न होऊँगा/होऊँगी।',
  },
]

const HI_MONTHS = [
  'जनवरी',
  'फ़रवरी',
  'मार्च',
  'अप्रैल',
  'मई',
  'जून',
  'जुलाई',
  'अगस्त',
  'सितंबर',
  'अक्टूबर',
  'नवंबर',
  'दिसंबर',
]

/** '2026-08-06' as '6 अगस्त 2026'. */
export function prettyDateHi(iso: string): string {
  const d = fromISODate(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getDate()} ${HI_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export interface CancellationMessageInput {
  seekerName?: string | null
  preceptorName?: string | null
  date: string // 'YYYY-MM-DD'
  /** The sitting's times, when it has any. */
  startTime?: string | null
  endTime?: string | null
  /** Where it was to be — 'Adajan Heartspot', and so on. */
  placeName?: string | null
  /** The kind of sitting, in both languages when the master list has both. */
  sessionType?: { name: string; name_hi?: string | null } | null
  /** What the preceptor wrote. The English one is required. */
  messageEn: string
  /** The same message in Hindi. Empty means "repeat the English". */
  messageHi?: string
}

function whenLine(input: CancellationMessageInput, hindi: boolean): string {
  const date = hindi ? prettyDateHi(input.date) : prettyDate(input.date)
  const time =
    input.startTime && input.endTime
      ? ` · ${formatTimeRange(input.startTime, input.endTime)}`
      : ''
  return date + time
}

/**
 * The cancellation as one WhatsApp message: what was cancelled, then the
 * preceptor's own words — first in English, then the same again in Hindi.
 * WhatsApp renders *bold* and _italic_, which is what the headings use.
 */
export function buildCancellationMessage(input: CancellationMessageInput): string {
  const seeker = input.seekerName?.trim()
  const preceptor = input.preceptorName?.trim() || 'your preceptor'
  const en = input.messageEn.trim()
  // No Hindi of their own: send the English words under the Hindi frame
  // rather than a machine guess at what they meant.
  const hi = input.messageHi?.trim() || en
  const place = input.placeName?.trim()

  const lines: string[] = []

  lines.push('🙏 *Sitting cancelled*')
  lines.push('')
  lines.push(seeker ? `Dear ${seeker},` : 'Namaste,')
  lines.push(`Your sitting with *${preceptor}* has been cancelled.`)
  lines.push('')
  lines.push(`📅 ${whenLine(input, false)}`)
  if (place) lines.push(`📍 ${place}`)
  if (input.sessionType?.name) lines.push(`🧘 ${input.sessionType.name}`)
  if (en) {
    lines.push('')
    lines.push(`*Message from ${preceptor}:*`)
    lines.push(en)
  }

  lines.push('')
  lines.push('— — —')
  lines.push('')

  lines.push('🙏 *सिटिंग रद्द कर दी गई है*')
  lines.push('')
  lines.push(seeker ? `प्रिय ${seeker},` : 'नमस्ते,')
  lines.push(`*${preceptor}* के साथ आपकी सिटिंग रद्द कर दी गई है।`)
  lines.push('')
  lines.push(`📅 ${whenLine(input, true)}`)
  if (place) lines.push(`📍 ${place}`)
  if (input.sessionType?.name_hi || input.sessionType?.name) {
    lines.push(`🧘 ${input.sessionType.name_hi || input.sessionType.name}`)
  }
  if (hi) {
    lines.push('')
    lines.push(`*${preceptor} का संदेश:*`)
    lines.push(hi)
  }

  lines.push('')
  lines.push('_Sent from the Heartfulness Sittings app_')

  return lines.join('\n')
}
