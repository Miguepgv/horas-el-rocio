import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const insecureFlagFile = path.join(__dirname, 'insecure-login.flag')

// Lee .env junto a este archivo (más fiable que depender solo del reemplazo
// de import.meta.env si el cwd o la copia del proyecto no coinciden).
// Si existe el archivo vacío `insecure-login.flag`, fuerza modo solo-correo
// (útil si .env no se guardó o OneDrive no sincronizó a tiempo).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const fromEnv = env.VITE_INSECURE_EMAIL_LOGIN ?? ''
  const insecureRaw = fs.existsSync(insecureFlagFile) ? 'true' : fromEnv
  return {
    plugins: [react()],
    define: {
      __INSECURE_EMAIL_LOGIN_RAW__: JSON.stringify(insecureRaw),
    },
  }
})
