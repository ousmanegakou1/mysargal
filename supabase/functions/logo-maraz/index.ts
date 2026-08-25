// ============================================================
// MySargal — logo-maraz v8 : assets marchand générés (toujours PNG).
//   ?m=<merchant_id>   (défaut : MARAZ)
//   ?g=1               logo version Google Wallet (fond marque + marge)
//   ?strip=1           bande Apple Wallet : dégradé horizontal symétrique
//                      à partir de brand.strip=[c1,c2] (1125x369)
//   ?meta              JSON de contrôle
// Sources logo : merchants.logo_base64 (PNG/JPG) ou logo_url (PNG/JPG).
// brand.logo_invert=true → logo sombre → blanc/transparent.
// ============================================================
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MARAZ_ID = '5186204b-e536-4fd0-ab47-43b195ae43db'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(bytes: Uint8Array): number {
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}
function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type)
  const td = new Uint8Array(t.length + data.length)
  td.set(t); td.set(data, t.length)
  const out = new Uint8Array(4 + td.length + 4)
  out.set(u32(data.length)); out.set(td, 4); out.set(u32(crc32(td)), 4 + td.length)
  return out
}
async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate')
  const w = cs.writable.getWriter()
  w.write(data); w.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}
async function rawToPng(raw: Uint8Array, W: number, H: number, rgba: boolean): Promise<Uint8Array> {
  const idat = await zlibDeflate(raw)
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = new Uint8Array(13)
  ihdr.set(u32(W)); ihdr.set(u32(H), 4)
  ihdr[8] = 8; ihdr[9] = rgba ? 6 : 2
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) { png.set(p, off); off += p.length }
  return png
}
function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
async function buildFallback(): Promise<Uint8Array> {
  const S = 4, W = 120 * S, H = 64 * S, HALF = 3.5
  const SEGS = [[14, 54, 38, 14], [38, 14, 62, 54], [58, 54, 82, 14], [82, 14, 106, 54]]
  const GOLD = [230, 199, 106]
  const raw = new Uint8Array(H * (1 + W * 4))
  for (let y = 0; y < H; y++) {
    const row = y * (1 + W * 4)
    const vy = (y + 0.5) / S
    for (let x = 0; x < W; x++) {
      const vx = (x + 0.5) / S
      let d = 1e9
      for (const s of SEGS) { const dd = distSeg(vx, vy, s[0], s[1], s[2], s[3]); if (dd < d) d = dd }
      const a = Math.max(0, Math.min(1, (HALF - d) * S + 0.5))
      if (a > 0) {
        const o = row + 1 + x * 4
        raw[o] = GOLD[0]; raw[o + 1] = GOLD[1]; raw[o + 2] = GOLD[2]; raw[o + 3] = Math.round(a * 255)
      }
    }
  }
  return rawToPng(raw, W, H, true)
}
const FALLBACK = await buildFallback()

const isPng = (b: Uint8Array | null) => !!b && b.length > 100 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
const isJpg = (b: Uint8Array | null) => !!b && b.length > 100 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF
function b64Try(b: string): Uint8Array | null {
  try { return Uint8Array.from(atob(String(b || '').replace(/\s/g, '')), (c) => c.charCodeAt(0)) } catch { return null }
}
function hexToRgbArr(h: string | null | undefined): number[] | null {
  let s = String(h || '').replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length !== 6 || /[^0-9a-fA-F]/.test(s)) return null
  const n = parseInt(s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface MData { bytes: Uint8Array; src: string; bg: number[] | null; invert: boolean; strip: number[][] | null }
async function merchantData(mid: string): Promise<MData> {
  let bg: number[] | null = null, invert = false, strip: number[][] | null = null
  try {
    const r = await fetch(`${SB_URL}/rest/v1/merchants?id=eq.${encodeURIComponent(mid)}&select=logo_base64,logo_url,brand`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    })
    if (r.ok) {
      const [row] = await r.json()
      if (row?.brand && typeof row.brand === 'object') {
        bg = hexToRgbArr(row.brand.bg1)
        invert = row.brand.logo_invert === true
        if (Array.isArray(row.brand.strip) && row.brand.strip.length >= 2) {
          const c1 = hexToRgbArr(row.brand.strip[0]), c2 = hexToRgbArr(row.brand.strip[1])
          if (c1 && c2) strip = [c1, c2]
        }
      }
      const m = String(row?.logo_base64 || '').match(/^data:image\/(png|jpe?g);base64,(.+)$/)
      if (m) { const b = b64Try(m[2]); if (isPng(b) || isJpg(b)) return { bytes: b!, src: 'base64', bg, invert, strip } }
      const url = String(row?.logo_url || '')
      if (/^https:\/\//i.test(url) && !url.includes('/functions/v1/logo-maraz')) {
        try {
          const lr = await fetch(url)
          if (lr.ok) {
            const buf = new Uint8Array(await lr.arrayBuffer())
            if (isPng(buf) || isJpg(buf)) return { bytes: buf, src: 'url', bg, invert, strip }
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return { bytes: FALLBACK, src: 'procedural', bg, invert, strip }
}

function whiteInvert(img: Image): Image {
  const w = img.width, h = img.height
  const out = new Image(w, h)
  const src = img.bitmap, dst = out.bitmap
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]
      const a = Math.round((255 - lum) * (src[i + 3] / 255))
      dst[i] = 255; dst[i + 1] = 255; dst[i + 2] = 255; dst[i + 3] = a
      if (a > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
    }
  }
  if (maxX <= minX || maxY <= minY) return out
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.04)
  const cx = Math.max(0, minX - pad), cy = Math.max(0, minY - pad)
  return out.crop(cx, cy, Math.min(w - cx, maxX - minX + 2 * pad), Math.min(h - cy, maxY - minY + 2 * pad))
}

async function renderLogo(d: MData, g: boolean): Promise<Uint8Array> {
  try {
    let img = await Image.decode(d.bytes)
    if (d.invert) img = whiteInvert(img)
    if (g) {
      const side = Math.ceil(Math.hypot(img.width, img.height) * 1.12)
      const canvas = new Image(side, side)
      if (d.bg) canvas.fill(((d.bg[0] << 24) | (d.bg[1] << 16) | (d.bg[2] << 8) | 0xFF) >>> 0)
      canvas.composite(img, Math.round((side - img.width) / 2), Math.round((side - img.height) / 2))
      return await canvas.encode()
    }
    return await img.encode()
  } catch {
    return isPng(d.bytes) ? d.bytes : FALLBACK
  }
}

// Bande Apple Wallet : dégradé horizontal symétrique c1 -> c2 -> c1 (1125x369)
async function renderStrip(c1: number[], c2: number[]): Promise<Uint8Array> {
  const W = 1125, H = 369
  const raw = new Uint8Array(H * (1 + W * 3))
  const rowPx = new Uint8Array(W * 3)
  for (let x = 0; x < W; x++) {
    const t = x / (W - 1)
    const k = 1 - Math.abs(2 * t - 1)
    rowPx[x * 3] = Math.round(c1[0] + (c2[0] - c1[0]) * k)
    rowPx[x * 3 + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * k)
    rowPx[x * 3 + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * k)
  }
  for (let y = 0; y < H; y++) {
    const off = y * (1 + W * 3)
    raw[off] = 0
    raw.set(rowPx, off + 1)
  }
  return rawToPng(raw, W, H, false)
}

const CACHE = new Map<string, { bytes: Uint8Array; src: string; at: number }>()

Deno.serve(async (req) => {
  const u = new URL(req.url)
  const mid = u.searchParams.get('m') || MARAZ_ID
  const g = u.searchParams.has('g')
  const wantStrip = u.searchParams.has('strip')
  const key = mid + (g ? ':g' : '') + (wantStrip ? ':s' : '')
  let entry = CACHE.get(key)
  if (!entry || Date.now() - entry.at > 5 * 60 * 1000) {
    const d = await merchantData(mid)
    let bytes: Uint8Array
    let src: string
    if (wantStrip) {
      if (!d.strip) {
        if (u.searchParams.has('meta')) return new Response(JSON.stringify({ strip: false }), { headers: { 'Content-Type': 'application/json' } })
        return new Response('pas de bande pour ce marchand', { status: 404 })
      }
      bytes = await renderStrip(d.strip[0], d.strip[1])
      src = 'strip'
    } else {
      bytes = await renderLogo(d, g)
      src = d.src
    }
    entry = { bytes, src, at: Date.now() }
    CACHE.set(key, entry)
  }
  if (u.searchParams.has('meta')) {
    return new Response(JSON.stringify({ bytes: entry.bytes.length, src: entry.src, g, sig: isPng(entry.bytes) }), { headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(entry.bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(entry.bytes.length),
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
