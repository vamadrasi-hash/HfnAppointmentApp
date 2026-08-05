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

/** The wa.me link that opens WhatsApp with this message ready to send. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
