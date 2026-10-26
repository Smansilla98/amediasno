/** Teléfonos locales: Argentina. Internacionales: ingresar +código de país. */
export function whatsappNumber(value: string | null | undefined): string | null {
  const text = (value ?? '').trim()
  if (!text || !/^[+\d\s().-]+$/.test(text)) return null
  let digits = text.replace(/\D/g, '')
  const international = text.startsWith('+') || digits.startsWith('00')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (international && !digits.startsWith('54')) return digits.length >= 8 && digits.length <= 15 ? digits : null
  if (digits.startsWith('549') && digits.length === 13) return digits
  if (digits.startsWith('54') && digits.length === 12) digits = digits.slice(2)
  digits = digits.replace(/^0/, '')
  // Prefijo local 15 luego del código de área (2–4 dígitos).
  if (digits.length === 12) digits = digits.replace(/^(\d{2,4})15(?=\d{6,8}$)/, '$1')
  return digits.length === 10 ? `549${digits}` : null
}

export function whatsappUrl(phone: string | null | undefined, message?: string): string | null {
  const number = whatsappNumber(phone)
  return number ? `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ''}` : null
}