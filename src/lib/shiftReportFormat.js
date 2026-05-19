import { formatHoursMinutes } from './payCompute.js'

function fmtClockFromDate(d) {
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Texto legible de turnos para informe / Excel. */
export function formatShiftsReportLines(shifts) {
  if (!shifts?.length) return '—'
  return shifts
    .map((seg, i) => {
      const n = shifts.length > 1 ? `Turno ${i + 1}: ` : ''
      if (seg.open) {
        return `${n}E ${fmtClockFromDate(seg.inAt)} → salida pendiente`
      }
      return `${n}E ${fmtClockFromDate(seg.inAt)} → S ${fmtClockFromDate(seg.outAt)} (${formatHoursMinutes(seg.hoursOnDay)})`
    })
    .join('\n')
}
