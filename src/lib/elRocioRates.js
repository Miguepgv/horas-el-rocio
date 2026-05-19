import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'

function formatDateLocalISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * €/h El Rocío 2026 — la primera regla que coincida gana.
 *
 * 15 €/h
 *   Lunes 25 may 00:00 → martes 26 may 05:59
 *
 * 12 €/h
 *   Viernes 15 may 00:00 → lunes 18 may 03:00 (madrugada dom→lun)
 *   Viernes 22 may 06:00 → domingo 24 may 23:59
 *   Martes 26 may desde 06:00
 *
 * 10 €/h — resto de entre semana dentro del evento (y fuera del periodo)
 */
export function eurPerHourAt(d) {
  const iso = formatDateLocalISO(d)
  const from = PAY_EVENT_EL_ROCIO.dateFrom
  const to = PAY_EVENT_EL_ROCIO.dateTo
  if (iso < from || iso > to) return 10

  const t = d.getHours() * 60 + d.getMinutes()

  if (iso === '2026-05-25' || (iso === '2026-05-26' && t < 6 * 60)) {
    return 15
  }

  const apertura12 =
    (iso >= '2026-05-15' && iso < '2026-05-18') ||
    (iso === '2026-05-18' && t < 3 * 60)
  if (apertura12) return 12

  const finSemana12 =
    (iso === '2026-05-22' && t >= 6 * 60) ||
    iso === '2026-05-23' ||
    iso === '2026-05-24'
  if (finSemana12) return 12

  if (iso === '2026-05-26' && t >= 6 * 60) return 12

  return 10
}

/** Euros por tramo [t0,t1) con tarifa por minuto (ms). */
export function eurosForIntervalMs(t0, t1) {
  let euros = 0
  const step = 60_000
  let cur = t0.getTime()
  const end = t1.getTime()
  while (cur < end) {
    const next = Math.min(cur + step, end)
    const d = new Date(cur)
    const h = (next - cur) / 3_600_000
    euros += h * eurPerHourAt(d)
    cur = next
  }
  return euros
}
