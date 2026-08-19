import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'

export const TARIFA_VIE_MAR = 12
export const TARIFA_MIERCOLES = 15

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

/** Tarifa fija del evento: vie–mar 12 €/h, mié 15 €/h (todos iguales). */
export function workerRateProfile(_row) {
  return { finde: TARIFA_VIE_MAR, miercoles: TARIFA_MIERCOLES }
}

/** @param {number} weekdayMonSun 1=lun … 7=dom */
export function rateForWeekday(weekdayMonSun, profile) {
  if (weekdayMonSun === 3) return TARIFA_MIERCOLES
  return TARIFA_VIE_MAR
}

export function rateLabelForProfile(_profile) {
  return `Vie–Mar ${TARIFA_VIE_MAR} €/h · Mié ${TARIFA_MIERCOLES} €/h`
}

/**
 * €/h según el instante y el perfil del trabajador.
 * Si el turno cruza medianoche, cada minuto usa el día de ese minuto.
 */
export function eurPerHourAt(d, profile) {
  const iso = formatDateLocalISO(d)
  const from = PAY_EVENT_EL_ROCIO.dateFrom
  const to = PAY_EVENT_EL_ROCIO.dateTo
  if (iso < from || iso > to) return TARIFA_VIE_MAR
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
