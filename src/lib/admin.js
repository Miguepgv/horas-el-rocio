import { isMissingTableError } from './dbErrors.js'

function parseList(raw) {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Login solo-correo: super admin, VITE_ADMIN_EMAILS o fila en app_admins.
 * No envía correos; solo consulta Supabase.
 */
export async function isAdminEmailForInsecureLogin(supabase, rawEmail) {
  const email = String(rawEmail ?? '').trim().toLowerCase()
  if (!email) return false
  const superEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  if (superEmail && email === superEmail) return true
  if (parseList(import.meta.env.VITE_ADMIN_EMAILS).includes(email)) return true
  if (!supabase) return false
  const { data, error } = await supabase
    .from('app_admins')
    .select('email')
    .eq('email', email)
    .maybeSingle()
  if (error && !isMissingTableError(error)) throw error
  return Boolean(data)
}

export function isSuperAdminSession(session) {
  const superEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  const email = session?.user?.email?.trim().toLowerCase()
  return Boolean(superEmail && email && email === superEmail)
}

/** Comprueba env + fila en app_admins (correo en minúsculas). */
export async function resolveAdminAccess(supabase, session) {
  const email = session?.user?.email?.trim().toLowerCase()
  if (!email || !supabase) {
    return { isAdmin: false, isSuper: false }
  }
  const superEmail = import.meta.env.VITE_SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  const isSuper = Boolean(superEmail && email === superEmail)
  const envAdmins = parseList(import.meta.env.VITE_ADMIN_EMAILS)
  if (envAdmins.includes(email)) {
    return { isAdmin: true, isSuper }
  }
  const { data } = await supabase
    .from('app_admins')
    .select('email')
    .eq('email', email)
    .maybeSingle()
  const isAdmin = Boolean(data) || isSuper
  return { isAdmin, isSuper }
}
