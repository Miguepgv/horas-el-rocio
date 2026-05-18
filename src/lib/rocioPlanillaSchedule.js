/** Primer día de la rejilla planilla (d01 = este día). Debe coincidir con las columnas d01_a…d11_b. */
export const ROCIO_PLANILLA_GRID_FIRST_DAY = '2026-05-16'

export const ROCIO_PLANILLA_GRID_DAY_COUNT = 11

/** Fechas ISO de cada columna día (d01…d11), alineadas con `planillaRowToSlots`. */
export function eachPlanillaGridDateISO(
  firstDayIso = ROCIO_PLANILLA_GRID_FIRST_DAY,
  dayCount = ROCIO_PLANILLA_GRID_DAY_COUNT,
) {
  const out = []
  for (let p = 0; p < dayCount; p++) {
    out.push(addDays(firstDayIso, p))
  }
  return out
}

export function planillaGridDateForDayIndex(dayIndex) {
  return eachPlanillaGridDateISO()[dayIndex] ?? null
}

function sanitizeRaw(s) {
  return String(s ?? '')
    .replace(/^"|"$/g, '')
    .replace(/,/g, '')
    .trim()
}

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

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T12:00:00`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function hhmmToPg(t) {
  if (!t) return null
  if (t.length === 5 && t.includes(':')) return `${t}:00`
  return t
}

function syntheticId(fecha, slotIndex) {
  return `planilla-${fecha}-${slotIndex}`
}

/** Una celda → 0..n filas tipo slot (turno = slot_index 1 o 2). */
function pushSlotsFromCell(slots, fecha, slotIndex, raw, workerId) {
  const r = sanitizeRaw(raw)
  if (!r || isRestToken(r)) {
    slots.push({
      id: syntheticId(fecha, slotIndex),
      worker_id: workerId,
      work_date: fecha,
      slot_index: slotIndex,
      start_time: null,
      end_time: null,
      crosses_midnight: false,
      is_rest: true,
      _source: 'planilla',
    })
    return
  }
  const range = parseMaybeRange(r)
  if (range) {
    slots.push({
      id: syntheticId(fecha, slotIndex),
      worker_id: workerId,
      work_date: fecha,
      slot_index: slotIndex,
      start_time: hhmmToPg(range.start),
      end_time: hhmmToPg(range.end),
      crosses_midnight: range.crosses_midnight,
      is_rest: false,
      _source: 'planilla',
    })
    return
  }
  const t = normalizeClock(r)
  if (t) {
    slots.push({
      id: syntheticId(fecha, slotIndex),
      worker_id: workerId,
      work_date: fecha,
      slot_index: slotIndex,
      start_time: hhmmToPg(t),
      end_time: null,
      crosses_midnight: false,
      is_rest: false,
      _source: 'planilla',
    })
  }
}

/**
 * Par día (dos celdas dXX_a / dXX_b): misma lógica que el script Node `processPair`.
 */
function processDayPair(slots, fecha, a, b, workerId) {
  const aRest = isRestToken(a)
  const bRest = isRestToken(b)
  const aHasRange = parseMaybeRange(sanitizeRaw(a))
  const bHasRange = parseMaybeRange(sanitizeRaw(b))
  const aTime = !aRest && !aHasRange ? normalizeClock(a) : null
  const bTime = !bRest && !bHasRange ? normalizeClock(b) : null

  if (aRest && bRest) {
    pushSlotsFromCell(slots, fecha, 1, 'D', workerId)
    pushSlotsFromCell(slots, fecha, 2, 'D', workerId)
    return
  }

  if (aHasRange) {
    pushSlotsFromCell(slots, fecha, 1, sanitizeRaw(a), workerId)
    if (!bRest && bTime) {
      pushSlotsFromCell(slots, fecha, 2, sanitizeRaw(b), workerId)
    } else if (!bRest && parseMaybeRange(sanitizeRaw(b))) {
      pushSlotsFromCell(slots, fecha, 2, sanitizeRaw(b), workerId)
    }
    return
  }

  if (aTime && bTime) {
    pushSlotsFromCell(slots, fecha, 1, sanitizeRaw(a), workerId)
    pushSlotsFromCell(slots, fecha, 2, sanitizeRaw(b), workerId)
    return
  }

  if (aTime && !bTime) {
    pushSlotsFromCell(slots, fecha, 1, sanitizeRaw(a), workerId)
    return
  }

  if (!aTime && bTime) {
    pushSlotsFromCell(slots, fecha, 2, sanitizeRaw(b), workerId)
  }

  if (!aTime && !bTime && parseMaybeRange(sanitizeRaw(b))) {
    pushSlotsFromCell(slots, fecha, 2, sanitizeRaw(b), workerId)
  }
}

export function planillaRowToSlots(
  row,
  workerId,
  firstDayIso = ROCIO_PLANILLA_GRID_FIRST_DAY,
) {
  const slots = []
  for (let p = 0; p < 11; p++) {
    const idx = String(p + 1).padStart(2, '0')
    const a = row[`d${idx}_a`]
    const b = row[`d${idx}_b`]
    const fecha = addDays(firstDayIso, p)
    processDayPair(slots, fecha, a, b, workerId)
  }
  return slots
}
