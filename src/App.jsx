import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import {
  supabase,
  supabaseConfigured,
  supabaseUrlPreview,
} from './lib/supabase'
import LoginPage from './pages/LoginPage.jsx'
import InicioPage from './pages/InicioPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import { resolveAdminAccess } from './lib/admin.js'
import { touchAppLoginEmail } from './lib/appLoginEmails.js'
import {
  buildInsecureSession,
  clearStoredInsecureEmail,
  deterministicUserIdFromEmail,
  insecureEmailLoginEnabled,
  persistStoredInsecureEmail,
  readStoredInsecureEmail,
  canInsecureLoginWithEmail,
} from './lib/insecureLogin.js'
import { persistLoginEmail, readSavedLoginEmail } from './lib/rememberLoginEmail.js'
import './App.css'

export default function App() {
  const insecureMode = insecureEmailLoginEnabled()

  const [authSession, setAuthSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [insecureSession, setInsecureSession] = useState(null)
  const [insecureHydrated, setInsecureHydrated] = useState(() => !insecureEmailLoginEnabled())
  const [email, setEmail] = useState(() => {
    if (!insecureEmailLoginEnabled()) return readSavedLoginEmail()
    return readStoredInsecureEmail() || readSavedLoginEmail()
  })
  const [status, setStatus] = useState(null)
  const [sending, setSending] = useState(false)
  const [loginMode, setLoginMode] = useState('password')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [authTab, setAuthTab] = useState('signin')
  const [pwBusy, setPwBusy] = useState(false)
  const [insecureBusy, setInsecureBusy] = useState(false)
  const [gate, setGate] = useState({
    loading: false,
    isAdmin: false,
    ready: false,
  })

  const effectiveSession = useMemo(
    () => authSession ?? insecureSession,
    [authSession, insecureSession],
  )

  useEffect(() => {
    if (!supabaseConfigured()) {
      setLoading(false)
      setInsecureHydrated(true)
      setGate({ loading: false, isAdmin: false, ready: true })
      return
    }
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setAuthSession(s)
      setLoading(false)
      if (s?.user?.email) {
        persistLoginEmail(s.user.email)
        clearStoredInsecureEmail()
        setInsecureSession(null)
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setAuthSession(s)
      if (s?.user?.email) {
        persistLoginEmail(s.user.email)
        clearStoredInsecureEmail()
        setInsecureSession(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!insecureMode || !supabaseConfigured()) {
      setInsecureHydrated(true)
      return
    }
    let cancelled = false
    ;(async () => {
      const stored = readStoredInsecureEmail()
      if (!stored) {
        if (!cancelled) setInsecureHydrated(true)
        return
      }
      try {
        const ok = await canInsecureLoginWithEmail(supabase, stored)
        if (cancelled) return
        if (!ok) {
          clearStoredInsecureEmail()
          setInsecureSession(null)
        } else {
          const id = await deterministicUserIdFromEmail(stored)
          setInsecureSession(buildInsecureSession(stored, id))
        }
      } catch {
        if (!cancelled) {
          clearStoredInsecureEmail()
          setInsecureSession(null)
        }
      }
      if (!cancelled) setInsecureHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [insecureMode])

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!effectiveSession) {
        setGate({ loading: false, isAdmin: false, ready: true })
        return
      }
      if (!supabaseConfigured()) {
        setGate({ loading: false, isAdmin: false, ready: true })
        return
      }
      setGate({ loading: true, isAdmin: false, ready: false })
      const r = await resolveAdminAccess(supabase, effectiveSession)
      if (!cancelled)
        setGate({ loading: false, isAdmin: r.isAdmin, ready: true })
    }
    run()
    return () => {
      cancelled = true
    }
  }, [effectiveSession])

  useEffect(() => {
    if (!effectiveSession || !supabaseConfigured()) return
    touchAppLoginEmail(supabase, effectiveSession)
  }, [effectiveSession])

  function handleLoginModeChange(mode) {
    setStatus(null)
    setPassword('')
    setPassword2('')
    setLoginMode(mode)
  }

  async function handleInsecureLogin(e) {
    e.preventDefault()
    setStatus(null)
    if (!supabaseConfigured()) {
      setStatus({
        type: 'error',
        message: 'Falta configuración de Supabase en `.env`.',
      })
      return
    }
    const em = email.trim().toLowerCase()
    if (!em) {
      setStatus({ type: 'error', message: 'Escribe tu correo laboral.' })
      return
    }
    setInsecureBusy(true)
    try {
      const ok = await canInsecureLoginWithEmail(supabase, em)
      if (!ok) {
        setStatus({
          type: 'error',
          message:
            'El administrador aún no te ha dado de alta. El correo debe coincidir exactamente con la columna «Correo» de la planilla en Administración. Si eres encargado, usa el correo de administrador (super admin o el que figure en gestión de admins).',
        })
        setInsecureBusy(false)
        return
      }
      const id = await deterministicUserIdFromEmail(em)
      persistStoredInsecureEmail(em)
      persistLoginEmail(em)
      setInsecureSession(buildInsecureSession(em, id))
      setStatus(null)
    } catch (err) {
      setStatus({
        type: 'error',
        message: err?.message ?? String(err),
      })
    }
    setInsecureBusy(false)
  }

  async function sendMagicLink(e) {
    e.preventDefault()
    setStatus(null)
    if (!supabaseConfigured()) {
      setStatus({
        type: 'error',
        message:
          'Faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` en el `.env` de la carpeta del proyecto (junto a `package.json`), no en otra app. Reinicia `npm run dev` tras guardar.',
      })
      return
    }
    const em = email.trim().toLowerCase()
    persistLoginEmail(em)
    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: em,
      options: {
        emailRedirectTo: `${window.location.origin}/inicio`,
      },
    })
    setSending(false)
    if (error) {
      const msg = error.message ?? String(error)
      const code = error?.code ?? error?.status ?? ''
      const rateLimited =
        /rate limit|over_email_send|email rate limit|too many requests|429|email.*exceed|exceeded|forbidden.*email/i.test(
          String(msg) + String(code),
        )
      if (rateLimited) {
        setStatus({
          type: 'error',
          message:
            'Supabase ha cortado el envío de correos (límite del plan / magic link). No es que tu correo de admin sea inválido: simplemente no puede mandar más enlaces ahora. Soluciones: 1) Pestaña «Contraseña» y entrar con la contraseña de esa cuenta (no manda correo). 2) Modo solo-correo interno (`VITE_INSECURE_EMAIL_LOGIN=true` + SQL de RLS, ver texto bajo el login). 3) En Supabase → Authentication → SMTP propio, o esperar un rato y volver a probar.',
        })
      } else if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        setStatus({
          type: 'error',
          message:
            'No se ha podido conectar con Supabase (red). Comprueba: 1) En `.env`, `VITE_SUPABASE_URL` es solo la base, sin `/rest/v1/` (ej. https://xxx.supabase.co). 2) La clave está completa (publishable `sb_publishable_…` o anon legacy `eyJ…`). 3) Cierra y vuelve a ejecutar `npm run dev` tras cambiar `.env`. 4) Firewall/antivirus. URL detectada: ' +
            supabaseUrlPreview() +
            '. Si sigue igual, en Supabase → API → pestaña «Legacy» prueba la clave anon `eyJ…`.',
        })
      } else {
        setStatus({ type: 'error', message: msg })
      }
    } else {
      setStatus({
        type: 'ok',
        message:
          'Si ese correo está dado de alta, recibirás un enlace. Revisa la bandeja y también spam.',
      })
    }
  }

  async function handlePasswordSignIn(e) {
    e.preventDefault()
    setStatus(null)
    if (!supabaseConfigured()) {
      setStatus({
        type: 'error',
        message:
          'Faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` en el `.env` de la carpeta del proyecto (junto a `package.json`), no en otra app. Reinicia `npm run dev` tras guardar.',
      })
      return
    }
    const em = email.trim().toLowerCase()
    if (!em || !password) {
      setStatus({ type: 'error', message: 'Indica correo y contraseña.' })
      return
    }
    persistLoginEmail(em)
    setPwBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: em,
      password,
    })
    setPwBusy(false)
    if (error) {
      const msg = error.message ?? String(error)
      if (/invalid login|invalid credentials|email not confirmed/i.test(msg)) {
        setStatus({
          type: 'error',
          message:
            'Correo o contraseña incorrectos, o la cuenta aún no está confirmada. Si es la primera vez, crea la cuenta abajo o pide enlace. Si olvidaste la contraseña, usa la pestaña «Enlace al correo» o restablece en Supabase.',
        })
      } else {
        setStatus({ type: 'error', message: msg })
      }
      return
    }
    setPassword('')
    setPassword2('')
  }

  async function handlePasswordSignUp(e) {
    e.preventDefault()
    setStatus(null)
    if (!supabaseConfigured()) {
      setStatus({
        type: 'error',
        message:
          'Faltan `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` en el `.env`. Reinicia `npm run dev` tras guardar.',
      })
      return
    }
    const em = email.trim().toLowerCase()
    if (!em || !password) {
      setStatus({ type: 'error', message: 'Indica correo y contraseña.' })
      return
    }
    if (password.length < 6) {
      setStatus({ type: 'error', message: 'La contraseña debe tener al menos 6 caracteres.' })
      return
    }
    if (password !== password2) {
      setStatus({ type: 'error', message: 'Las contraseñas no coinciden.' })
      return
    }
    persistLoginEmail(em)
    setPwBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: em,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/inicio`,
      },
    })
    setPwBusy(false)
    if (error) {
      const msg = error.message ?? String(error)
      const code = error?.code ?? error?.status ?? ''
      const rateLimited =
        /rate limit|over_email_send|email rate limit|too many requests|429|email.*exceed|exceeded|forbidden.*email/i.test(
          String(msg) + String(code),
        )
      if (rateLimited) {
        setStatus({
          type: 'error',
          message:
            'Supabase limita el envío de correos. Prueba «Entrar con contraseña» si ya creaste cuenta, o configura SMTP propio en el panel de Supabase (Authentication → SMTP).',
        })
      } else if (/already registered|already been registered|User already exists/i.test(msg)) {
        setStatus({
          type: 'error',
          message:
            'Ese correo ya tiene cuenta. Usa «Entrar» con tu contraseña o la pestaña de enlace.',
        })
      } else {
        setStatus({ type: 'error', message: msg })
      }
      return
    }
    if (data.session) {
      setStatus({
        type: 'ok',
        message: 'Cuenta creada. Ya has entrado.',
      })
      setPassword('')
      setPassword2('')
      setAuthTab('signin')
    } else {
      setStatus({
        type: 'ok',
        message:
          'Cuenta creada. Si tu proyecto Supabase exige confirmar el correo, mira la bandeja (una sola vez). Si no llega nada, en Supabase → Authentication desactiva «Confirm email» para cuentas internas.',
      })
      setPassword('')
      setPassword2('')
    }
  }

  async function signOut() {
    setStatus(null)
    setPassword('')
    setPassword2('')
    clearStoredInsecureEmail()
    setInsecureSession(null)
    if (supabaseConfigured()) await supabase.auth.signOut()
  }

  const booting =
    loading ||
    (insecureMode && !insecureHydrated) ||
    (effectiveSession && supabaseConfigured() && !gate.ready)

  if (booting) {
    return (
      <div className="shell">
        <p className="muted">Cargando…</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          effectiveSession ? (
            <Navigate to="/inicio" replace />
          ) : (
            <LoginPage
              supabaseConfigured={supabaseConfigured()}
              email={email}
              setEmail={setEmail}
              loginMode={loginMode}
              onLoginModeChange={handleLoginModeChange}
              password={password}
              setPassword={setPassword}
              password2={password2}
              setPassword2={setPassword2}
              authTab={authTab}
              setAuthTab={setAuthTab}
              status={status}
              sending={sending}
              pwBusy={pwBusy}
              insecureBusy={insecureBusy}
              onInsecureSubmit={handleInsecureLogin}
              onMagicSubmit={sendMagicLink}
              onPasswordSignIn={handlePasswordSignIn}
              onPasswordSignUp={handlePasswordSignUp}
            />
          )
        }
      />
      <Route
        path="/inicio"
        element={
          effectiveSession ? (
            <InicioPage session={effectiveSession} onSignOut={signOut} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/admin"
        element={
          effectiveSession ? (
            gate.isAdmin ? (
              <AdminPage session={effectiveSession} onSignOut={signOut} />
            ) : (
              <Navigate to="/inicio" replace />
            )
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
