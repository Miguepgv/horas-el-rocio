/** Une mensaje PostgREST / Postgres para mostrar o analizar. */
export function formatSupabaseErrText(err) {
  if (err == null) return ''
  if (typeof err === 'string') return err
  const parts = [
    err.code && `[${err.code}]`,
    err.message,
    err.details,
    err.hint,
  ].filter(Boolean)
  return parts.join(' — ')
}

/**
 * Errores típicos: tabla aún no expuesta en PostgREST (PGRST205), caché vieja, relación inexistente.
 * Evitamos el patrón genérico "does not exist" (da falsos positivos con tipos, funciones, etc.).
 */
export function isMissingTableError(err) {
  const m = formatSupabaseErrText(err)
  const code = typeof err === 'object' && err?.code != null ? String(err.code) : ''
  if (code === 'PGRST205' || /PGRST205\b/i.test(m)) return true
  if (/schema cache/i.test(m)) return true
  if (/could not find the table/i.test(m)) return true
  if (/could not find a relationship/i.test(m)) return true
  if (/relation\s+["']?[^"']+["']?\s+does not exist/i.test(m)) return true
  if (/42P01/i.test(code)) return true /* undefined_table */
  return false
}

/** Texto amable si parece falta de tablas / caché PostgREST; si no, el error real. */
export function friendlySupabaseError(err) {
  const m = formatSupabaseErrText(err)
  if (!isMissingTableError(err)) {
    return m || 'Error desconocido al hablar con Supabase.'
  }
  return (
    'Parece que falta una tabla en la API de Supabase o PostgREST aún no ha refrescado el esquema. ' +
    "En SQL Editor ejecuta una vez: NOTIFY pgrst, 'reload schema'; " +
    'y en el panel del proyecto revisa que el .env apunte al mismo proyecto donde creaste las tablas. ' +
    'Si acabas de crear rocio_horario_planilla / horario_avisos / app_login_emails, espera 1–2 min y recarga la app. ' +
    '(Detalle técnico: ' +
    (m || 'sin mensaje') +
    ')'
  )
}
