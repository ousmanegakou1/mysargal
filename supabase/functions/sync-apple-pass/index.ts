// ============================================================
// MySargal — sync-apple-pass : prévient les iPhones qu'un pass a changé.
// Appel : POST .../sync-apple-pass?code=LC-XXXX  (fire-and-forget)
// 1. bump updated_at des enregistrements du pass
// 2. push APNs (vide) → l'iPhone vient rechercher le pass à jour
// Secrets requis : APPLE_APNS_KEY (contenu du fichier .p8), APPLE_APNS_KEY_ID
// (+ APPLE_TEAM_ID déjà en place)
// ============================================================
const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TEAM_ID = Deno.env.get('APPLE_TEAM_ID') || '6779DNV7Y5'
const PASS_TYPE = Deno.env.get('APPLE_PASS_TYPE_ID') || 'pass.com.mysargal.app'
const APNS_KEY_RAW = Deno.env.get('APPLE_APNS_KEY') || ''
const APNS_KEY_ID = Deno.env.get('APPLE_APNS_KEY_ID') || ''

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })

function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let bin = ''
  for (const x of b) bin += String.fromCharCode(x)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cachedJwt: { tok: string; exp: number } | null = null
async function apnsJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.exp > Date.now()) return cachedJwt.tok
  // .p8 → PKCS8 DER
  let pem = APNS_KEY_RAW.replace(/\\n/g, '\n').trim()
  const body = (pem.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/) || [])[1] || pem
  const der = Uint8Array.from(atob(body.replace(/[^A-Za-z0-9+/=]/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }))
  const payload = b64url(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) }))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`)))
  const tok = `${header}.${payload}.${b64url(sig)}`
  cachedJwt = { tok, exp: Date.now() + 45 * 60 * 1000 }
  return tok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' } })
  try {
    const code = (new URL(req.url).searchParams.get('code') || '').trim().toUpperCase()
    if (!code) return json({ error: 'code requis' }, 400)

    // 1. bump updated_at (pour GET registrations passesUpdatedSince)
    await fetch(`${SB_URL}/rest/v1/apple_pass_registrations?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    })

    // 2. récupérer les appareils enregistrés
    const regs = await fetch(`${SB_URL}/rest/v1/apple_pass_registrations?code=eq.${encodeURIComponent(code)}&select=device_library_id,push_token`, { headers: H }).then((r) => r.ok ? r.json() : [])
    if (!regs || !regs.length) return json({ success: true, pushed: 0, note: 'aucun appareil enregistré' })

    if (!APNS_KEY_RAW || !APNS_KEY_ID) return json({ success: false, pushed: 0, error: 'APNs non configuré (APPLE_APNS_KEY / APPLE_APNS_KEY_ID)' })

    const jwt = await apnsJwt()
    let pushed = 0, gone = 0
    await Promise.all(regs.map(async (reg: any) => {
      try {
        const r = await fetch(`https://api.push.apple.com/3/device/${reg.push_token}`, {
          method: 'POST',
          headers: { authorization: `bearer ${jwt}`, 'apns-topic': PASS_TYPE, 'apns-push-type': 'background', 'apns-priority': '10' },
          body: '{}',
        })
        if (r.ok) pushed++
        else if (r.status === 410 || r.status === 400) {
          // token mort → nettoyage
          gone++
          await fetch(`${SB_URL}/rest/v1/apple_pass_registrations?device_library_id=eq.${encodeURIComponent(reg.device_library_id)}&code=eq.${encodeURIComponent(code)}`, { method: 'DELETE', headers: H })
        } else {
          console.warn('APNs', r.status, await r.text())
        }
      } catch (e) { console.warn('APNs err:', (e as Error).message) }
    }))
    return json({ success: true, pushed, cleaned: gone })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
