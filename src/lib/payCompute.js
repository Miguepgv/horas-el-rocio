import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'
import { eurosForIntervalMs } from './elRocioRates.js'
import { eachPlanillaGridDateISO } from './rocioPlanillaSchedule.js'

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

export function applicableHourlyRate(weekdayMonSun) {
  const segs = [...PAY_EVENT_EL_ROCIO.segments].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )
  for (const s of segs) {
    if (s.weekdays.includes(weekdayMonSun)) return Number(s.eurPerHour) || 0
  }
  return 0
}

export function eachEventDateISO() {
  const out = []
  const a = parseLocalDate(PAY_EVENT_EL_ROCIO.dateFrom)
  const b = parseLocalDate(PAY_EVENT_EL_ROCIO.dateTo)
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    out.push(formatDateLocalISO(new Date(d)))
  }
  return out
}

/** Días de cobro / fichajes alineados con la planilla (d01…d11) + días con picadas fuera de la rejilla. */
export function eachCobroDisplayDateISO(punches) {
  const dates = [...eachPlanillaGridDateISO()]
  const seen = new Set(dates)
  for (const p of punches ?? []) {
    const iso = formatDateLocalISO(new Date(p.punched_at))
    if (!seen.has(iso)) {
      seen.add(iso)
      dates.push(iso)
    }
  }
  return dates.sort()
}

export function punchesForCalendarDay(punches, dayIso) {
  return punches.filter((p) => {
    const t = new Date(p.punched_at)
    return formatDateLocalISO(t) === dayIso
  })
}

/** Turnos para mostrar: por día de entrada y, si no hay, fichajes sueltos ese día natural. */
export function displayShiftsForDay(punches, dayIso) {
  const byStart = paidShiftsByStartDay(punches, dayIso)
  if (byStart.length) return byStart

  const dayPunches = punchesForCalendarDay(punches, dayIso)
    .filter((p) => !isNoPay(p))
    .slice()
    .sort((x, y) => new Date(x.punched_at) - new Date(y.punched_at))
  if (!dayPunches.length) return []

  const segments = []
  let openIn = null
  for (const p of dayPunches) {
    if (p.punch_type === 'in') {
      if (openIn) {
        segments.push({
          inAt: openIn,
          outAt: null,
          open: true,
          hoursOnDay: 0,
        })
      }
      openIn = new Date(p.punched_at)
    } else if (p.punch_type === 'out' && openIn) {
      const outAt = new Date(p.punched_at)
      segments.push({
        inAt: openIn,
        outAt,
        open: false,
        hoursOnDay: Math.max(0, (outAt - openIn) / 3_600_000),
      })
      openIn = null
    }
  }
  if (openIn) {
    segments.push({
      inAt: openIn,
      outAt: null,
      open: true,
      hoursOnDay: 0,
    })
  }
  return segments
}

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

/** Día natural del fichaje de entrada (turnos que pasan medianoche cuentan en el día de entrada). */
export function paidShiftStartDayIso(inAt) {
  return formatDateLocalISO(inAt)
}

/**
 * Turnos con entrada en `dayIso`. Incluye turnos abiertos (solo entrada, sin salida aún).
 * Horas y € del resumen solo cuentan turnos cerrados (open === false).
 */
export function paidShiftsByStartDay(punches, dayIso) {
  const list = punches
    .filter((p) => !isNoPay(p))
    .slice()
    .sort((x, y) => new Date(x.punched_at) - new Date(y.punched_at))
  const segments = []
  let openIn = null

  const pushOpenIfOnDay = () => {
    if (!openIn || paidShiftStartDayIso(openIn) !== dayIso) return
    segments.push({
      inAt: openIn,
      outAt: null,
      open: true,
      hoursOnDay: 0,
    })
    openIn = null
  }

  for (const p of list) {
    if (p.punch_type === 'in') {
      if (openIn) pushOpenIfOnDay()
      openIn = new Date(p.punched_at)
    } else if (p.punch_type === 'out' && openIn) {
      const inAt = openIn
      openIn = null
      if (paidShiftStartDayIso(inAt) !== dayIso) continue
      const outAt = new Date(p.punched_at)
      segments.push({
        inAt,
        outAt,
        open: false,
        hoursOnDay: Math.max(0, (outAt.getTime() - inAt.getTime()) / 3_600_000),
      })
    }
  }
  if (openIn) pushOpenIfOnDay()
  return segments
}

/** @deprecated Usar paidShiftsByStartDay (misma API; ya no parte por medianoche). */
export function paidShiftsOverlappingDay(punches, dayIso) {
  return paidShiftsByStartDay(punches, dayIso)
}

export function workedPaidHoursByStartDay(punches, dayIso) {
  return paidShiftsByStartDay(punches, dayIso).reduce((s, seg) => s + seg.hoursOnDay, 0)
}

/** @deprecated Usar workedPaidHoursByStartDay */
export function workedPaidHoursOverlappingDay(punches, dayIso) {
  return workedPaidHoursByStartDay(punches, dayIso)
}

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

export function paidEurosByStartDay(punches, dayIso) {
  let euros = 0
  for (const [a, b] of paidInOutPairs(punches)) {
    if (paidShiftStartDayIso(a) !== dayIso) continue
    euros += eurosForIntervalMs(a, b)
  }
  return euros
}

/** @deprecated Usar paidEurosByStartDay */
export function paidEurosOverlappingDay(punches, dayIso) {
  return paidEurosByStartDay(punches, dayIso)
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
  const days = eachCobroDisplayDateISO(punches)
  const rows = []
  let totalHours = 0
  let totalGross = 0
  for (const iso of days) {
    const d = parseLocalDate(iso)
    const wd = weekdayMonSunFromDate(d)
    const h = workedPaidHoursByStartDay(punches, iso)
    const gross = paidEurosByStartDay(punches, iso)
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
