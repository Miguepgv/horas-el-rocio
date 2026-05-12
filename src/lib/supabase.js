import { createClient } from '@supabase/supabase-js'

function envTrim(value) {
  return typeof value === 'string' ? value.trim() : value
}

const supabaseUrl = envTrim(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = envTrim(import.meta.env.VITE_SUPABASE_ANON_KEY)

const configured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseAnonKey.length >= 20 &&
  supabaseUrl.startsWith('https://'),
)

/** URL + clave presentes y clave con longitud mínima (anon JWT o publishable). */
export function supabaseConfigured() {
  return configured
}

// createClient lanza si la clave está vacía; sin .env la app no debe quedar en blanco
const placeholderUrl = 'https://configure-dotenv.supabase.co'
const placeholderKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJwbGFjZWhvbGRlciJ9.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

export const supabase = createClient(
  configured ? supabaseUrl : placeholderUrl,
  configured ? supabaseAnonKey : placeholderKey,
  {
    auth: {
      persistSession: configured,
      autoRefreshToken: configured,
    },
  },
)

/** Solo para depuración en consola (sin exponer la clave). */
export function supabaseUrlPreview() {
  if (!supabaseUrl) return '(vacío)'
  try {
    const u = new URL(supabaseUrl)
    return `${u.protocol}//${u.hostname}`
  } catch {
    return '(URL no válida)'
  }
}

/** Longitud de la clave que ve Vite (0 = no cargó el `.env` o falta reiniciar `npm run dev`). */
export function supabaseAnonKeyLength() {
  return typeof supabaseAnonKey === 'string' ? supabaseAnonKey.length : 0
}
