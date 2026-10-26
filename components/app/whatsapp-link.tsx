'use client'

import { MessageCircle } from 'lucide-react'
import { whatsappUrl } from '@/lib/whatsapp'

export function WhatsAppLink({ phone, message, label = 'WhatsApp' }: { phone?: string | null; message?: string; label?: string }) {
  const href = whatsappUrl(phone, message)
  if (!href) return null
  return <a href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-emerald-700 outline-none hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-700"><MessageCircle className="size-4" />{label}</a>
}