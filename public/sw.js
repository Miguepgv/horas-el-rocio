/* PWA: sin cachear la app; al activar borra caches antiguos (evita JS corrupto tras deploy). */

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Navegación / HTML siempre red (index.html no debe quedar obsoleto)
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(fetch(request))
    return
  }
  // Resto: red primero (chunks con hash; si falta un antiguo, no servir basura cacheada)
  event.respondWith(fetch(request))
})
