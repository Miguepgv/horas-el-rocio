import {
  ROCIO_PLANILLA_DAY_KEYS as DAY_KEYS,
  ROCIO_PLANILLA_EXTRA_KEYS_UI as EXTRA_KEYS_UI,
} from './rocioPlanillaKeys.js'
import { slotIndexForPlanillaDayKey } from './feriaDayView.js'
import { planillaColumnHeader } from './planillaDayHeaders.js'

const EURO_LABELS = {
  nomina_event_euros: 'Nómina €',
  gasoil_euros: 'Gasoil €',
  parking_euros: 'Parking €',
}

function stampYmd() {
  return new Date().toISOString().slice(0, 10)
}

function sanitizeFilenamePart(s) {
  const t = String(s ?? '')
    .trim()
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
  return t.slice(0, 50) || 'horario'
}

async function loadXlsx() {
  return import('xlsx')
}

/**
 * Planilla ancha tal como en administración (nombre, correo, €, celdas d01_a…d11_b).
 * @param {Array<Record<string, unknown>>} rows
 */
export async function downloadPlanillaHorarioXlsx(rows, opts = {}) {
  const XLSX = await loadXlsx()
  const dayKeys = opts.dayKeys?.length ? opts.dayKeys : DAY_KEYS
  const dayHeaders = dayKeys.map((k) =>
    planillaColumnHeader(slotIndexForPlanillaDayKey(k)),
  )
  const header = [
    'Nombre',
    'Correo',
    ...EXTRA_KEYS_UI.map((k) => EURO_LABELS[k] ?? k),
    ...dayHeaders,
  ]
  const body = (rows ?? []).map((r) => [
    String(r.nombre ?? '').trim(),
    String(r.correo ?? '').trim(),
    ...EXTRA_KEYS_UI.map((k) => {
      const v = r[k]
      if (v == null || v === '') return ''
      return String(v)
    }),
    ...dayKeys.map((k) => String(r[k] ?? '')),
  ])
  const aoa = [header, ...body]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = header.map((_, i) => {
    if (i === 0) return { wch: 22 }
    if (i === 1) return { wch: 30 }
    if (i >= 2 && i <= 4) return { wch: 11 }
    return { wch: 7 }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Planilla')
  XLSX.writeFile(wb, `planilla-horario-${stampYmd()}.xlsx`)
}

/**
 * Tabla «Mi horario» (día, previsto, fichado) para imprimir desde Excel.
 * @param {{ appTitle?: string, workerLine?: string, rows: Array<{ dia: string, previsto: string, fichado: string }> }} opts
 */
export async function downloadMiHorarioXlsx(opts) {
  const { appTitle = 'Mi horario', workerLine = '', rows = [] } = opts ?? {}
  const XLSX = await loadXlsx()
  const aoa = [
    [String(appTitle)],
    [String(workerLine)],
    [],
    ['Día', 'Previsto', 'Fichado'],
    ...rows.map((r) => [r.dia ?? '', r.previsto ?? '', r.fichado ?? '']),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 28 }, { wch: 44 }, { wch: 50 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Horario')
  const part = sanitizeFilenamePart(workerLine.split('·')[0])
  XLSX.writeFile(wb, `mi-horario-${part}-${stampYmd()}.xlsx`)
}
