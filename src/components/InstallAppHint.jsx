import { useCallback, useEffect, useMemo, useState } from 'react'

function isStandalone() {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(display-mode: standalone)')
  if (mq.matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  return Boolean(window.navigator.standalone)
}

function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  return false
}

function isLikelyMobile() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
}

export default function InstallAppHint() {
  const [standalone, setStandalone] = useState(() => isStandalone())
  const [iosHelpOpen, setIosHelpOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installing, setInstalling] = useState(false)

  const ios = useMemo(() => isIOSDevice(), [])
  const mobile = useMemo(() => isLikelyMobile(), [])

  useEffect(() => {
    setStandalone(isStandalone())
  }, [])

  useEffect(() => {
    const onChange = () => setStandalone(isStandalone())
    const mqs = [
      window.matchMedia('(display-mode: standalone)'),
      window.matchMedia('(display-mode: fullscreen)'),
    ]
    for (const mq of mqs) mq.addEventListener?.('change', onChange)
    return () => {
      for (const mq of mqs) mq.removeEventListener?.('change', onChange)
    }
  }, [])

  useEffect(() => {
    const onBip = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  const runInstall = useCallback(async () => {
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
    } catch {
      /* ignore */
    } finally {
      setDeferredPrompt(null)
      setInstalling(false)
    }
  }, [deferredPrompt])

  if (standalone) return null

  return (
    <section className="card install-app-card" aria-label="Instalar aplicación">
      <p className="label-up">App en el móvil</p>
      <p className="install-app-lead">
        Puedes dejar esta web como acceso directo en la pantalla de inicio, como una app.
      </p>

      {deferredPrompt && !ios ? (
        <button
          type="button"
          className="install-app-primary"
          disabled={installing}
          onClick={runInstall}
        >
          {installing ? 'Instalando…' : 'Instalar aplicación'}
        </button>
      ) : null}

      {ios ? (
        <div className="install-app-ios">
          <button
            type="button"
            className="secondary install-app-ios-btn"
            aria-expanded={iosHelpOpen}
            onClick={() => setIosHelpOpen((v) => !v)}
          >
            {iosHelpOpen ? 'Ocultar pasos' : 'iPhone: cómo ponerla como app'}
          </button>
          {iosHelpOpen ? (
            <ol className="install-steps">
              <li>
                Abre esta página en <strong>Safari</strong> (es la opción que mejor funciona en
                iPhone).
              </li>
              <li>
                Pulsa el botón <strong>Compartir</strong> (abajo: cuadrado con flecha hacia arriba).
              </li>
              <li>
                Desplázate y pulsa <strong>Añadir a pantalla de inicio</strong>.
              </li>
              <li>
                Pulsa <strong>Añadir</strong>. Ya tendrás el icono «Horas» en el inicio; al abrirlo
                irá casi a pantalla completa como una app.
              </li>
            </ol>
          ) : null}
        </div>
      ) : null}

      {!ios && mobile && !deferredPrompt ? (
        <p className="muted small install-app-android-hint">
          En <strong>Chrome</strong> (Android): menú <strong>⋮</strong> → «Instalar aplicación» o
          «Añadir a pantalla de inicio».
        </p>
      ) : null}

      {!ios && !mobile && !deferredPrompt ? (
        <p className="muted small">
          En el móvil podrás instalarla o añadirla a inicio desde el menú del navegador.
        </p>
      ) : null}
    </section>
  )
}
