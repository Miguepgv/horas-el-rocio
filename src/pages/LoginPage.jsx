import BrandLogo from '../components/BrandLogo.jsx'
import { APP_SCREEN_TITLE } from '../lib/brand.js'
import { insecureEmailLoginEnabled } from '../lib/insecureLogin.js'
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
          <h1>{APP_SCREEN_TITLE}</h1>
        </header>

        {!configured && (
          <div className="banner error">
            <p>
              Faltan <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en{' '}
              <code>.env</code>. Reinicia <code>npm run dev</code> tras guardar.
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
        <h1>{APP_SCREEN_TITLE}</h1>
      </header>

      {!configured && (
        <div className="banner error">
          <p>
            Faltan <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en{' '}
            <code>.env</code>. Reinicia <code>npm run dev</code> tras guardar.
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
