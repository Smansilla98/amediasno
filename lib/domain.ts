// Vocabulario compartido entre el servidor y la interfaz.

/**
 * Estados de una venta. Las claves no cambian (están en la base); los textos sí.
 * - pending: falta mercadería, no hay nada reservado.
 * - in_production: incluida en un pedido a fábrica abierto.
 * - ready: las unidades están reservadas en stock para esta venta.
 */
export const ORDER_STATUS = {
  pending: 'Pendiente',
  in_production: 'En fábrica',
  ready: 'Lista para entregar',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
} as const
export type OrderStatus = keyof typeof ORDER_STATUS
export const ORDER_FLOW: OrderStatus[] = ['pending', 'in_production', 'ready', 'delivered']

export const PAYMENT_STATUS = { pending: 'Sin pagar', partial: 'Seña', paid: 'Pagado' } as const
export type PaymentStatus = keyof typeof PAYMENT_STATUS

export const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Mercado Pago', 'Tarjeta', 'Otro'] as const

export const BATCH_STATUS = { requested: 'Encargado', in_production: 'En producción', received: 'Recibido' } as const
export type BatchStatus = keyof typeof BATCH_STATUS

export const EXPENSE_CATEGORIES = { factory: 'Fábrica', shipping: 'Envíos', supplies: 'Insumos', services: 'Servicios', other: 'Otros' } as const

/** Talles que se ofrecen para tildar al cargar un producto. Se pueden sumar otros a mano. */
export const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'] as const
// Productos cargados antes con la otra forma de escribirlos: se ordenan en el mismo lugar.
const SIZE_ALIAS: Record<string, string> = { XXL: '2XL', XXXL: '3XL', XXXXL: '4XL' }

/** Tabla de medidas: una fila por talle, una columna por medida (en cm). */
export type SizeChart = { columns: string[]; rows: Record<string, string[]> }
export const hasChart = (chart: SizeChart | null | undefined): chart is SizeChart => !!chart && chart.columns.length > 0 && Object.values(chart.rows).some((row) => row.some(Boolean))

/** Ordena talles: primero los estándar en su orden, después el resto. */
export const sortSizes = (sizes: string[]) => [...sizes].sort((a, b) => {
  const [ia, ib] = [a, b].map((size) => (STANDARD_SIZES as readonly string[]).indexOf(SIZE_ALIAS[size.toUpperCase()] ?? size.toUpperCase()))
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'es', { numeric: true })
})

export const paymentStatusFor = (totalCents: number, paidCents: number): PaymentStatus =>
  paidCents >= totalCents && totalCents > 0 ? 'paid' : paidCents > 0 ? 'partial' : 'pending'

export const labelOf = (map: Record<string, string>, key: string | null | undefined) => (key && map[key]) || key || '—'

const moneyFormat = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2, minimumFractionDigits: 0 })
export const money = (cents: number) => moneyFormat.format((cents || 0) / 100)

/** "1.250,50" o "1250.5" → centavos. Devuelve NaN si no es un importe. */
export function toCents(value: FormDataEntryValue | string | number | null | undefined) {
  if (typeof value === 'number') return Math.round(value * 100)
  const text = String(value ?? '').trim().replace(/\s|\$/g, '')
  if (!text) return 0
  // En Argentina el punto separa miles: "4.500" son cuatro mil quinientos, no cuatro y medio.
  const thousands = /^-?\d{1,3}(\.\d{3})+$/.test(text)
  const normalized = text.includes(',') || thousands ? text.replace(/\./g, '').replace(',', '.') : text
  const number = Number(normalized)
  return Number.isFinite(number) ? Math.round(number * 100) : NaN
}

const TZ = 'America/Argentina/Buenos_Aires'
const dateFormat = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ })
const dayMonthFormat = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: TZ })

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return '—'
  // Las fechas de entrega se guardan como 'AAAA-MM-DD': no llevan zona horaria.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date)
}
export const formatDayMonth = (value: Date | string) => dayMonthFormat.format(new Date(value))

/** Fecha de hoy en Argentina como 'AAAA-MM-DD'. */
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
export const monthKey = (value: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date(value)).slice(0, 7)

export const fullName = (first?: string | null, last?: string | null) => `${first ?? ''} ${last ?? ''}`.trim()

/** Nombre del emprendimiento, tal como se muestra. */
export const BRAND = 'A medias No'
