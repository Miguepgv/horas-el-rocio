const KEY = 'rr_horas_last_email'

export function readSavedLoginEmail() {
  try {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem(KEY)?.trim().toLowerCase() ?? ''
  } catch {
    return ''
  }
}

export function persistLoginEmail(raw) {
  const e = String(raw ?? '').trim().toLowerCase()
  if (!e) return
  try {
    localStorage.setItem(KEY, e)
  } catch {
    /* ignore */
  }
}
