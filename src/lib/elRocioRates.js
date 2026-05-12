import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'

function formatDateLocalISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekdayMonSunFromDate(d) {
  const j = d.getDay()
  return j === 0 ? 7 : j
}

/**
 * €/h según reglas El Rocío 2026 (instante local).
 * Orden de aplicación (la primera que coincida gana):
 * 1) Vie 15 may ≥18:00 hasta Lun 18 may <06:00 → 12€
 * 2) Lunes 00:00–06:00 → 15€
 * 3) Martes >06:00 (resto del martes) → 12€
 * 4) Viernes >06:00 hasta Dom ≤23:59 → 12€
 * 5) Lunes 06:01 en adelante hasta Vie 06:00 (tramo “entre semana”) → 10€
 */
export function eurPerHourAt(d) {
  const iso = formatDateLocalISO(d)
  const from = PAY_EVENT_EL_ROCIO.dateFrom
  const to = PAY_EVENT_EL_ROCIO.dateTo
  /** Pruebas / días fuera del periodo oficial: tarifa base para que el cobro no salga a 0 €/h. */
  if (iso < from || iso > to) return 10

  const wd = weekdayMonSunFromDate(d)
  const t = d.getHours() * 60 + d.getMinutes()

  const opening12 =
    (iso === '2026-05-15' && t >= 18 * 60) ||
    (iso > '2026-05-15' && iso < '2026-05-18') ||
    (iso === '2026-05-18' && t < 6 * 60)
  if (opening12) return 12

  if (wd === 1 && t < 6 * 60) return 15

  if (wd === 2 && t > 6 * 60) return 12

  if (wd === 5 && t > 6 * 60) return 12
  if (wd === 6) return 12
  if (wd === 7 && t < 24 * 60) return 12

  if (wd === 1 && t >= 6 * 60) return 10
  if (wd === 2 && t <= 6 * 60) return 10
  if (wd === 3 || wd === 4) return 10
  if (wd === 5 && t <= 6 * 60) return 10

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
