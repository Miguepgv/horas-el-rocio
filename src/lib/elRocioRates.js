import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'

export const TARIFA_FINDE_OPTIONS = [10, 12]
export const TARIFA_MIERCOLES_OPTIONS = [12, 15]
export const TARIFA_LUNES_MARTES = 10

function formatDateLocalISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekdayMonSun(d) {
  const j = d.getDay()
  return j === 0 ? 7 : j
}

/**
 * Vie–Dom: 10 o 12 (según trabajador).
 * Lun–Mar: 10 todos.
 * Mié: 12 o 15 (según trabajador).
 */
export function workerRateProfile(row) {
  if (row && (row.finde === 10 || row.finde === 12)) {
    return {
      finde: row.finde === 12 ? 12 : 10,
      miercoles: row.miercoles === 15 ? 15 : 12,
    }
  }
  const finde = Number(row?.tarifa_finde) === 12 ? 12 : 10
  const miercoles = Number(row?.tarifa_miercoles) === 15 ? 15 : 12
  return { finde, miercoles }
}

/** @param {number} weekdayMonSun 1=lun … 7=dom */
export function rateForWeekday(weekdayMonSun, profile) {
  const { finde, miercoles } = workerRateProfile(profile)
  if (weekdayMonSun === 1 || weekdayMonSun === 2) return TARIFA_LUNES_MARTES
  if (weekdayMonSun === 3) return miercoles
  if (weekdayMonSun === 5 || weekdayMonSun === 6 || weekdayMonSun === 7) return finde
  return TARIFA_LUNES_MARTES
}

export function rateLabelForProfile(profile) {
  const p = workerRateProfile(profile)
  return `Vie–Dom ${p.finde} €/h · Lun–Mar 10 €/h · Mié ${p.miercoles} €/h`
}

/**
 * €/h según el instante y el perfil del trabajador.
 * Si el turno cruza medianoche, cada minuto usa el día de ese minuto.
 */
export function eurPerHourAt(d, profile) {
  const iso = formatDateLocalISO(d)
  const from = PAY_EVENT_EL_ROCIO.dateFrom
  const to = PAY_EVENT_EL_ROCIO.dateTo
  if (iso < from || iso > to) return TARIFA_LUNES_MARTES
  return rateForWeekday(weekdayMonSun(d), profile)
}

/** Euros por tramo [t0,t1) con tarifa por minuto (ms). */
export function eurosForIntervalMs(t0, t1, profile) {
  let euros = 0
  const step = 60_000
  let cur = t0.getTime()
  const end = t1.getTime()
  while (cur < end) {
    const next = Math.min(cur + step, end)
    const d = new Date(cur)
    const h = (next - cur) / 3_600_000
    euros += h * eurPerHourAt(d, profile)
    cur = next
  }
  return euros
}
