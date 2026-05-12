import { isAdminEmailForInsecureLogin } from './admin.js'
import { isMissingTableError } from './dbErrors.js'
import { escapeForILikeExact } from './emailMatch.js'

const STORAGE_KEY = 'rr_horas_insecure_login_email'

/* global __INSECURE_EMAIL_LOGIN_RAW__ */

/** Valor crudo inyectado al compilar (para mensaje de ayuda en login normal). */
export function insecureEmailLoginCompiledRaw() {
  return __INSECURE_EMAIL_LOGIN_RAW__
}

/** Valor de VITE_INSECURE_EMAIL_LOGIN leído en vite.config (loadEnv desde la carpeta del proyecto). */
export function insecureEmailLoginEnabled() {
  const raw = __INSECURE_EMAIL_LOGIN_RAW__
  if (raw === true || raw === 1) return true
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u200b-\u200d\ufeff]/g, '')
  return s === 'true' || s === '1' || s === 'yes' || s === 'on'
}

export function readStoredInsecureEmail() {
  try {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(STORAGE_KEY)?.trim().toLowerCase() ?? ''
  } catch {
    return ''
  }
}

export function persistStoredInsecureEmail(email) {
  const e = String(email ?? '').trim().toLowerCase()
  if (!e) return
  try {
    localStorage.setItem(STORAGE_KEY, e)
  } catch {
    /* ignore */
  }
}

export function clearStoredInsecureEmail() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Mismo user_id siempre para el mismo correo (fichajes por dispositivo). */
export async function deterministicUserIdFromEmail(email) {
  const normalized = String(email ?? '').trim().toLowerCase()
  const data = new TextEncoder().encode(`rocio-insecure-v1:${normalized}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(hash).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function sessionIsInsecure(session) {
  return session?.insecure === true
}

export function buildInsecureSession(email, userId) {
  const em = String(email).trim().toLowerCase()
  return {
    access_token: 'insecure-local-session',
    insecure: true,
    user: {
      id: userId,
      email: em,
      app_metadata: {},
      user_metadata: {},
      aud: 'insecure',
      role: 'insecure',
      created_at: new Date().toISOString(),
    },
  }
}

/** Trabajador: correo en columna `correo` de la planilla o en plantilla `event_workers` (sin distinguir mayúsculas). */
export async function validateWorkerEmailRegistered(supabase, email) {
  const em = String(email ?? '').trim().toLowerCase()
  if (!em || !supabase) return false
  const pat = escapeForILikeExact(em)
  const [pl, ew] = await Promise.all([
    supabase.from('rocio_horario_planilla').select('id').ilike('correo', pat).limit(1).maybeSingle(),
    supabase.from('event_workers').select('id').ilike('email', pat).limit(1).maybeSingle(),
  ])
  if (pl.error && !isMissingTableError(pl.error)) throw pl.error
  if (ew.error && !isMissingTableError(ew.error)) throw ew.error
  return Boolean(pl.data?.id || ew.data?.id)
}

/** Modo solo-correo: entra administrador (lista admins) o trabajador dado de alta en planilla/plantilla. */
export async function canInsecureLoginWithEmail(supabase, email) {
  if (await isAdminEmailForInsecureLogin(supabase, email)) return true
  return validateWorkerEmailRegistered(supabase, email)
}
