import {
  formatDateLocalISO,
  parseLocalDate,
  weekdayMonSunFromDate,
} from './payCompute.js'

export function todayIsoLocal() {
  return formatDateLocalISO(new Date())
}

/** @param {string[]} dayList ISO YYYY-MM-DD sorted */
export function partitionEventDays(dayList, todayIso = todayIsoLocal()) {
  const today = []
  const past = []
  const future = []
  for (const iso of dayList) {
    if (iso === todayIso) today.push(iso)
    else if (iso < todayIso) past.push(iso)
    else future.push(iso)
  }
  return { today, past, future, todayIso }
}

/**
 * Vista admin: hoy por defecto; opcional pasado y/o futuro.
 * @param {string[]} dayList
 * @param {{ showPast?: boolean, showFuture?: boolean, todayIso?: string }} opts
 */
export function visibleAdminDays(
  dayList,
  { showPast = false, showFuture = false, todayIso = todayIsoLocal() } = {},
) {
  const { today, past, future } = partitionEventDays(dayList, todayIso)
  let out = [...today]
  if (showPast) out = [...past, ...out]
  if (showFuture) out = [...out, ...future]
  return out
}

/** Trabajador: toda la semana de la planilla (feria completa). */
export function visibleWorkerWeekDays(dayList) {
  return [...dayList]
}

/** @deprecated Usar visibleAdminDays o visibleWorkerWeekDays */
export function visibleFeriaDays(dayList, opts = {}) {
  return visibleAdminDays(dayList, opts)
}

export function isTodayIso(iso, todayIso = todayIsoLocal()) {
  return iso === todayIso
}

/** Días de la semana para informe (hasta hoy + futuro si se pide). */
export function weekReportDayRange(
  allDays,
  todayIso = todayIsoLocal(),
  { includeFuture = false } = {},
) {
  const { past, today, future } = partitionEventDays(allDays, todayIso)
  if (includeFuture) return [...past, ...today, ...future]
  return [...past, ...today]
}

export function visiblePlanillaDayIndices(
  allDays,
  { showPast = false, showFuture = false, todayIso = todayIsoLocal() } = {},
) {
  const visible = visibleAdminDays(allDays, { showPast, showFuture, todayIso })
  return visible
    .map((iso) => allDays.indexOf(iso))
    .filter((i) => i >= 0)
}

export function planillaDayKeysForIndices(dayIndices) {
  return dayIndices.flatMap((i) => {
    const p = String(i + 1).padStart(2, '0')
    return [`d${p}_a`, `d${p}_b`]
  })
}

export function slotIndexForPlanillaDayKey(key) {
  const m = /^d(\d{2})_(a|b)$/.exec(String(key ?? ''))
  if (!m) return 0
  const dayIndex = Number(m[1]) - 1
  return m[2] === 'b' ? dayIndex * 2 + 1 : dayIndex * 2
}

export function fmtDayLabel(iso, weekdayShortFn, fmtDateEsFn) {
  const wd = weekdayMonSunFromDate(parseLocalDate(iso))
  return `${weekdayShortFn(wd)} ${fmtDateEsFn(iso)}`
}

export function fmtDayShortHeader(iso, weekdayShortFn) {
  const wd = weekdayMonSunFromDate(parseLocalDate(iso))
  const d = parseLocalDate(iso)
  const day = d.getDate()
  const mon = d.toLocaleDateString('es-ES', { month: 'short' })
  return `${weekdayShortFn(wd)} ${day} ${mon}`
}
