import { formatHoursMinutes } from './payCompute.js'
import { formatShiftsReportLines } from './shiftReportFormat.js'
import { fmtDayLabel, fmtDayShortHeader } from './feriaDayView.js'
import { parseLocalDate, weekdayShort } from './payCompute.js'

function stampYmd() {
  return new Date().toISOString().slice(0, 10)
}

function fmtDateEs(isoYmd) {
  const d = parseLocalDate(isoYmd)
  return d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

async function loadXlsx() {
  return import('xlsx')
}

/**
 * Informe diario: listado de turnos picados y total horas por persona.
 * @param {{ reportDateIso: string, title?: string, rows: Array<{ nombre: string, correo?: string, shiftsText: string, hours: number, euros: number }> }} opts
 */
export async function downloadDailyShiftsReportXlsx(opts) {
  const {
    reportDateIso,
    title = 'Informe diario de turnos',
    rows = [],
  } = opts ?? {}
  const XLSX = await loadXlsx()
  const dayLabel = fmtDayLabel(reportDateIso, weekdayShort, fmtDateEs)
  const header = ['Nombre', 'Correo', 'Turnos del día', 'Total horas', 'Total €']
  const body = rows.map((r) => [
    r.nombre ?? '',
    r.correo ?? '',
    r.shiftsText ?? '—',
    r.hours > 0 ? formatHoursMinutes(r.hours) : '—',
    r.euros > 0 ? Number(r.euros.toFixed(2)) : '—',
  ])
  const totalH = rows.reduce((s, r) => s + (r.hours || 0), 0)
  const totalE = rows.reduce((s, r) => s + (r.euros || 0), 0)
  const aoa = [
    [title],
    [`Día: ${dayLabel} (${reportDateIso})`],
    [],
    header,
    ...body,
    [],
    ['TOTAL', '', '', formatHoursMinutes(totalH), totalE > 0 ? Number(totalE.toFixed(2)) : '—'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 48 }, { wch: 14 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Día')
  XLSX.writeFile(wb, `informe-turnos-${reportDateIso}-${stampYmd()}.xlsx`)
}

/**
 * @param {Array<{ nombre: string, correo?: string|null, punchLookupEmail?: string|null }>} workers
 * @param {Record<string, Array>} punchByEmail
 * @param {string} reportDateIso
 * @param {(punches: Array, iso: string) => Array} paidShiftsFn
 * @param {(punches: Array, iso: string) => number} hoursFn
 * @param {(punches: Array, iso: string) => number} eurosFn
 * @param {(worker: object, punchByEmail: Record) => Array} punchesForWorker
 */
export function buildDailyReportRows(
  workers,
  punchByEmail,
  reportDateIso,
  { paidShiftsFn, hoursFn, eurosFn, punchesForWorker },
) {
  return workers.map((w) => {
    const punches = punchesForWorker(w, punchByEmail)
    const shifts = paidShiftsFn(punches, reportDateIso)
    const hours = hoursFn(punches, reportDateIso)
    const euros = eurosFn(punches, reportDateIso)
    return {
      nombre: w.nombre,
      correo: w.correo || w.punchLookupEmail || '',
      shiftsText: formatShiftsReportLines(shifts),
      hours,
      euros,
      hasActivity: shifts.length > 0 || hours > 0,
    }
  })
}

export function buildWorkerWeekCells(
  worker,
  punchByEmail,
  dayIsos,
  fns,
) {
  const punches = fns.punchesForWorker(worker, punchByEmail)
  const byDay = {}
  let totalH = 0
  let totalE = 0
  for (const iso of dayIsos) {
    const shifts = fns.paidShiftsFn(punches, iso)
    const hours = fns.hoursFn(punches, iso)
    const euros = fns.eurosFn(punches, iso)
    byDay[iso] = {
      shiftsText: formatShiftsReportLines(shifts),
      hours,
      euros,
    }
    totalH += hours
    totalE += euros
  }
  return { byDay, totalH, totalE }
}

/**
 * Informe semanal: bloque por día (como el diario) + hoja resumen con totales.
 * @param {{ dayIsos: string[], title?: string, workers: Array, punchByEmail: Record, fns: object }} opts
 */
export async function downloadWeeklyShiftsReportXlsx(opts) {
  const {
    dayIsos = [],
    title = 'Informe semanal — personal (turnos picados)',
    workers = [],
    punchByEmail = {},
    fns,
  } = opts ?? {}
  const XLSX = await loadXlsx()
  const wb = XLSX.utils.book_new()

  const rangeLabel =
    dayIsos.length > 0
      ? `${fmtDayLabel(dayIsos[0], weekdayShort, fmtDateEs)} → ${fmtDayLabel(dayIsos[dayIsos.length - 1], weekdayShort, fmtDateEs)}`
      : '—'

  let grandH = 0
  let grandE = 0
  const aoaResumen = [
    [title],
    [`Periodo: ${rangeLabel}`],
    [],
    [
      'Nombre',
      'Correo',
      ...dayIsos.flatMap((iso) => [
        `${fmtDayShortHeader(iso, weekdayShort)} h`,
        `${fmtDayShortHeader(iso, weekdayShort)} €`,
      ]),
      'Total horas',
      'Total €',
    ],
  ]

  for (const w of workers) {
    const { byDay, totalH, totalE } = buildWorkerWeekCells(
      w,
      punchByEmail,
      dayIsos,
      fns,
    )
    grandH += totalH
    grandE += totalE
    aoaResumen.push([
      w.nombre ?? '',
      w.correo || w.punchLookupEmail || '',
      ...dayIsos.flatMap((iso) => {
        const d = byDay[iso]
        return [
          d.hours > 0 ? formatHoursMinutes(d.hours) : '—',
          d.euros > 0 ? Number(d.euros.toFixed(2)) : '—',
        ]
      }),
      totalH > 0 ? formatHoursMinutes(totalH) : '—',
      totalE > 0 ? Number(totalE.toFixed(2)) : '—',
    ])
  }

  aoaResumen.push([])
  aoaResumen.push([
    'TOTAL PERSONAL',
    '',
    ...dayIsos.flatMap((iso) => {
      let h = 0
      let e = 0
      for (const w of workers) {
        const punches = fns.punchesForWorker(w, punchByEmail)
        h += fns.hoursFn(punches, iso)
        e += fns.eurosFn(punches, iso)
      }
      return [
        h > 0 ? formatHoursMinutes(h) : '—',
        e > 0 ? Number(e.toFixed(2)) : '—',
      ]
    }),
    formatHoursMinutes(grandH),
    grandE > 0 ? Number(grandE.toFixed(2)) : '—',
  ])

  const wsResumen = XLSX.utils.aoa_to_sheet(aoaResumen)
  wsResumen['!cols'] = [
    { wch: 22 },
    { wch: 26 },
    ...dayIsos.flatMap(() => [{ wch: 10 }, { wch: 10 }]),
    { wch: 12 },
    { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen semana')

  const aoaDetalle = [[title], [`Periodo: ${rangeLabel}`], []]

  for (const iso of dayIsos) {
    const dayLabel = fmtDayLabel(iso, weekdayShort, fmtDateEs)
    let dayH = 0
    let dayE = 0
    aoaDetalle.push([`—— ${dayLabel} (${iso}) ——`])
    aoaDetalle.push(['Nombre', 'Correo', 'Turnos', 'Horas', '€'])
    const dayRows = buildDailyReportRows(workers, punchByEmail, iso, fns)
    for (const r of dayRows) {
      dayH += r.hours
      dayE += r.euros
      aoaDetalle.push([
        r.nombre,
        r.correo,
        r.shiftsText,
        r.hours > 0 ? formatHoursMinutes(r.hours) : '—',
        r.euros > 0 ? Number(r.euros.toFixed(2)) : '—',
      ])
    }
    aoaDetalle.push([
      'Subtotal día',
      '',
      '',
      dayH > 0 ? formatHoursMinutes(dayH) : '—',
      dayE > 0 ? Number(dayE.toFixed(2)) : '—',
    ])
    aoaDetalle.push([])
  }

  aoaDetalle.push([
    'TOTAL SEMANA (personal)',
    '',
    '',
    formatHoursMinutes(grandH),
    grandE > 0 ? Number(grandE.toFixed(2)) : '—',
  ])

  const wsDetalle = XLSX.utils.aoa_to_sheet(aoaDetalle)
  wsDetalle['!cols'] = [{ wch: 22 }, { wch: 26 }, { wch: 44 }, { wch: 12 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Por día')

  const from = dayIsos[0] ?? stampYmd()
  const to = dayIsos[dayIsos.length - 1] ?? from
  XLSX.writeFile(wb, `informe-semana-${from}_${to}-${stampYmd()}.xlsx`)
}
