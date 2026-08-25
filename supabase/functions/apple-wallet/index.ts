// ============================================================
// MySargal — apple-wallet : Web Service Apple Wallet (PassKit)
// Les iPhones s'enregistrent ici quand le pass est ajouté au Wallet,
// et viennent récupérer la version à jour après un push APNs.
// Endpoints implémentés (spéc Apple) :
//   POST   /v1/devices/:did/registrations/:passType/:serial
//   DELETE /v1/devices/:did/registrations/:passType/:serial
//   GET    /v1/devices/:did/registrations/:passType?passesUpdatedSince=tag
//   GET    /v1/passes/:passType/:serial
//   POST   /v1/log
// ============================================================
const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const JWT_SECRET = Deno.env.get('MS_JWT_SECRET') || ''

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })

async function passAuthToken(code: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('applepass:' + code)))
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40)
}
async function authed(req: Request, serial: string): Promise<boolean> {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^ApplePass\s+(.+)$/i)
  if (!m) return false
  return m[1].trim() === await passAuthToken(serial)
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    // chemin après le nom de la fonction
    const parts = url.pathname.split('/').filter(Boolean) // [functions? v1? apple-wallet, v1, ...]
    const i = parts.indexOf('apple-wallet')
    const p = parts.slice(i + 1) // ex: ['v1','devices',did,'registrations',passType,serial]

    // ── POST /v1/log ──
    if (req.method === 'POST' && p[1] === 'log') {
      try { console.log('PassKit log:', JSON.stringify(await req.json())) } catch (_) {}
      return new Response(null, { status: 200 })
    }

    // ── GET /v1/passes/:passType/:serial ──
    if (req.method === 'GET' && p[1] === 'passes' && p[3]) {
      const serial = decodeURIComponent(p[3]).toUpperCase()
      if (!await authed(req, serial)) return new Response(null, { status: 401 })
      const r = await fetch(`${SB_URL}/functions/v1/get-apple-pass?code=${encodeURIComponent(serial)}`)
      if (!r.ok) return new Response(null, { status: r.status === 404 ? 404 : 500 })
      const bytes = new Uint8Array(await r.arrayBuffer())
      return new Response(bytes, { headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Last-Modified': new Date().toUTCString(),
        'Cache-Control': 'no-store',
      } })
    }

    // ── /v1/devices/:did/registrations/:passType[/:serial] ──
    if (p[1] === 'devices' && p[3] === 'registrations') {
      const did = decodeURIComponent(p[2])
      const serial = p[5] ? decodeURIComponent(p[5]).toUpperCase() : null

      // GET : liste des passes mis à jour pour cet appareil
      if (req.method === 'GET' && !serial) {
        const since = url.searchParams.get('passesUpdatedSince')
        let q = `${SB_URL}/rest/v1/apple_pass_registrations?device_library_id=eq.${encodeURIComponent(did)}&select=code,updated_at`
        const rows = await fetch(q, { headers: H }).then((r) => r.ok ? r.json() : [])
        let list = rows || []
        if (since) {
          const ts = Number(since)
          if (!isNaN(ts)) list = list.filter((r: any) => new Date(r.updated_at).getTime() > ts)
        }
        if (!list.length) return new Response(null, { status: 204 })
        const last = Math.max(...list.map((r: any) => new Date(r.updated_at).getTime()))
        return json({ lastUpdated: String(last), serialNumbers: list.map((r: any) => r.code) })
      }

      if (!serial) return new Response(null, { status: 400 })
      if (!await authed(req, serial)) return new Response(null, { status: 401 })

      // POST : enregistrement de l'appareil pour ce pass
      if (req.method === 'POST') {
        let pushToken = ''
        try { pushToken = (await req.json()).pushToken || '' } catch (_) {}
        if (!pushToken) return new Response(null, { status: 400 })
        const existing = await fetch(`${SB_URL}/rest/v1/apple_pass_registrations?device_library_id=eq.${encodeURIComponent(did)}&code=eq.${encodeURIComponent(serial)}&select=code`, { headers: H }).then((r) => r.ok ? r.json() : [])
        const r = await fetch(`${SB_URL}/rest/v1/apple_pass_registrations`, {
          method: 'POST',
          headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ device_library_id: did, code: serial, push_token: pushToken }),
        })
        if (!r.ok) return new Response(null, { status: 500 })
        return new Response(null, { status: (existing && existing.length) ? 200 : 201 })
      }

      // DELETE : désenregistrement (pass retiré du Wallet)
      if (req.method === 'DELETE') {
        await fetch(`${SB_URL}/rest/v1/apple_pass_registrations?device_library_id=eq.${encodeURIComponent(did)}&code=eq.${encodeURIComponent(serial)}`, { method: 'DELETE', headers: H })
        return new Response(null, { status: 200 })
      }
    }

    return new Response(null, { status: 404 })
  } catch (e) {
    console.error('apple-wallet:', (e as Error).message)
    return new Response(null, { status: 500 })
  }
})
