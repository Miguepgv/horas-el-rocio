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

function emptyShift() {
  return { inH: '', inM: 0, outH: '', outM: 0 }
}

export function shiftTimesFromPunches(punches, dayIso) {
  const shifts = paidShiftsByStartDay(punches ?? [], dayIso)
  const closed = shifts.find((s) => !s.open && s.inAt && s.outAt)
  if (!closed) return emptyShift()
  const inAt = closed.inAt
  const outAt = closed.outAt
  return {
    inH: inAt.getHours(),
    inM: snapMinute(inAt.getMinutes()),
    outH: outAt.getHours(),
    outM: snapMinute(outAt.getMinutes()),
  }
}

export function shiftIsComplete(t) {
  return t && t.inH !== '' && t.inH != null && t.outH !== '' && t.outH != null
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

/**
 * Sustituye el día por un turno entrada/salida.
 * Si falta entrada o salida, borra el día.
 * Si la salida es ≤ la entrada, se cobra al día siguiente (cruza medianoche).
 */
export async function replaceManualShiftForDay(supabase, userId, dayIso, times) {
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

  if (!shiftIsComplete(times)) return { ok: true, cleared: true }

  const inAt = atLocal(dayIso, times.inH, times.inM)
  let outAt = atLocal(dayIso, times.outH, times.outM)
  if (outAt.getTime() <= inAt.getTime()) {
    outAt = new Date(outAt)
    outAt.setDate(outAt.getDate() + 1)
  }

  const { error: insErr } = await supabase.from('punches').insert([
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
  ])
  if (insErr) return { ok: false, error: insErr }
  return { ok: true, hours: (outAt - inAt) / 3_600_000 }
}
