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

export function isMissingTableError(err) {
  const m = formatSupabaseErrText(err)
  const code = typeof err === 'object' && err?.code != null ? String(err.code) : ''
  if (code === 'PGRST205' || /PGRST205\b/i.test(m)) return true
  if (/schema cache/i.test(m)) return true
  if (/could not find the table/i.test(m)) return true
  if (/could not find a relationship/i.test(m)) return true
  if (/relation\s+["']?[^"']+["']?\s+does not exist/i.test(m)) return true
  if (/42P01/i.test(code)) return true
  return false
}

export function isNetworkFetchError(err) {
  const m = formatSupabaseErrText(err)
  return /failed to fetch|networkerror|load failed|network request failed/i.test(m)
}

export function friendlySupabaseError(err) {
  const m = formatSupabaseErrText(err)
  if (isNetworkFetchError(err)) {
    return (
      'No se pudo conectar con Supabase desde el navegador. Suele ser Kaspersky u otro antivirus ' +
      'bloqueando la red (en el error aparece kaspersky-labs.com). Prueba: 1) Reinicia con `npm run dev` ' +
      '(ya hay proxy local en `.env.development.local`). 2) Pausa Kaspersky 2 min y recarga. ' +
      '3) Ventana de incógnito sin extensiones.'
    )
  }
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
