// ============================================================
// MySargal — logo-mysargal : sert le logo MySargal en PNG sur une URL
// stable (emails, documents, partenaires).
//   ?size=2x | 3x   (défaut : 2x, bon compromis pour l'email)
// Source : table apple_pass_assets (logo / logo@2x / logo@3x)
// ============================================================
const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const isPng = (b: Uint8Array | null) => !!b && b.length > 100 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
function b64Try(b: string): Uint8Array | null {
  try { return Uint8Array.from(atob(String(b || '').replace(/\s/g, '')), (c) => c.charCodeAt(0)) } catch { return null }
}

const CACHE = new Map<string, { bytes: Uint8Array; at: number }>()

async function load(name: string): Promise<Uint8Array | null> {
  const hit = CACHE.get(name)
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.bytes
  try {
    const r = await fetch(`${SB_URL}/rest/v1/apple_pass_assets?select=b64&name=eq.${encodeURIComponent(name)}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    })
    if (!r.ok) return null
    const rows = await r.json()
    const b = b64Try(rows?.[0]?.b64 || '')
    if (isPng(b)) { CACHE.set(name, { bytes: b!, at: Date.now() }); return b }
  } catch { /* ignore */ }
  return null
}

Deno.serve(async (req) => {
  const size = new URL(req.url).searchParams.get('size') || '2x'
  const order = size === '3x' ? ['logo@3x', 'logo@2x', 'logo']
              : size === '1x' ? ['logo', 'logo@2x', 'logo@3x']
              : ['logo@2x', 'logo@3x', 'logo']
  for (const n of order) {
    const bytes = await load(n)
    if (bytes) {
      return new Response(bytes, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(bytes.length),
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
  }
  return new Response('logo indisponible', { status: 404 })
})
