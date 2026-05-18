import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'
import {
  eachPlanillaGridDateISO,
  planillaGridDateForDayIndex,
} from './rocioPlanillaSchedule.js'
import { parseLocalDate, weekdayMonSunFromDate } from './payCompute.js'

const WD_FULL = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/** Cabecera de columna planilla (d01_a, d01_b, …) → «Sábado» / «Sáb · 2º» (misma fecha que las celdas). */
export function planillaColumnHeader(slotIndex) {
  const dayIndex = Math.floor(slotIndex / 2)
  const isSecondHalf = slotIndex % 2 === 1
  const iso = planillaGridDateForDayIndex(dayIndex)
  if (!iso) {
    return `${dayIndex + 1}${isSecondHalf ? 'b' : 'a'}`
  }
  const wd = weekdayMonSunFromDate(parseLocalDate(iso))
  const name = WD_FULL[wd] ?? `Día ${dayIndex + 1}`
  if (!isSecondHalf) return name
  return `${name.slice(0, 3)} · 2º`
}

export function planillaColumnTitle(slotIndex) {
  const dayIndex = Math.floor(slotIndex / 2)
  const iso = planillaGridDateForDayIndex(dayIndex)
  const key = `d${String(dayIndex + 1).padStart(2, '0')}_${slotIndex % 2 === 0 ? 'a' : 'b'}`
  if (!iso) return key
  const fmt = parseLocalDate(iso).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
  return `${fmt} (${key}) · ${PAY_EVENT_EL_ROCIO.label}`
}

export { eachPlanillaGridDateISO }
