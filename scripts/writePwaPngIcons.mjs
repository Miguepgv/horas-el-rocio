/**
 * Genera iconos PNG sólidos (#b45309) para el manifest PWA / PWABuilder.
 * Uso: node scripts/writePwaPngIcons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..', 'public')

const R = 0xb4
const G = 0x53
const B = 0x09

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcIn = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcIn), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function pngSolid(w, h) {
  const raw = []
  for (let y = 0; y < h; y++) {
    raw.push(0)
    for (let x = 0; x < w; x++) raw.push(R, G, B)
  }
  const zlibbed = zlib.deflateSync(Buffer.from(raw))
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibbed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  const out = path.join(root, `icon-${size}.png`)
  fs.writeFileSync(out, pngSolid(size, size))
  console.log('Wrote', out)
}
