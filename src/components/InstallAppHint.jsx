import { useCallback, useEffect, useMemo, useState } from 'react'

function isStandalone() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
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

function readApkUrl() {
  const raw = String(import.meta.env.VITE_ANDROID_APK_URL ?? '').trim()
  if (!raw || !/^https:\/\//i.test(raw)) return ''
  return raw
}

export default function InstallAppHint() {
  const [standalone, setStandalone] = useState(() => isStandalone())
  const [modalOpen, setModalOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installing, setInstalling] = useState(false)

  const ios = useMemo(() => isIOSDevice(), [])
  const android = useMemo(() => isAndroidDevice(), [])
  const apkUrl = useMemo(() => readApkUrl(), [])

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

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen])

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
      setModalOpen(false)
    }
  }, [deferredPrompt])

  const canNativeInstall = Boolean(deferredPrompt) && !ios

  if (standalone) return null

  const showApkOnAndroid = android && apkUrl

  return (
    <>
      <div className="install-app-trigger-wrap">
        {showApkOnAndroid ? (
          <div className="install-app-trigger-row">
            <a
              href={apkUrl}
              className="install-app-apk-btn"
              rel="noopener noreferrer"
              target="_blank"
            >
              Descargar APK
            </a>
            <button
              type="button"
              className="install-app-open-btn install-app-open-btn-secondary"
              onClick={() => setModalOpen(true)}
            >
              O instalar desde el navegador
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="install-app-open-btn"
            onClick={() => setModalOpen(true)}
          >
            Instalar aplicación
          </button>
        )}
      </div>

      {modalOpen ? (
        <div
          className="modal-root install-app-modal-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-app-modal-title"
        >
          <button
            type="button"
            className="modal-backdrop"
            aria-label="Cerrar"
            onClick={() => setModalOpen(false)}
          />
          <div className="modal-panel card install-app-modal-panel">
            <h2 id="install-app-modal-title" className="install-app-modal-title">
              Instalar aplicación
            </h2>
            <div className="install-app-modal-body">
              {showApkOnAndroid ? (
                <>
                  <p className="install-app-modal-line">
                    <strong>Android (archivo .apk):</strong> pulsa <strong>Descargar APK</strong>.
                    Si avisa de origen desconocido, acepta o permite instalar desde el navegador o
                    desde «Archivos» en Ajustes.
                  </p>
                  <a
                    href={apkUrl}
                    className="install-app-modal-install install-app-modal-install-link"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Descargar APK
                  </a>
                </>
              ) : (
                <p className="install-app-modal-line">
                  <strong>Android</strong> (desde el navegador): menú <strong>⋮</strong> →{' '}
                  <em>Instalar aplicación</em> o <em>Añadir a pantalla de inicio</em>.
                </p>
              )}
              <p className="install-app-modal-line">
                <strong>Windows</strong> (Chrome o Edge): botón <em>Instalar</em> en la barra o
                menú <strong>⋮</strong> → <em>Instalar aplicación</em>.
              </p>
              <p className="install-app-modal-line">
                <strong>iPhone / iPad:</strong> abre en <strong>Safari</strong>. Si vienes de
                WhatsApp u otra app: menú <strong>⋮</strong> o <strong>⋯</strong> →{' '}
                <em>Abrir en Safari</em>. Luego <strong>Compartir</strong> (□↑) →{' '}
                <em>Añadir a pantalla de inicio</em> → <em>Añadir</em>.
              </p>
            </div>

            {canNativeInstall ? (
              <button
                type="button"
                className="install-app-modal-install install-app-modal-install-pwa"
                disabled={installing}
                onClick={runInstall}
              >
                {installing ? 'Instalando…' : 'Instalar ahora (Android / Windows)'}
              </button>
            ) : null}

            <div className="install-app-modal-actions">
              <button type="button" className="secondary" onClick={() => setModalOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
