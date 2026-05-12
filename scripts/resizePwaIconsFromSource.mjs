/**
 * Genera public/icon-192.png y public/icon-512.png desde public/logo-source.png
 * Coloca ahí tu logo (PNG o JPG cuadrado recomendado).
 * Uso: npm run icons:from-logo
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'public')
const src = path.join(root, 'logo-source.png')

if (!fs.existsSync(src)) {
  console.error(
    'No existe public/logo-source.png\n' +
      '  1. Guarda tu imagen del logo como: public/logo-source.png\n' +
      '  2. Vuelve a ejecutar: npm run icons:from-logo',
  )
  process.exit(1)
}

await sharp(src).resize(192, 192, { fit: 'cover' }).png().toFile(path.join(root, 'icon-192.png'))
await sharp(src).resize(512, 512, { fit: 'cover' }).png().toFile(path.join(root, 'icon-512.png'))
console.log('OK → public/icon-192.png y public/icon-512.png')
