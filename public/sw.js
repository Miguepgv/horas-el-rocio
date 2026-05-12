/* PWA mínimo: permite «Instalar» en Chrome sin cachear la app (evita datos obsoletos). */
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
