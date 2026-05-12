import { ROCIO_PLANILLA_DAY_KEYS } from './rocioPlanillaKeys.js'

/** CSV separado por coma o punto y coma. Opcional primera fila: correo,fecha,entrada,salida,cruza */
export function parseScheduleCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rows = []
  let start = 0
  const headerCells = lines[0]?.split(/[,;]/).map((s) => s.trim().toLowerCase())
  if (
    headerCells?.length &&
    (headerCells[0] === 'correo' ||
      headerCells[0] === 'email' ||
      headerCells[0] === 'mail')
  ) {
    start = 1
  }
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,;]/).map((s) => s.trim())
    if (parts.length < 4) continue
    const [email, fecha, entrada, salida, cruzaRaw] = parts
    rows.push({
      email: email.trim().toLowerCase(),
      work_date: fecha.trim(),
      start_time: normalizeTime(entrada.trim()),
      end_time: normalizeTime(salida.trim()),
      crosses_midnight: parseBool(cruzaRaw),
    })
  }
  return rows
}

function parseBool(raw) {
  if (raw == null || raw === '') return false
  const s = String(raw).trim().toLowerCase()
  return ['1', 'true', 's', 'si', 'sí', 'y', 'yes'].includes(s)
}

/** "12:00" o "12:00:00" → "HH:MM" para inputs/time */
export function normalizeTime(t) {
  if (!t) return ''
  const u = String(t).trim().toUpperCase()
  if (u === 'D' || u === 'DESCANSO' || u === 'LIBRE') return ''
  const m = String(t).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return String(t).trim()
  const hh = String(Number(m[1])).padStart(2, '0')
  const mm = m[2]
  return `${hh}:${mm}`
}

export function isRestCell(raw) {
  if (raw == null) return true
  const u = String(raw).trim().toUpperCase()
  return u === '' || u === 'D' || u === 'DESCANSO' || u === 'LIBRE' || u === 'X'
}

/** Plantilla: nombre,correo */
export function parseRosterCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rows = []
  let start = 0
  const h = lines[0]?.split(/[,;]/).map((s) => s.trim().toLowerCase())
  if (
    h?.length >= 2 &&
    (h[0] === 'nombre' || h[0] === 'name') &&
    (h[1] === 'correo' || h[1] === 'email' || h[1] === 'mail')
  ) {
    start = 1
  }
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,;]/).map((s) => s.trim())
    if (parts.length < 1) continue
    const name = parts[0]
    const mail = (parts[1] ?? '').trim().toLowerCase()
    if (!name) continue
    rows.push({
      full_name: name,
      email: mail || null,
    })
  }
  return rows
}

function parseBoolDesc(raw) {
  if (raw == null || raw === '') return false
  const s = String(raw).trim().toUpperCase()
  return ['D', 'DESCANSO', 'SI', 'SÍ', 'S', '1', 'TRUE', 'Y', 'YES'].includes(s)
}

function looksIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '').trim())
}

/** Posible columna "salida": vacía, hora o descanso */
function looksLikeSalidaCol(s) {
  const t = String(s ?? '').trim()
  if (t === '') return true
  if (isRestCell(t)) return true
  return /^\d{1,2}:\d{2}/.test(t)
}

function looksLikeCruzaToken(s) {
  const t = String(s ?? '').trim().toLowerCase()
  return ['no', 'si', 'sí', 's', 'n', '0', '1', 'true', 'false'].includes(t)
}

/**
 * Turnos partidos (mismo día: turno 1 y turno 2).
 *
 * Formato completo (con salida opcional vacía):
 *   nombre,correo,fecha,turno,entrada,salida,cruza,descanso
 *
 * Sin columna salida (solo entradas / típico Excel sin salida):
 *   nombre,correo,fecha,turno,entrada,cruza,descanso
 *
 * Sin correo, con salida:
 *   nombre,fecha,turno,entrada,salida,cruza
 *
 * Sin correo ni salida (entrada + cruza + descanso):
 *   nombre,fecha,turno,entrada,cruza,descanso
 */
export function parseLongSlotsCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return []
  let start = 0
  const h = lines[0].split(/[,;]/).map((s) => s.trim().toLowerCase())
  const looksHeader =
    h.includes('fecha') ||
    h.includes('date') ||
    h.includes('turno') ||
    h.includes('nombre')
  if (looksHeader) start = 1

  const rows = []
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,;]/).map((s) => s.trim())
    let nombre,
      correo,
      fecha,
      turnoRaw,
      entrada,
      salida,
      cruzaRaw,
      descRaw

    if (parts.length >= 8) {
      ;[nombre, correo, fecha, turnoRaw, entrada, salida, cruzaRaw, descRaw] =
        parts
    } else if (parts.length === 7) {
      const dateIdx = parts.findIndex((p) => looksIsoDate(p))
      if (dateIdx === 1) {
        ;[nombre, fecha, turnoRaw, entrada, salida, cruzaRaw, descRaw] = parts
        correo = ''
      } else if (dateIdx === 2) {
        ;[nombre, correo, fecha, turnoRaw, entrada, cruzaRaw, descRaw] = parts
        salida = ''
      } else {
        continue
      }
    } else if (parts.length === 6) {
      ;[nombre, fecha, turnoRaw, entrada, a, b] = parts
      correo = ''
      if (looksLikeSalidaCol(a)) {
        salida = a
        cruzaRaw = b
        descRaw = ''
      } else if (looksLikeCruzaToken(a)) {
        salida = ''
        cruzaRaw = a
        descRaw = b
      } else {
        salida = a
        cruzaRaw = b
        descRaw = ''
      }
    } else if (parts.length === 5) {
      ;[nombre, fecha, turnoRaw, entrada, cruzaRaw] = parts
      correo = ''
      salida = ''
      descRaw = ''
    } else {
      continue
    }

    const slot = Number.parseInt(String(turnoRaw), 10)
    const slot_index = Number.isFinite(slot) && slot === 2 ? 2 : 1
    const descanso =
      isRestCell(entrada) ||
      parseBoolDesc(descRaw)
    rows.push({
      full_name: nombre.trim(),
      email: (correo ?? '').trim().toLowerCase() || null,
      work_date: fecha.trim(),
      slot_index,
      start_time: descanso ? null : normalizeTime(entrada),
      end_time: descanso ? null : normalizeTime(salida),
      crosses_midnight: parseBool(cruzaRaw),
      is_rest: descanso,
    })
  }
  return rows
}

function parseCsvLineWithSep(line, sep) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === sep) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function splitCsvRow(line) {
  const semi = (line.match(/;/g) || []).length
  const comma = (line.match(/,/g) || []).length
  const sep = semi > comma ? ';' : ','
  return parseCsvLineWithSep(line, sep)
}

function normHeaderCell(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

function looksLikeWideHeaderRow(parts) {
  if (parts.length < 23) return false
  const joined = parts.join(' ').toLowerCase()
  if (joined.includes('@')) return false
  const f = normHeaderCell(parts[0])
  return f === 'nombre' || f === 'name'
}

/**
 * Planilla ancha: nombre + 22 celdas (d01_a…d11_b) + correo, o cabecera con esas columnas.
 * Opcional en cabecera: nomina_event_euros / nomina, gasoil_euros / gasoil, parking_euros / parking.
 * @returns {Array<Record<string, string>>}
 */
export function parsePlanillaWideCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return []

  const header = splitCsvRow(lines[0]).map(normHeaderCell)
  const hasDayHeaders = header.some((h) => /^d\d{2}_[ab]$/.test(h))

  const rows = []

  if (hasDayHeaders) {
    const idxNombre = header.findIndex((h) => h === 'nombre' || h === 'name')
    const idxCorreo = header.findIndex(
      (h) => h === 'correo' || h === 'email' || h === 'mail',
    )
    const idxNomina = header.findIndex((h) =>
      ['nomina_event_euros', 'nomina', 'nomina_evento'].includes(h),
    )
    const idxGasoil = header.findIndex((h) =>
      ['gasoil_euros', 'gasoil', 'gas_oil'].includes(h),
    )
    const idxParking = header.findIndex((h) =>
      ['parking_euros', 'parking', 'aparcamiento'].includes(h),
    )

    const dayIdx = Object.fromEntries(
      ROCIO_PLANILLA_DAY_KEYS.map((k) => [k, header.indexOf(k)]).filter(([, ix]) => ix >= 0),
    )

    for (let li = 1; li < lines.length; li++) {
      const cells = splitCsvRow(lines[li])
      const nombre = (
        idxNombre >= 0 ? cells[idxNombre] : cells[0] ?? ''
      ).trim()
      if (!nombre) continue
      const correo = String(
        idxCorreo >= 0 ? cells[idxCorreo] ?? '' : '',
      )
        .trim()
        .toLowerCase()
      const rec = {
        nombre,
        correo,
        nomina_event_euros: idxNomina >= 0 ? String(cells[idxNomina] ?? '').trim() : '',
        gasoil_euros: idxGasoil >= 0 ? String(cells[idxGasoil] ?? '').trim() : '',
        parking_euros: idxParking >= 0 ? String(cells[idxParking] ?? '').trim() : '',
      }
      for (const k of ROCIO_PLANILLA_DAY_KEYS) {
        const ix = dayIdx[k]
        rec[k] = ix >= 0 ? String(cells[ix] ?? '').trim() : ''
      }
      rows.push(rec)
    }
  } else {
    let dataStart = 0
    if (looksLikeWideHeaderRow(splitCsvRow(lines[0]))) dataStart = 1

    for (let li = dataStart; li < lines.length; li++) {
      const parts = splitCsvRow(lines[li])
      if (parts.length < 23) continue
      const nombre = parts[0].trim()
      if (!nombre) continue
      const correo = String(parts[parts.length - 1] ?? '')
        .trim()
        .toLowerCase()
      const mid = parts.slice(1, -1)
      while (mid.length < ROCIO_PLANILLA_DAY_KEYS.length) mid.push('')
      const rec = {
        nombre,
        correo,
        nomina_event_euros: '',
        gasoil_euros: '',
        parking_euros: '',
      }
      for (let i = 0; i < ROCIO_PLANILLA_DAY_KEYS.length; i++) {
        rec[ROCIO_PLANILLA_DAY_KEYS[i]] = String(mid[i] ?? '').trim()
      }
      rows.push(rec)
    }
  }

  return rows
}
