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

/**
 * A link that opens WhatsApp with this message ready to send.
 *
 * On a phone wa.me opens the app itself. On a desktop it would instead hand
 * the text to the installed app through an OS-level URL, and that hand-off
 * drops every character outside the basic plane — 🙏 📞 🏠 📍 each arrive as
 * one "�". WhatsApp Web keeps them, because the decoding stays in the
 * browser, so that is where desktop goes.
 */
export function whatsappShareUrl(text: string): string {
  const encoded = encodeURIComponent(text)
  return onAPhone()
    ? `https://wa.me/?text=${encoded}`
    : `https://web.whatsapp.com/send?text=${encoded}`
}
