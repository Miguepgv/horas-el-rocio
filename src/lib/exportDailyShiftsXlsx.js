import { formatHoursMinutes } from './payCompute.js'
import { computeAdminPayout } from './planillaEuroExtras.js'
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

const PAY_TAIL_HEADERS = [
  '€ bruto horas',
  'Nómina (resta) €',
  'Horas en mano €',
  'Gasoil €',
  'Parking €',
  'Total a pagar €',
]

function payoutCells(p) {
  return [
    p.brutoHoras > 0 ? Number(p.brutoHoras.toFixed(2)) : '—',
    p.nomina > 0 ? Number(p.nomina.toFixed(2)) : '—',
    p.horasEnMano > 0 ? Number(p.horasEnMano.toFixed(2)) : '—',
    p.gasoil > 0 ? Number(p.gasoil.toFixed(2)) : '—',
    p.parking > 0 ? Number(p.parking.toFixed(2)) : '—',
    p.totalPagar > 0 ? Number(p.totalPagar.toFixed(2)) : '—',
  ]
}

function payoutFromWorkerPeriod(w, eurosHoras) {
  return computeAdminPayout({
    eurosHoras,
    nomina: w.nomina_event_euros ?? 0,
    gasoil: w.gasoil_euros ?? 0,
    parking: w.parking_euros ?? 0,
  })
}

function payoutFromWorkerDay(w, eurosDay) {
  const brutoHoras = Number(eurosDay ?? 0)
  return {
    brutoHoras,
    nomina: w.nomina_event_euros ?? 0,
    horasEnMano: brutoHoras,
    gasoil: w.gasoil_euros ?? 0,
    parking: w.parking_euros ?? 0,
    totalPagar: brutoHoras,
  }
}

function sumPayoutRows(rows) {
  return rows.reduce(
    (acc, p) => ({
      brutoHoras: acc.brutoHoras + p.brutoHoras,
      nomina: acc.nomina + p.nomina,
      horasEnMano: acc.horasEnMano + p.horasEnMano,
      gasoil: acc.gasoil + p.gasoil,
      parking: acc.parking + p.parking,
      totalPagar: acc.totalPagar + p.totalPagar,
    }),
    {
      brutoHoras: 0,
      nomina: 0,
      horasEnMano: 0,
      gasoil: 0,
      parking: 0,
      totalPagar: 0,
    },
  )
}

export async function downloadDailyShiftsReportXlsx(opts) {
  const {
    reportDateIso,
    title = 'Informe diario de turnos',
    rows = [],
  } = opts ?? {}
  const XLSX = await loadXlsx()
  const dayLabel = fmtDayLabel(reportDateIso, weekdayShort, fmtDateEs)
  const header = ['Nombre', 'Correo', 'Turnos del día', 'Total horas', ...PAY_TAIL_HEADERS]
  const payouts = rows.map((r) => r.payout)
  const body = rows.map((r) => [
    r.nombre ?? '',
    r.correo ?? '',
    r.shiftsText ?? '—',
    r.hours > 0 ? formatHoursMinutes(r.hours) : '—',
    ...payoutCells(r.payout),
  ])
  const totalH = rows.reduce((s, r) => s + (r.hours || 0), 0)
  const totalPay = sumPayoutRows(payouts)
  const aoa = [
    [title],
    [`Día: ${dayLabel} (${reportDateIso})`],
    ['En el informe semanal se resta nómina y se suman gasoil/parking del periodo.'],
    [],
    header,
    ...body,
    [],
    ['TOTAL', '', '', formatHoursMinutes(totalH), ...payoutCells(totalPay)],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 24 },
    { wch: 28 },
    { wch: 48 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Día')
  XLSX.writeFile(wb, `informe-turnos-${reportDateIso}-${stampYmd()}.xlsx`)
}

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
    const payout = payoutFromWorkerDay(w, euros)
    return {
      nombre: w.nombre,
      correo: w.correo || w.punchLookupEmail || '',
      shiftsText: formatShiftsReportLines(shifts),
      hours,
      euros,
      payout,
      hasActivity: shifts.length > 0 || hours > 0,
    }
  })
}

export function buildWorkerWeekCells(worker, punchByEmail, dayIsos, fns) {
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
  const payout = payoutFromWorkerPeriod(worker, totalE)
  return { byDay, totalH, totalE, payout }
}

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
  const weekPayouts = []
  const aoaResumen = [
    [title],
    [`Periodo: ${rangeLabel}`],
    ['Total a pagar = bruto horas − nómina + gasoil + parking (planilla).'],
    [],
    [
      'Nombre',
      'Correo',
      ...dayIsos.flatMap((iso) => [
        `${fmtDayShortHeader(iso, weekdayShort)} h`,
        `${fmtDayShortHeader(iso, weekdayShort)} €`,
      ]),
      'Total horas',
      ...PAY_TAIL_HEADERS,
    ],
  ]

  for (const w of workers) {
    const { byDay, totalH, payout } = buildWorkerWeekCells(
      w,
      punchByEmail,
      dayIsos,
      fns,
    )
    grandH += totalH
    weekPayouts.push(payout)
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
      ...payoutCells(payout),
    ])
  }

  const grandPay = sumPayoutRows(weekPayouts)

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
    ...payoutCells(grandPay),
  ])

  const wsResumen = XLSX.utils.aoa_to_sheet(aoaResumen)
  wsResumen['!cols'] = [
    { wch: 22 },
    { wch: 26 },
    ...dayIsos.flatMap(() => [{ wch: 10 }, { wch: 10 }]),
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen semana')

  const aoaDetalle = [[title], [`Periodo: ${rangeLabel}`], []]

  for (const iso of dayIsos) {
    const dayLabel = fmtDayLabel(iso, weekdayShort, fmtDateEs)
    let dayH = 0
    aoaDetalle.push([`—— ${dayLabel} (${iso}) ——`])
    aoaDetalle.push(['Nombre', 'Correo', 'Turnos', 'Horas', ...PAY_TAIL_HEADERS])
    const dayRows = buildDailyReportRows(workers, punchByEmail, iso, fns)
    const dayPayouts = []
    for (const r of dayRows) {
      dayH += r.hours
      dayPayouts.push(r.payout)
      aoaDetalle.push([
        r.nombre,
        r.correo,
        r.shiftsText,
        r.hours > 0 ? formatHoursMinutes(r.hours) : '—',
        ...payoutCells(r.payout),
      ])
    }
    aoaDetalle.push([
      'Subtotal día',
      '',
      '',
      dayH > 0 ? formatHoursMinutes(dayH) : '—',
      ...payoutCells(sumPayoutRows(dayPayouts)),
    ])
    aoaDetalle.push([])
  }

  aoaDetalle.push([
    'TOTAL SEMANA (personal)',
    '',
    '',
    formatHoursMinutes(grandH),
    ...payoutCells(grandPay),
  ])

  const wsDetalle = XLSX.utils.aoa_to_sheet(aoaDetalle)
  wsDetalle['!cols'] = [
    { wch: 22 },
    { wch: 26 },
    { wch: 44 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Por día')

  const from = dayIsos[0] ?? stampYmd()
  const to = dayIsos[dayIsos.length - 1] ?? from
  XLSX.writeFile(wb, `informe-semana-${from}_${to}-${stampYmd()}.xlsx`)
}
