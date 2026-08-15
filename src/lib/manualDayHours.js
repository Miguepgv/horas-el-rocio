import { parseLocalDate, paidShiftStartDayIso, paidShiftsByStartDay } from './payCompute.js'

export const CLOCK_HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i)
export const CLOCK_MINUTE_OPTIONS = [0, 15, 30, 45]

export function planillaPunchKey(planillaId) {
  const id = String(planillaId ?? '').trim()
  return id ? `planilla:${id}` : null
}

function snapMinute(m) {
  const n = Number(m) || 0
  return CLOCK_MINUTE_OPTIONS.reduce((best, x) =>
    Math.abs(x - n) < Math.abs(best - n) ? x : best,
  )
}

export function emptyShift() {
  return { inH: '', inM: 0, outH: '', outM: 0 }
}

export function shiftIsEmpty(t) {
  return (
    t == null ||
    ((t.inH === '' || t.inH == null) && (t.outH === '' || t.outH == null))
  )
}

export function shiftIsComplete(t) {
  return t && t.inH !== '' && t.inH != null && t.outH !== '' && t.outH != null
}

export function shiftIsPartial(t) {
  return !shiftIsEmpty(t) && !shiftIsComplete(t)
}

/** Horas de un par entrada/salida (salida ≤ entrada → +1 día). */
export function hoursFromShiftTimes(t) {
  if (!shiftIsComplete(t)) return 0
  const inMin = Number(t.inH) * 60 + Number(t.inM || 0)
  let outMin = Number(t.outH) * 60 + Number(t.outM || 0)
  if (outMin <= inMin) outMin += 24 * 60
  return (outMin - inMin) / 60
}

export function totalHoursFromShiftTimesList(list) {
  return (list ?? []).reduce((s, t) => s + hoursFromShiftTimes(t), 0)
}

/** @deprecated Preferir shiftTimesListFromPunches (turnos partidos). */
export function shiftTimesFromPunches(punches, dayIso) {
  const list = shiftTimesListFromPunches(punches, dayIso)
  return list[0] ?? emptyShift()
}

/** Todos los turnos cerrados (y abiertos) del día, para turnos partidos. */
export function shiftTimesListFromPunches(punches, dayIso) {
  const shifts = paidShiftsByStartDay(punches ?? [], dayIso)
  if (!shifts.length) return [emptyShift()]
  return shifts.map((s) => {
    if (!s.inAt) return emptyShift()
    const row = {
      inH: s.inAt.getHours(),
      inM: snapMinute(s.inAt.getMinutes()),
      outH: '',
      outM: 0,
    }
    if (s.outAt && !s.open) {
      row.outH = s.outAt.getHours()
      row.outM = snapMinute(s.outAt.getMinutes())
    }
    return row
  })
}

export function formatClock(h, m) {
  if (h === '' || h == null) return '—'
  return `${String(h).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`
}

function atLocal(dayIso, hour, minute) {
  const d = parseLocalDate(dayIso)
  d.setHours(Number(hour) || 0, Number(minute) || 0, 0, 0)
  return d
}

function punchIdsStartingOnDay(list, dayIso) {
  const paid = (list ?? [])
    .filter((p) => !p.no_pay)
    .slice()
    .sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at))
  const ids = []
  let open = null
  for (const p of paid) {
    if (p.punch_type === 'in') {
      if (open && paidShiftStartDayIso(new Date(open.punched_at)) === dayIso) {
        ids.push(open.id)
      }
      open = p
    } else if (p.punch_type === 'out' && open) {
      if (paidShiftStartDayIso(new Date(open.punched_at)) === dayIso) {
        ids.push(open.id, p.id)
      }
      open = null
    }
  }
  if (open && paidShiftStartDayIso(new Date(open.punched_at)) === dayIso) {
    ids.push(open.id)
  }
  return ids
}

function localDayRange(dayIso) {
  const start = parseLocalDate(dayIso)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function normalizeShiftList(timesList) {
  const list = Array.isArray(timesList) ? timesList : timesList ? [timesList] : []
  return list.filter((t) => !shiftIsEmpty(t))
}

/**
 * Sustituye el día por uno o varios turnos entrada/salida (turno partido).
 * Solo guarda turnos completos. Lista vacía o todos incompletos → borra el día.
 * Si la salida es ≤ la entrada, se cobra al día siguiente (cruza medianoche).
 */
export async function replaceManualShiftsForDay(supabase, userId, dayIso, timesList) {
  if (!supabase || !userId || !dayIso) {
    return { ok: false, error: 'Falta trabajador o día.' }
  }
  const { start, end } = localDayRange(dayIso)
  const { data: existing, error: loadErr } = await supabase
    .from('punches')
    .select('id,punch_type,punched_at,no_pay')
    .eq('user_id', userId)
    .gte('punched_at', start.toISOString())
    .lt('punched_at', new Date(end.getTime() + 24 * 3_600_000).toISOString())

  if (loadErr) return { ok: false, error: loadErr }

  const ids = punchIdsStartingOnDay(existing, dayIso)

  if (ids.length) {
    const { error: delErr } = await supabase.from('punches').delete().in('id', ids)
    if (delErr) return { ok: false, error: delErr }
  }

  const complete = normalizeShiftList(timesList).filter(shiftIsComplete)
  if (!complete.length) return { ok: true, cleared: true }

  const rows = []
  let totalHours = 0
  for (const times of complete) {
    const inAt = atLocal(dayIso, times.inH, times.inM)
    let outAt = atLocal(dayIso, times.outH, times.outM)
    if (outAt.getTime() <= inAt.getTime()) {
      outAt = new Date(outAt)
      outAt.setDate(outAt.getDate() + 1)
    }
    totalHours += (outAt - inAt) / 3_600_000
    rows.push(
      {
        user_id: userId,
        punch_type: 'in',
        punched_at: inAt.toISOString(),
        created_by: null,
        no_pay: false,
      },
      {
        user_id: userId,
        punch_type: 'out',
        punched_at: outAt.toISOString(),
        created_by: null,
        no_pay: false,
      },
    )
  }

  const { error: insErr } = await supabase.from('punches').insert(rows)
  if (insErr) return { ok: false, error: insErr }
  return { ok: true, hours: totalHours, shiftCount: complete.length }
}

/** @deprecated Usar replaceManualShiftsForDay */
export async function replaceManualShiftForDay(supabase, userId, dayIso, times) {
  return replaceManualShiftsForDay(supabase, userId, dayIso, [times])
}
