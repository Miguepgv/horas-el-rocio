import BrandLogo from '../components/BrandLogo.jsx'
import {
  insecureEmailLoginCompiledRaw,
  insecureEmailLoginEnabled,
} from '../lib/insecureLogin.js'
import {
  supabaseAnonKeyLength,
  supabaseUrlPreview,
} from '../lib/supabase.js'

export default function LoginPage({
  supabaseConfigured: configured,
  insecureBusy = false,
  onInsecureSubmit,
  email,
  setEmail,
  loginMode,
  onLoginModeChange,
  password,
  setPassword,
  password2,
  setPassword2,
  authTab,
  setAuthTab,
  status,
  sending,
  pwBusy,
  onMagicSubmit,
  onPasswordSignIn,
  onPasswordSignUp,
}) {
  if (insecureEmailLoginEnabled()) {
    const busy = insecureBusy
    return (
      <div className="shell">
        <header className="header header-login">
          <BrandLogo className="brand-logo-md" />
          <h1>Horas — El Rocío</h1>
          <p className="muted">
            Escribe tu correo y pulsa Entrar: no se manda ningún correo. Si eres administrador,
            entras directo. Si eres trabajador/a, el correo debe coincidir con la columna
            «Correo» de la planilla (o con la plantilla del evento).
          </p>
        </header>

        {!configured && (
          <div className="banner error">
            <p>
              Configura `.env` aquí (esta carpeta del proyecto, junto a `package.json`):
              `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Guarda el archivo y{' '}
              <strong>reinicia</strong> el servidor (`Ctrl+C` y otra vez `npm run dev`).
            </p>
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              Lo que ve Vite ahora: URL → {supabaseUrlPreview()} · clave →{' '}
              {supabaseAnonKeyLength()} caracteres (hace falta ≥ 20 y URL https). Si la
              clave sale 0, Vite no está leyendo tu `.env` (mala carpeta o no reiniciaste).
            </p>
          </div>
        )}

        <form className="card" onSubmit={onInsecureSubmit}>
          <label htmlFor="email-insecure">Correo laboral</label>
          <input
            id="email-insecure"
            name="email"
            autoComplete="email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@ejemplo.com"
          />
          <button type="submit" disabled={busy || !configured}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="muted small login-security-note">
          El correo se guarda en este móvil: la próxima vez que abras la app seguirás dentro
          hasta que pulses «Cerrar sesión».
        </p>

        {status && (
          <p className={`hint ${status.type === 'error' ? 'error' : 'ok'}`}>{status.message}</p>
        )}
      </div>
    )
  }

  const busy = pwBusy || sending

  return (
    <div className="shell">
      <header className="header header-login">
        <BrandLogo className="brand-logo-md" />
        <h1>Horas — El Rocío</h1>
        <p className="muted">
          {loginMode === 'password'
            ? 'Entra con correo y contraseña (recomendado: no depende de límites de correo).'
            : 'Te enviamos un enlace al correo (puede haber límite de envíos en Supabase).'}
        </p>
      </header>

      {!configured && (
        <div className="banner error">
          <p>
            Configura `.env` aquí (esta carpeta del proyecto, junto a `package.json`):
            `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Guarda el archivo y{' '}
            <strong>reinicia</strong> el servidor (`Ctrl+C` y otra vez `npm run dev`).
          </p>
          <p className="muted small" style={{ marginTop: '0.5rem' }}>
            Lo que ve Vite ahora: URL → {supabaseUrlPreview()} · clave →{' '}
            {supabaseAnonKeyLength()} caracteres (hace falta ≥ 20 y URL https). Si la
            clave sale 0, Vite no está leyendo tu `.env` (mala carpeta o no reiniciaste).
          </p>
        </div>
      )}

      <div className="login-mode-tabs" role="tablist" aria-label="Forma de acceso">
        <button
          type="button"
          role="tab"
          aria-selected={loginMode === 'password'}
          className={`login-mode-tab ${loginMode === 'password' ? 'active' : ''}`}
          onClick={() => onLoginModeChange('password')}
        >
          Contraseña
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={loginMode === 'magic'}
          className={`login-mode-tab ${loginMode === 'magic' ? 'active' : ''}`}
          onClick={() => onLoginModeChange('magic')}
        >
          Enlace al correo
        </button>
      </div>

      <p className="muted small login-security-note">
        El correo en la <strong>planilla</strong> sirve para emparejar horarios y fichajes, pero{' '}
        <strong>no puede ser el único control de acceso</strong>: cualquiera podría escribir el
        correo de otra persona. Por eso hace falta <strong>una prueba</strong> (contraseña o
        enlace al correo) la primera vez. Después la <strong>sesión se guarda en el móvil</strong>{' '}
        y no hace falta repetir cada día hasta que pulsen «Cerrar sesión».
      </p>

      <p className="muted small login-insecure-hint">
        Si quieres <strong>solo correo</strong> (sin contraseña ni enlace): en <code>.env</code> pon{' '}
        <code>VITE_INSECURE_EMAIL_LOGIN=true</code>, <strong>guarda el archivo (Ctrl+S)</strong>, para
        el servidor y vuelve a <code>npm run dev</code>. En Supabase ejecuta{' '}
        <code>scripts/supabase_disable_rls_insecure_login.sql</code> (modo interno, sin seguridad
        real). Si el .env falla, crea un archivo vacío <code>insecure-login.flag</code> en la raíz
        del proyecto y reinicia Vite.
      </p>
      <p className="muted small">
        Lo que compiló Vite para ese modo ahora mismo: «
        <strong>{String(insecureEmailLoginCompiledRaw() || '(vacío)')}</strong>» — si sale vacío,
        el .env no estaba guardado o Vite no se reinició tras guardar.
      </p>

      {loginMode === 'password' ? (
        <div className="card login-card-block">
          <label htmlFor="email-pw">Correo laboral</label>
          <input
            id="email-pw"
            name="email"
            autoComplete="email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@ejemplo.com"
          />

          {authTab === 'signin' ? (
            <form className="login-pw-form" onSubmit={onPasswordSignIn}>
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
              <button type="submit" disabled={busy || !configured}>
                {pwBusy ? 'Entrando…' : 'Entrar'}
              </button>
              <p className="muted small login-inline-actions">
                <button
                  type="button"
                  className="link-like"
                  onClick={() => setAuthTab('signup')}
                >
                  Primera vez: crear contraseña
                </button>
              </p>
            </form>
          ) : (
            <form className="login-pw-form" onSubmit={onPasswordSignUp}>
              <label htmlFor="password-new">Contraseña</label>
              <input
                id="password-new"
                name="password-new"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
              <label htmlFor="password-repeat">Repetir contraseña</label>
              <input
                id="password-repeat"
                name="password-repeat"
                type="password"
                autoComplete="new-password"
                required
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="Igual que arriba"
              />
              <button type="submit" disabled={busy || !configured}>
                {pwBusy ? 'Creando…' : 'Crear cuenta y entrar'}
              </button>
              <p className="muted small login-inline-actions">
                <button
                  type="button"
                  className="link-like"
                  onClick={() => setAuthTab('signin')}
                >
                  Ya tengo cuenta
                </button>
              </p>
            </form>
          )}

          <p className="muted small login-hint-box">
            Recomendación en Supabase (solo una vez):{' '}
            <strong>Authentication → Providers → Email</strong>: desactiva «Confirm email»
            si son cuentas internas; así el alta con contraseña no manda correo de
            confirmación. Para más envíos de enlace mágico, configura{' '}
            <strong>SMTP propio</strong> en el mismo apartado.
          </p>
        </div>
      ) : (
        <form className="card" onSubmit={onMagicSubmit}>
          <label htmlFor="email-magic">Correo laboral</label>
          <input
            id="email-magic"
            name="email"
            autoComplete="email"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@ejemplo.com"
          />
          <button type="submit" disabled={sending || !configured}>
            {sending ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </form>
      )}

      {status && (
        <p className={`hint ${status.type === 'error' ? 'error' : 'ok'}`}>{status.message}</p>
      )}
    </div>
  )
}
