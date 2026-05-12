import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'
import { eurosForIntervalMs } from './elRocioRates.js'

/** Lunes=1 … Domingo=7 (fecha local). */
export function weekdayMonSunFromDate(d) {
  const j = d.getDay()
  return j === 0 ? 7 : j
}

export function formatDateLocalISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseLocalDate(isoYmd) {
  const [y, m, d] = isoYmd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isNoPay(p) {
  return Boolean(p?.no_pay)
}

/** Tarifa €/h (legacy por día de semana; solo etiqueta si hace falta). */
export function applicableHourlyRate(weekdayMonSun) {
  const segs = [...PAY_EVENT_EL_ROCIO.segments].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
  for (const s of segs) {
    if (s.weekdays.includes(weekdayMonSun)) return Number(s.eurPerHour) || 0
  }
  return 0
}

/** Fechas ISO entre inicio y fin del evento (inclusive). */
export function eachEventDateISO() {
  const out = []
  const a = parseLocalDate(PAY_EVENT_EL_ROCIO.dateFrom)
  const b = parseLocalDate(PAY_EVENT_EL_ROCIO.dateTo)
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    out.push(formatDateLocalISO(new Date(d)))
  }
  return out
}

function punchesForCalendarDay(punches, dayIso) {
  return punches.filter((p) => {
    const t = new Date(p.punched_at)
    return formatDateLocalISO(t) === dayIso
  })
}

/** Pares entrada→salida (solo cobro), orden cronológico global. */
export function paidInOutPairs(punches) {
  const list = punches
    .filter((p) => !isNoPay(p))
    .slice()
    .sort((x, y) => new Date(x.punched_at) - new Date(y.punched_at))
  const pairs = []
  let openIn = null
  for (const p of list) {
    if (p.punch_type === 'in') {
      openIn = new Date(p.punched_at)
    } else if (p.punch_type === 'out' && openIn) {
      pairs.push([openIn, new Date(p.punched_at)])
      openIn = null
    }
  }
  return pairs
}

/**
 * Tramos cobrados que solapan un día local: cada tramo es un par entrada→salida global con
 * las horas de ese par que caen dentro del día (alineado con paidEurosOverlappingDay).
 * @returns {Array<{ inAt: Date, outAt: Date, hoursOnDay: number }>}
 */
export function paidShiftsOverlappingDay(punches, dayIso) {
  const dayStart = parseLocalDate(dayIso)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const segments = []
  for (const [a, b] of paidInOutPairs(punches)) {
    const s = Math.max(a.getTime(), dayStart.getTime())
    const e = Math.min(b.getTime(), dayEnd.getTime())
    if (s >= e) continue
    segments.push({
      inAt: a,
      outAt: b,
      hoursOnDay: (e - s) / 3_600_000,
    })
  }
  return segments
}

/** Horas con cobro que caen en ese día local (puede ser parte de un cruce de medianoche). */
export function workedPaidHoursOverlappingDay(punches, dayIso) {
  const dayStart = parseLocalDate(dayIso)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  let ms = 0
  for (const [a, b] of paidInOutPairs(punches)) {
    const s = Math.max(a.getTime(), dayStart.getTime())
    const e = Math.min(b.getTime(), dayEnd.getTime())
    if (s < e) ms += e - s
  }
  return ms / 3_600_000
}

/** Horas sin cobro solapadas con el día. */
export function workedNoPayHoursOverlappingDay(punches, dayIso) {
  const dayStart = parseLocalDate(dayIso)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const list = punches
    .filter((p) => isNoPay(p))
    .slice()
    .sort((x, y) => new Date(x.punched_at) - new Date(y.punched_at))
  const pairs = []
  let openIn = null
  for (const p of list) {
    if (p.punch_type === 'in') openIn = new Date(p.punched_at)
    else if (p.punch_type === 'out' && openIn) {
      pairs.push([openIn, new Date(p.punched_at)])
      openIn = null
    }
  }
  let ms = 0
  for (const [a, b] of pairs) {
    const s = Math.max(a.getTime(), dayStart.getTime())
    const e = Math.min(b.getTime(), dayEnd.getTime())
    if (s < e) ms += e - s
  }
  return ms / 3_600_000
}

/** Horas fichadas mismo día (todas), emparejando in/out del día — vista simple. */
export function workedHoursForDay(punches, dayIso) {
  const list = punchesForCalendarDay(punches, dayIso)
    .slice()
    .sort((x, y) => new Date(x.punched_at) - new Date(y.punched_at))
  let hours = 0
  let openIn = null
  for (const p of list) {
    if (p.punch_type === 'in') {
      openIn = new Date(p.punched_at)
    } else if (p.punch_type === 'out' && openIn) {
      const outT = new Date(p.punched_at)
      hours += Math.max(0, (outT - openIn) / 3_600_000)
      openIn = null
    }
  }
  return hours
}

/** € cobro en ese día (tramos por minuto con tarifa variable). */
export function paidEurosOverlappingDay(punches, dayIso) {
  const dayStart = parseLocalDate(dayIso)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  let euros = 0
  for (const [a, b] of paidInOutPairs(punches)) {
    const s = Math.max(a.getTime(), dayStart.getTime())
    const e = Math.min(b.getTime(), dayEnd.getTime())
    if (s < e) euros += eurosForIntervalMs(new Date(s), new Date(e))
  }
  return euros
}

const WD_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function weekdayShort(weekdayMonSun) {
  return WD_SHORT[weekdayMonSun] ?? ''
}

export function formatHoursMinutes(h) {
  if (!Number.isFinite(h) || h <= 0) return '0h 00m'
  const totalMin = Math.round(h * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh}h ${String(mm).padStart(2, '0')}m`
}

export function buildDailySummary(punches) {
  const days = [...eachEventDateISO()].sort()
  const rows = []
  let totalHours = 0
  let totalGross = 0
  for (const iso of days) {
    const d = parseLocalDate(iso)
    const wd = weekdayMonSunFromDate(d)
    const h = workedPaidHoursOverlappingDay(punches, iso)
    const gross = paidEurosOverlappingDay(punches, iso)
    const rate = h > 0 ? gross / h : applicableHourlyRate(wd)
    totalHours += h
    totalGross += gross
    rows.push({
      dateIso: iso,
      weekdayMonSun: wd,
      weekdayLabel: weekdayShort(wd),
      hours: h,
      rate,
      gross,
    })
  }
  return { rows, totalHours, totalGross }
}

/** Fijo: extra horas = bruto horas − nómina evento; sumar parking y gasoil. */
export function fixedWorkerExtras(profile, totalGrossHoursPay) {
  const payroll = Number(profile?.payroll_event_euros ?? 0)
  const parking = Number(profile?.parking_euros ?? 0)
  const gasoil = Number(profile?.gasoil_euros ?? 0)
  const extraHours = Math.max(0, totalGrossHoursPay - payroll)
  const totalCash = extraHours + parking + gasoil
  return {
    payrollIncluded: payroll,
    grossFromHours: totalGrossHoursPay,
    extraAfterPayroll: extraHours,
    parking,
    gasoil,
    totalCashExtra: totalCash,
    isFixed: Boolean(profile?.is_fixed) || payroll > 0,
  }
}
