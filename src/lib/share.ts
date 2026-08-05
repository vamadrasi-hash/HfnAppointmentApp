import { mapsUrl } from './geo'

export interface ShareableProfile {
  fullName: string
  phone?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  map_url?: string | null
}

/**
 * My name, address, phone and map link as a WhatsApp message.
 *
 * WhatsApp renders *bold* and _italic_, so the name reads as a heading and
 * the sign-off stays quiet. Empty fields are left out rather than shown
 * blank.
 */
export function buildProfileShareText(p: ShareableProfile): string {
  const lines: string[] = []

  const name = p.fullName.trim()
  lines.push(`🙏 *${name || 'My details'}*`)
  lines.push('')

  const phone = p.phone?.trim()
  if (phone) lines.push(`📞 ${phone}`)

  const address = p.address?.trim()
  if (address) {
    // A multi-line address stays readable if every line carries the indent.
    const [first, ...rest] = address.split('\n').map((l) => l.trim()).filter(Boolean)
    lines.push(`🏠 ${first}`)
    rest.forEach((l) => lines.push(`     ${l}`))
  }

  const link = mapsUrl({
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    map_url: p.map_url,
  })
  if (link) lines.push(`📍 ${link}`)

  lines.push('')
  lines.push('_Shared from the Heartfulness Sittings app_')

  return lines.join('\n')
}

function onAPhone(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

// Numbers are typed as people say them here — ten digits, no country
// code — but WhatsApp will only open a chat with the full international
// number, so a bare ten-digit number is read as Indian.
const DEFAULT_COUNTRY_CODE = '91'

/**
 * A phone number in the form WhatsApp wants: digits only, country code
 * included. Null when there is nothing usable to dial, in which case the
 * message is still composed — the sender just picks the chat themselves.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) return DEFAULT_COUNTRY_CODE + digits
  // A local number written with its trunk '0'.
  if (digits.length === 11 && digits.startsWith('0')) {
    return DEFAULT_COUNTRY_CODE + digits.slice(1)
  }
  // Already international (or long enough to be), and short of nonsense.
  if (digits.length >= 11 && digits.length <= 15) return digits
  return null
}

/**
 * A link that opens WhatsApp with this message ready to send — and, when
 * a number is given, with that person's chat already open, so nothing has
 * to be copied or pasted by hand.
 *
 * On a phone wa.me opens the app itself. On a desktop it would instead hand
 * the text to the installed app through an OS-level URL, and that hand-off
 * drops every character outside the basic plane — 🙏 📞 🏠 📍 each arrive as
 * one "�". WhatsApp Web keeps them, because the decoding stays in the
 * browser, so that is where desktop goes.
 */
export function whatsappShareUrl(text: string, phone?: string | null): string {
  const encoded = encodeURIComponent(text)
  const to = whatsappNumber(phone)
  if (onAPhone()) return `https://wa.me/${to ?? ''}?text=${encoded}`
  return `https://web.whatsapp.com/send?${to ? `phone=${to}&` : ''}text=${encoded}`
}

/** Copy to the clipboard, saying whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // An old browser, or a page served without https — the text is on
    // screen to select by hand.
    return false
  }
}
