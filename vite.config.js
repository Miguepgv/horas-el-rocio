import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const insecureFlagFile = path.join(__dirname, 'insecure-login.flag')

function supabaseProxyTarget(env) {
  const remote = String(env.VITE_SUPABASE_REMOTE_URL ?? env.VITE_SUPABASE_URL ?? '').trim()
  if (!remote.startsWith('https://')) return null
  try {
    return new URL(remote).origin
  } catch {
    return null
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const fromEnv = env.VITE_INSECURE_EMAIL_LOGIN ?? ''
  const insecureRaw = fs.existsSync(insecureFlagFile) ? 'true' : fromEnv
  const useProxy =
    mode === 'development' &&
    String(env.VITE_SUPABASE_USE_PROXY ?? '')
      .trim()
      .toLowerCase() === 'true'
  const proxyTarget = useProxy ? supabaseProxyTarget(env) : null

  return {
    plugins: [react()],
    define: {
      __INSECURE_EMAIL_LOGIN_RAW__: JSON.stringify(insecureRaw),
    },
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      ...(proxyTarget
        ? {
            proxy: {
              '/rest': { target: proxyTarget, changeOrigin: true, secure: true },
              '/auth': { target: proxyTarget, changeOrigin: true, secure: true },
              '/realtime': {
                target: proxyTarget,
                changeOrigin: true,
                secure: true,
                ws: true,
              },
            },
          }
        : {}),
    },
  }
})
