import { PAY_EVENT_EL_ROCIO } from '../data/payRules.js'
import { collectPunchEmails } from './fichajesWorkerList.js'
import { parseLocalDate } from './payCompute.js'
import { deterministicUserIdFromEmail } from './insecureLogin.js'

function normEmail(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

/** Ventana de fechas para traer fichajes (feria ± márgenes y hasta hoy si hace falta). */
export function punchFetchWindowIso() {
  const d0 = parseLocalDate(PAY_EVENT_EL_ROCIO.dateFrom)
  d0.setDate(d0.getDate() - 5)
  d0.setHours(0, 0, 0, 0)
  const d1 = parseLocalDate(PAY_EVENT_EL_ROCIO.dateTo)
  d1.setDate(d1.getDate() + 10)
  d1.setHours(23, 59, 59, 999)
  const now = new Date()
  if (d1 < now) d1.setTime(now.getTime())
  return { start: d0.toISOString(), end: d1.toISOString() }
}

/**
 * user_id con el que se guardan fichajes para un correo: cuenta real si existe, si no UUID interno.
 * @param {string} email
 * @param {Array<{ email?: string|null, auth_user_id?: string|null }>} eventWorkers
 */
export async function resolvePrimaryPunchUserId(email, eventWorkers) {
  const em = normEmail(email)
  if (!em) return null
  const w = (eventWorkers ?? []).find(
    (x) => normEmail(x.email) === em && x.auth_user_id,
  )
  if (w?.auth_user_id) return w.auth_user_id
  return deterministicUserIdFromEmail(em)
}

/**
 * Fichajes agrupados por correo de planilla (incluye id sintético y auth_user_id de plantilla).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<{ correo?: string|null }>} planillaRows
 * @param {Array<{ email?: string|null, auth_user_id?: string|null }>} eventWorkers
 * @param {Array<{ email?: string|null, auth_user_id?: string|null }>} loginRecords
 */
export async function fetchPunchesGroupedByPlanillaEmail(
  supabase,
  planillaRows,
  eventWorkers,
  loginRecords = [],
) {
  const emails = collectPunchEmails(planillaRows, eventWorkers, loginRecords)
  /** @type {Record<string, Array<{ id: string, user_id: string, punch_type: string, punched_at: string, no_pay: boolean }>>} */
  const byEmail = Object.fromEntries(emails.map((e) => [e, []]))
  if (!emails.length || !supabase) return byEmail

  const uidToEmail = new Map()
  const pairs = await Promise.all(
    emails.map(async (em) => [em, await deterministicUserIdFromEmail(em)]),
  )
  for (const [em, id] of pairs) uidToEmail.set(id, em)

  for (const w of eventWorkers ?? []) {
    const em = normEmail(w.email)
    if (!em || !w.auth_user_id || !emails.includes(em)) continue
    uidToEmail.set(w.auth_user_id, em)
  }

  for (const rec of loginRecords ?? []) {
    const em = normEmail(rec.email)
    if (!em || !rec.auth_user_id || !emails.includes(em)) continue
    uidToEmail.set(rec.auth_user_id, em)
  }

  const ids = [...uidToEmail.keys()]
  if (!ids.length) return byEmail

  const { start, end } = punchFetchWindowIso()
  const { data, error } = await supabase
    .from('punches')
    .select('id,user_id,punch_type,punched_at,no_pay')
    .in('user_id', ids)
    .gte('punched_at', start)
    .lte('punched_at', end)
    .order('punched_at', { ascending: true })
    .limit(2500)

  if (error) throw error
  for (const p of data ?? []) {
    const em = uidToEmail.get(p.user_id)
    if (em) byEmail[em].push(p)
  }
  return byEmail
}

export function formatPunchLineEs(p) {
  const d = new Date(p.punched_at)
  const day = d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })
  const hm = d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const tag = p.punch_type === 'in' ? 'E' : 'S'
  const np = p.no_pay ? ' (sin cobro)' : ''
  return `${tag} ${day} ${hm}${np}`
}

export function punchesSummaryShort(list, maxParts = 5) {
  if (!list?.length) return 'Sin fichajes'
  const sorted = [...list].sort(
    (a, b) => new Date(a.punched_at) - new Date(b.punched_at),
  )
  const tail = sorted.slice(-maxParts)
  return tail.map((p) => formatPunchLineEs(p)).join(' · ')
}

export function toDatetimeLocalValue(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** @param {string} s valor de <input type="datetime-local" /> */
export function fromDatetimeLocalValue(s) {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}
