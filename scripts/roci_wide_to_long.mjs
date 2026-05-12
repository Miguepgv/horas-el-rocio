#!/usr/bin/env node
/**
 * Convierte la plantilla ancha tipo "ROCIO 2026 - Hoja 3.csv"
 * (nombre + 2 columnas por día + correo) al CSV largo para Admin → Importar franjas.
 *
 * Uso:
 *   node scripts/roci_wide_to_long.mjs "C:\\Users\\…\\ROCIO 2026 - Hoja 3.csv"
 *   node scripts/roci_wide_to_long.mjs ./mi-hoja.csv --first-date=2026-05-16
 *
 * Por defecto la primera pareja de columnas = --first-date (sábado 16 may 2026
 * para calzar con el grid que empieza en SÁBADO dentro del evento 15–26).
 */

import { readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  let inputPath = null
  let firstDate = '2026-05-16'
  let outPath = null
  for (const a of argv) {
    if (a.startsWith('--first-date=')) {
      firstDate = a.slice('--first-date='.length).trim()
    } else if (a.startsWith('--out=')) {
      outPath = a.slice('--out='.length).trim()
    } else if (!a.startsWith('-')) {
      inputPath = a
    }
  }
  return { inputPath, firstDate, outPath }
}

/** Separador de campos CSV respetando comillas */
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === ',') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T12:00:00')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Limpia cosas como "20,:30", puntos decimales tipo 8.30 */
function sanitizeRaw(s) {
  return String(s ?? '')
    .replace(/^"|"$/g, '')
    .replace(/,/g, '')
    .trim()
}

/** Devuelve HH:MM o null si vacío / no parseable */
function normalizeClock(raw) {
  const s = sanitizeRaw(raw)
  if (!s) return null
  const u = s.toUpperCase()
  if (u === 'D' || u === 'DESCANSO' || u === 'LIBRE' || u === 'X') return null
  let t = s.replace(/\./g, ':')
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (m) {
    const hh = String(Number(m[1])).padStart(2, '0')
    return `${hh}:${m[2]}`
  }
  const hourOnly = t.match(/^(\d{1,2})$/)
  if (hourOnly) {
    const hh = String(Number(hourOnly[1])).padStart(2, '0')
    return `${hh}:00`
  }
  return null
}

/** Texto tipo "12.00 A 0:00" o "8:00:00 A 20:00" */
function parseMaybeRange(raw) {
  const s = sanitizeRaw(raw)
  if (!s || /^D$/i.test(s)) return null
  const rangeMatch = s.match(/^(.+?)\s+A\s+(.+)$/i)
  if (!rangeMatch) return null
  const a = normalizeClock(rangeMatch[1])
  const b = normalizeClock(rangeMatch[2])
  if (!a || !b) return null
  let crosses = false
  const [ha, ma] = a.split(':').map(Number)
  const [hb, mb] = b.split(':').map(Number)
  const ta = ha * 60 + ma
  const tb = hb * 60 + mb
  if (tb <= ta && !(hb === 0 && mb === 0)) crosses = true
  if (hb === 0 && mb === 0) crosses = true
  return { start: a, end: b, crosses_midnight: crosses }
}

function isRestToken(raw) {
  const s = sanitizeRaw(raw).toUpperCase()
  return s === '' || s === 'D' || s === 'DESCANSO' || s === 'LIBRE' || s === 'X'
}

function escapeCsv(val) {
  if (val == null) return ''
  const s = String(val)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function cellToRows({ name, email, fecha, turno, raw }) {
  const rows = []
  const r = sanitizeRaw(raw)

  if (!r || isRestToken(r)) {
    rows.push({
      nombre: name,
      correo: email,
      fecha,
      turno,
      entrada: 'D',
      salida: '',
      cruza: 'false',
      descanso: 'true',
    })
    return rows
  }

  const range = parseMaybeRange(r)
  if (range) {
    rows.push({
      nombre: name,
      correo: email,
      fecha,
      turno,
      entrada: range.start,
      salida: range.end,
      cruza: String(range.crosses_midnight),
      descanso: 'false',
    })
    return rows
  }

  const t = normalizeClock(r)
  if (t) {
    rows.push({
      nombre: name,
      correo: email,
      fecha,
      turno,
      entrada: t,
      salida: '',
      cruza: 'false',
      descanso: 'false',
    })
    return rows
  }

  return rows
}

function main() {
  const argv = process.argv.slice(2)
  const { inputPath, firstDate, outPath } = parseArgs(argv)

  if (!inputPath) {
    console.error(
      'Uso: node scripts/roci_wide_to_long.mjs <ruta-al.csv> [--first-date=2026-05-16] [--out=salida.csv]',
    )
    process.exit(1)
  }

  const abs = resolve(inputPath)
  const text = readFileSync(abs, 'utf8')
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)

  if (lines.length < 2) {
    console.error('CSV vacío o sin datos.')
    process.exit(1)
  }

  const header = parseCsvLine(lines[0])
  const numPairs = Math.floor((header.length - 2) / 2)

  const records = []
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li])
    const name = cols[0]?.trim()
    if (!name) continue

    const email = (cols[cols.length - 1] ?? '').trim().toLowerCase() || ''

    for (let p = 0; p < numPairs; p++) {
      const base = 1 + p * 2
      const a = cols[base] ?? ''
      const b = cols[base + 1] ?? ''
      const fecha = addDays(firstDate, p)

      const aRest = isRestToken(a)
      const bRest = isRestToken(b)
      const aHasRange = parseMaybeRange(sanitizeRaw(a))
      const bHasRange = parseMaybeRange(sanitizeRaw(b))
      const aTime = !aRest && !aHasRange ? normalizeClock(a) : null
      const bTime = !bRest && !bHasRange ? normalizeClock(b) : null

      if (aRest && bRest) {
        records.push(
          ...cellToRows({ name, email, fecha, turno: 1, raw: 'D' }),
          ...cellToRows({ name, email, fecha, turno: 2, raw: 'D' }),
        )
        continue
      }

      if (aHasRange) {
        records.push(
          ...cellToRows({ name, email, fecha, turno: 1, raw: sanitizeRaw(a) }),
        )
        if (!bRest && bTime) {
          records.push(
            ...cellToRows({ name, email, fecha, turno: 2, raw: sanitizeRaw(b) }),
          )
        } else if (!bRest && parseMaybeRange(sanitizeRaw(b))) {
          records.push(
            ...cellToRows({ name, email, fecha, turno: 2, raw: sanitizeRaw(b) }),
          )
        }
        continue
      }

      if (aTime && bTime) {
        records.push(
          ...cellToRows({ name, email, fecha, turno: 1, raw: sanitizeRaw(a) }),
          ...cellToRows({ name, email, fecha, turno: 2, raw: sanitizeRaw(b) }),
        )
        continue
      }

      if (aTime && !bTime) {
        records.push(
          ...cellToRows({ name, email, fecha, turno: 1, raw: sanitizeRaw(a) }),
        )
        continue
      }

      if (!aTime && bTime) {
        records.push(
          ...cellToRows({ name, email, fecha, turno: 2, raw: sanitizeRaw(b) }),
        )
      }

      if (!aTime && !bTime && parseMaybeRange(sanitizeRaw(b))) {
        records.push(
          ...cellToRows({ name, email, fecha, turno: 2, raw: sanitizeRaw(b) }),
        )
      }
    }
  }

  const headerOut =
    'nombre,correo,fecha,turno,entrada,salida,cruza,descanso'
  const body = records
    .map((r) =>
      [
        r.nombre,
        r.correo,
        r.fecha,
        r.turno,
        r.entrada,
        r.salida,
        r.cruza,
        r.descanso,
      ]
        .map(escapeCsv)
        .join(','),
    )
    .join('\n')

  const output = `${headerOut}\n${body}\n`

  const defaultOut = resolve(
    __dirname,
    '../rocio-franjas-import-ready.csv',
  )
  const target = outPath ? resolve(outPath) : defaultOut
  writeFileSync(target, output, 'utf8')

  console.log(
    `OK: ${records.length} filas → ${target}\nPégalo en Admin → Importar franjas (CSV).`,
  )
}

main()
