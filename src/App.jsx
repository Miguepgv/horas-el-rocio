import { useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabase'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!supabaseConfigured()) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function sendMagicLink(e) {
    e.preventDefault()
    setStatus(null)
    if (!supabaseConfigured()) {
      setStatus({
        type: 'error',
        message:
          'Faltan las variables de entorno. Crea un archivo `.env` con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
      })
      return
    }
    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}`,
      },
    })
    setSending(false)
    if (error) {
      setStatus({ type: 'error', message: error.message })
    } else {
      setStatus({
        type: 'ok',
        message:
          'Si ese correo está dado de alta, recibirás un enlace. Revisa la bandeja y también spam.',
      })
    }
  }

  async function signOut() {
    setStatus(null)
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <div className="shell">
        <p className="muted">Cargando…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="shell">
        <header className="header">
          <h1>Horas — El Rocío</h1>
          <p className="muted">Entra con el enlace que te llegará al correo.</p>
        </header>

        {!supabaseConfigured() && (
          <p className="banner error">
            Configura `.env` con las claves de Supabase (copia desde `.env.example`).
          </p>
        )}

        <form className="card" onSubmit={sendMagicLink}>
          <label htmlFor="email">Correo laboral</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@ejemplo.com"
          />
          <button type="submit" disabled={sending}>
            {sending ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>

        {status && (
          <p className={`hint ${status.type === 'error' ? 'error' : 'ok'}`}>
            {status.message}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="shell">
      <header className="header">
        <h1>Horas — El Rocío</h1>
        <p className="muted">Sesión iniciada.</p>
      </header>
      <div className="card">
        <p>
          <strong>{session.user.email}</strong>
        </p>
        <p className="muted small">
          Siguiente paso: conectar tablas de trabajadores y fichaje en Supabase.
        </p>
        <button type="button" className="secondary" onClick={signOut}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
