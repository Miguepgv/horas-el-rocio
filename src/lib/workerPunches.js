import { punchFetchWindowIso } from './adminPlanillaPunches.js'
import { isMissingTableError } from './dbErrors.js'
import { escapeForILikeExact } from './emailMatch.js'
import { deterministicUserIdFromEmail } from './insecureLogin.js'

function normEmail(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

/**
 * Todos los user_id bajo los que puede haber fichajes de este trabajador
 * (cuenta Supabase, login solo-correo, app_login_emails, event_workers).
 */
export async function collectWorkerPunchUserIds(supabase, session) {
  const ids = new Set()
  const uid = session?.user?.id
  const email = normEmail(session?.user?.email)
  if (uid) ids.add(uid)
  if (!email) return [...ids]

  const det = await deterministicUserIdFromEmail(email)
  if (det) ids.add(det)

  const pat = escapeForILikeExact(email)
  const [ew, log] = await Promise.all([
    supabase
      .from('event_workers')
      .select('auth_user_id')
      .ilike('email', pat)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('app_login_emails')
      .select('auth_user_id')
      .ilike('email', pat)
      .limit(1)
      .maybeSingle(),
  ])

  if (!ew.error && ew.data?.auth_user_id) ids.add(ew.data.auth_user_id)
  if (!log.error && log.data?.auth_user_id) ids.add(log.data.auth_user_id)
  else if (log.error && !isMissingTableError(log.error)) {
    console.warn('app_login_emails:', log.error?.message ?? log.error)
  }

  return [...ids]
}

/** Fichajes del trabajador (todos los user_id enlazados al correo). */
export async function fetchWorkerPunchesForSession(supabase, session) {
  if (!supabase || !session?.user?.id) return []

  const idList = await collectWorkerPunchUserIds(supabase, session)
  if (!idList.length) return []

  const { start, end } = punchFetchWindowIso()
  const { data, error } = await supabase
    .from('punches')
    .select('*')
    .in('user_id', idList)
    .gte('punched_at', start)
    .lte('punched_at', end)
    .order('punched_at', { ascending: true })
    .limit(2500)

  if (error) throw error

  const seen = new Set()
  return (data ?? []).filter((p) => {
    if (!p?.id || seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}
