// ============================================================
// MySargal — push-subscribe v3
//   GET                      → { public_key }
//   POST                     → abonne l'appareil à toutes ses boutiques
//        { endpoint, keys:{p256dh,auth}, cards:[codes] | card_code }
//   POST ?pending=1          → { endpoint } → message en attente
//   POST ?remove=1           → { endpoint } → désinscription complète
//
// v3 : accepte deux sortes d'appareils.
//   • navigateurs  → endpoint = URL https du service de notification
//   • app native   → endpoint = jeton Expo, de la forme ExponentPushToken[…]
// Le reste du mécanisme est identique : une ligne par (appareil, boutique).
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

/** Un endpoint valide est soit une URL https, soit un jeton Expo. */
function endpointValide(e: string): boolean {
  return e.startsWith('https://') || /^Expo(nent)?PushToken\[.+\]$/.test(e)
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function vapidPublicKey(): Promise<string> {
  const { data } = await sb.from('app_keys').select('value').eq('name', 'vapid').maybeSingle()
  if (data?.value?.public_key) return data.value.public_key as string
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pubRaw = await crypto.subtle.exportKey('raw', pair.publicKey)
  const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const publicKey = b64url(pubRaw)
  await sb.from('app_keys').upsert({ name: 'vapid', value: { public_key: publicKey, private_jwk: privJwk } })
  return publicKey
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = new URL(req.url)
    if (req.method === 'GET') return json({ public_key: await vapidPublicKey() })

    const b = await req.json().catch(() => ({}))
    const endpoint = String(b.endpoint || '').trim()
    if (!endpointValide(endpoint)) return json({ success: false, error: 'endpoint invalide' }, 400)

    if (url.searchParams.has('remove')) {
      await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
      return json({ success: true })
    }

    if (url.searchParams.has('pending')) {
      const { data: rows } = await sb.from('push_subscriptions')
        .select('id,pending').eq('endpoint', endpoint).not('pending', 'is', null).limit(1)
      const row = rows && rows[0]
      if (!row) return json({ success: true, message: null })
      await sb.from('push_subscriptions').update({ pending: null }).eq('id', row.id)
      return json({ success: true, message: row.pending })
    }

    // Codes de cartes à rattacher
    const codes: string[] = []
    if (Array.isArray(b.cards)) for (const c of b.cards) { const s = String(c || '').trim().toUpperCase(); if (s) codes.push(s) }
    if (b.card_code) { const s = String(b.card_code).trim().toUpperCase(); if (s && !codes.includes(s)) codes.push(s) }

    // Résout les marchands correspondants
    const merchants = new Map<string, string>() // merchant_id -> card_code
    if (codes.length) {
      const { data: cards } = await sb.from('loyalty_cards').select('code,merchant_id').in('code', codes.slice(0, 40))
      for (const c of cards || []) if (c.merchant_id) merchants.set(String(c.merchant_id), c.code)
    }
    if (b.merchant_id) merchants.set(String(b.merchant_id), codes[0] || '')

    if (!merchants.size) return json({ success: false, error: 'aucune boutique liée à cet appareil' }, 400)

    const keys = b.keys || {}
    const subJson = JSON.stringify({ endpoint, keys, platform: b.platform || 'web' })
    const rows = [...merchants.entries()].map(([mid, code]) => ({
      endpoint,
      subscription: subJson,
      p256dh: keys.p256dh || null,
      auth: keys.auth || null,
      merchant_id: mid,
      card_code: code || null,
      audience: 'client',
      failures: 0,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await sb.from('push_subscriptions').upsert(rows, { onConflict: 'endpoint,merchant_id' })
    if (error) return json({ success: false, error: error.message }, 500)
    return json({ success: true, merchants: rows.length })
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500)
  }
})
