import { isMissingTableError } from './dbErrors.js'

/**
 * Registra o actualiza la última visita del correo tras login (magic link).
 * Tabla `app_login_emails` (crear con scripts/supabase_app_login_emails.sql).
 */
export async function touchAppLoginEmail(supabase, session) {
  if (!supabase || session?.insecure || !session?.user?.email || !session.user.id) return
  const email = String(session.user.email).trim().toLowerCase()
  if (!email) return

  const { error } = await supabase.from('app_login_emails').upsert(
    {
      email,
      auth_user_id: session.user.id,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'email' },
  )

  if (error && !isMissingTableError(error)) {
    console.warn('touchAppLoginEmail:', error.message ?? error)
  }
}
