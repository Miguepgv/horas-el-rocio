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

function isAndroidDevice() {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent || '')
}

/** Chrome/Firefox/Edge en iPhone: hay que pasar a Safari. */
function isIOSNonSafariBrowser() {
  const ua = navigator.userAgent || ''
  if (!isIOSDevice()) return false
  return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)
}

/** WhatsApp, Instagram, Facebook, etc.: WebView; conviene Safari. */
function isIOSLikelyInApp() {
  const ua = navigator.userAgent || ''
  if (!isIOSDevice()) return false
  return /FBAN|FBAV|Instagram|Line\/|WhatsApp|TikTok/i.test(ua)
}

function isLikelyMobile() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
}

export default function InstallAppHint() {
  const [standalone, setStandalone] = useState(() => isStandalone())
  const [iosHelpOpen, setIosHelpOpen] = useState(true)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installing, setInstalling] = useState(false)

  const ios = useMemo(() => isIOSDevice(), [])
  const android = useMemo(() => isAndroidDevice(), [])
  const mobile = useMemo(() => isLikelyMobile(), [])
  const iosOtherBrowser = useMemo(() => isIOSNonSafariBrowser(), [])
  const iosInApp = useMemo(() => isIOSLikelyInApp(), [])
  const iosNeedsSafariFirst = iosOtherBrowser || iosInApp

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

      {android ? (
        <>
          <p className="install-app-lead">
            En <strong>Android</strong> puedes instalarla como app o dejar un acceso en el inicio.
          </p>
          {deferredPrompt ? (
            <button
              type="button"
              className="install-app-primary"
              disabled={installing}
              onClick={runInstall}
            >
              {installing ? 'Instalando…' : 'Descargar / instalar app'}
            </button>
          ) : null}
          <div className="install-block install-block-android">
            <p className="install-block-title">Si no ves el botón de arriba</p>
            <ol className="install-steps">
              <li>
                Abre esta página en <strong>Google Chrome</strong> (recomendado).
              </li>
              <li>
                Arriba a la derecha, pulsa el menú <strong>⋮</strong> (tres puntitos).
              </li>
              <li>
                Elige <strong>Instalar aplicación</strong>, <strong>Instalar app</strong> o{' '}
                <strong>Añadir a la pantalla de inicio</strong> (según tu móvil y versión).
              </li>
              <li>
                Confirma. Ya tendrás el icono en el inicio; al abrirlo irá a pantalla completa como
                una app.
              </li>
            </ol>
          </div>
        </>
      ) : null}

      {ios ? (
        <>
          <p className="install-app-lead">
            En <strong>iPhone</strong> no se descarga de una tienda: se añade desde{' '}
            <strong>Safari</strong> a tu pantalla de inicio.
          </p>
          {!iosNeedsSafariFirst ? (
            <p className="muted small install-ios-safari-tip">
              Si entraste por <strong>WhatsApp</strong>, <strong>Instagram</strong> u otra app,
              busca el menú <strong>⋮</strong> o <strong>⋯</strong> (tres puntitos) y elige{' '}
              <strong>Abrir en Safari</strong> (o copia el enlace y pégalo en Safari) antes de los
              pasos de abajo.
            </p>
          ) : null}

          {iosNeedsSafariFirst ? (
            <div className="install-block install-block-warn" role="note">
              <p className="install-block-title">Primero: ábrela en Safari</p>
              <ol className="install-steps">
                <li>
                  Lo ideal es usar el navegador <strong>Safari</strong> (icono brújula azul y
                  roja).
                </li>
                <li>
                  Si estás en <strong>Chrome</strong>, <strong>WhatsApp</strong> u otra app: busca
                  el menú <strong>⋮</strong> o <strong>⋯</strong> (tres puntitos, arriba a la
                  derecha o abajo) y toca <strong>Abrir en Safari</strong>,{' '}
                  <strong>Abrir en el navegador</strong> o similar.
                </li>
                <li>
                  Si no sale esa opción: mantén pulsada la <strong>barra de dirección</strong>,
                  copia el enlace, abre <strong>Safari</strong>, pégalo y entra.
                </li>
              </ol>
            </div>
          ) : null}

          <button
            type="button"
            className="secondary install-app-ios-btn"
            aria-expanded={iosHelpOpen}
            onClick={() => setIosHelpOpen((v) => !v)}
          >
            {iosHelpOpen ? 'Ocultar pasos en Safari' : 'Ver pasos en Safari'}
          </button>
          {iosHelpOpen ? (
            <div className="install-block">
              <p className="install-block-title">En Safari: dejarla como app</p>
              <ol className="install-steps">
                <li>
                  Abajo en la barra, pulsa <strong>Compartir</strong> (cuadrado con flecha hacia
                  arriba).
                </li>
                <li>
                  Baja en la lista y pulsa <strong>Añadir a pantalla de inicio</strong>.
                </li>
                <li>
                  Pulsa <strong>Añadir</strong>. Verás el icono «Horas» en el inicio; al abrirlo
                  ocupará casi toda la pantalla.
                </li>
              </ol>
              <p className="muted small install-footnote">
                En algunos menús también puede aparecer como «Añadir a inicio» o con icono de +.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {deferredPrompt && !ios && !android ? (
        <button
          type="button"
          className="install-app-primary"
          disabled={installing}
          onClick={runInstall}
        >
          {installing ? 'Instalando…' : 'Instalar aplicación'}
        </button>
      ) : null}

      {!ios && !android && !mobile && !deferredPrompt ? (
        <p className="muted small install-app-lead">
          En el móvil podrás instalarla o añadirla al inicio desde el menú del navegador (en
          Android: menú <strong>⋮</strong>).
        </p>
      ) : null}

      {!ios && !android && mobile && !deferredPrompt ? (
        <p className="muted small install-app-lead">
          Usa el menú del navegador para añadir la página al inicio.
        </p>
      ) : null}
    </section>
  )
}
