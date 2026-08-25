// ============================================================
// MySargal — send-push v7 : notification aux clients d'une boutique
//
// verify_jwt = false : la passerelle ne filtre pas, car le panneau marchand
// présente un JWT maison (HS256, secret MS_JWT_SECRET). L'authentification
// se fait ici, dans authorize(), par l'un des trois moyens :
//   • x-api-key                     → clé partenaire (api_partners)
//   • Authorization: Bearer <jwt>   → session marchande (claim `phone`)
//   • body.api_key                  → clé de la boutique (panel marchand)
//
// v7 : deux canaux de livraison selon l'appareil.
//   • navigateurs → protocole Web Push, signé VAPID, sans contenu
//     (le service worker vient chercher le message)
//   • app native  → service de notification Expo, contenu transmis
//     directement, jusqu'à 100 appareils par requête
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const SB_URL = Deno.env.get('SUPABASE_URL')!
const sb = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const SUBJECT = Deno.env.get('MS_VAPID_SUBJECT') || 'mailto:hello@mysargal.com'
const JWT_SECRET = Deno.env.get('MS_JWT_SECRET') || ''
const RATE_PER_HOUR = 6
const EXPO_API = 'https://exp.host/--/api/v2/push/send'
const enc = new TextEncoder()
const digits = (s: unknown) => String(s || '').replace(/[^0-9]/g, '')

const estExpo = (e: string) => /^Expo(nent)?PushToken\[.+\]$/.test(e)

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function verifySessionJwt(token: string): Promise<Record<string, any> | null> {
  if (!JWT_SECRET) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const key = await crypto.subtle.importKey('raw', enc.encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const okSig = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), enc.encode(parts[0] + '.' + parts[1]))
    if (!okSig) return null
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])))
    if (claims.exp && Number(claims.exp) < Math.floor(Date.now() / 1000)) return null
    return claims
  } catch { return null }
}

async function loadVapid(): Promise<{ publicKey: string; key: CryptoKey } | null> {
  const { data } = await sb.from('app_keys').select('value').eq('name', 'vapid').maybeSingle()
  const v = data?.value
  if (!v?.public_key || !v?.private_jwk) return null
  const key = await crypto.subtle.importKey('jwk', v.private_jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  return { publicKey: v.public_key as string, key }
}

async function vapidJwt(aud: string, key: CryptoKey): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64url(enc.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT,
  })))
  const data = `${header}.${payload}`
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(data))
  return `${data}.${b64url(sig)}`
}

async function byApiKey(k: string): Promise<string | null> {
  if (!k) return null
  const { data } = await sb.from('api_partners').select('merchant_id,active').eq('api_key', k.trim()).maybeSingle()
  if (!data || data.active === false) return null
  return String(data.merchant_id)
}

async function authorize(req: Request, body: any, wanted: string | null): Promise<{ merchantId: string } | { error: string; status: number }> {
  const headerKey = req.headers.get('x-api-key') || new URL(req.url).searchParams.get('key') || ''
  const bodyKey = typeof body?.api_key === 'string' ? body.api_key : ''
  for (const k of [headerKey, bodyKey]) {
    if (!k) continue
    const mid = await byApiKey(k)
    if (mid) {
      if (wanted && wanted !== mid) return { error: 'Boutique non autorisée', status: 403 }
      return { merchantId: mid }
    }
    if (k === headerKey && k) return { error: 'Clé API invalide', status: 401 }
  }

  const auth = req.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return { error: 'Authentification requise', status: 401 }

  const claims = await verifySessionJwt(token)
  if (!claims) return { error: 'Session expirée — déconnectez-vous puis reconnectez-vous', status: 401 }

  const sessionPhone = digits(claims.phone)
  if (!sessionPhone) return { error: 'Session ancienne — déconnectez-vous puis reconnectez-vous', status: 401 }

  if (wanted) {
    const { data: m } = await sb.from('merchants').select('id,phone').eq('id', wanted).maybeSingle()
    if (!m) return { error: 'Boutique introuvable', status: 404 }
    if (digits(m.phone) !== sessionPhone) return { error: 'Boutique non autorisée', status: 403 }
    return { merchantId: String(m.id) }
  }

  const { data: mine } = await sb.from('merchants').select('id,phone')
  const found = (mine || []).find((m: any) => digits(m.phone) === sessionPhone)
  if (!found) return { error: 'Aucune boutique pour ce numéro', status: 403 }
  return { merchantId: String(found.id) }
}

/** Envoi groupé vers les appareils natifs, par paquets de 100. */
async function envoyerExpo(
  jetons: { id: string; endpoint: string }[],
  payload: { title: string; body: string; url: string },
): Promise<{ sent: number; failed: number; gone: string[] }> {
  let sent = 0, failed = 0
  const gone: string[] = []

  for (let i = 0; i < jetons.length; i += 100) {
    const lot = jetons.slice(i, i + 100)
    const messages = lot.map((t) => ({
      to: t.endpoint,
      title: payload.title,
      body: payload.body,
      sound: 'default',
      data: { url: payload.url },
      channelId: 'default',
    }))
    try {
      const r = await fetch(EXPO_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      })
      const d = await r.json().catch(() => null)
      const tickets = Array.isArray(d?.data) ? d.data : []
      lot.forEach((t, k) => {
        const ticket = tickets[k]
        if (ticket?.status === 'ok') { sent++; return }
        failed++
        // Jeton périmé : l'app a été désinstallée, on nettoie.
        if (ticket?.details?.error === 'DeviceNotRegistered') gone.push(t.endpoint)
      })
    } catch {
      failed += lot.length
    }
  }
  return { sent, failed, gone }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json().catch(() => ({}))
    const title = String(b.title || '').trim().slice(0, 80)
    if (!title) return json({ success: false, error: 'Titre requis' }, 400)
    const body = String(b.body || '').trim().slice(0, 180)
    const link = String(b.url || '').trim().slice(0, 300)

    const auth = await authorize(req, b, b.merchant_id ? String(b.merchant_id) : null)
    if ('error' in auth) return json({ success: false, error: auth.error }, auth.status)
    const merchantId = auth.merchantId

    const { data: merchant } = await sb.from('merchants').select('id,name').eq('id', merchantId).maybeSingle()
    if (!merchant) return json({ success: false, error: 'Marchand introuvable' }, 404)

    const since = new Date(Date.now() - 3600_000).toISOString()
    const { data: recent } = await sb.from('push_messages').select('id').eq('merchant_id', merchantId).gte('created_at', since)
    if ((recent?.length || 0) >= RATE_PER_HOUR) {
      return json({ success: false, error: 'Trop de notifications cette heure-ci. Réessayez plus tard.' }, 429)
    }

    // Uniquement les appareils clients réellement joignables
    const { data: subs } = await sb.from('push_subscriptions')
      .select('id,endpoint')
      .eq('merchant_id', merchantId)
      .eq('audience', 'client')
      .not('endpoint', 'is', null)
    if (!subs || !subs.length) return json({ success: true, sent: 0, failed: 0, note: 'aucun abonné' })

    const url = link || 'https://mysargal.com/client-app/'
    const payload = { title, body, url, merchant: merchant.name }

    const { data: msg } = await sb.from('push_messages').insert({
      merchant_id: merchantId, title, body: body || null, url: link || null,
    }).select('id').single()

    const natifs = subs.filter((s) => estExpo(s.endpoint))
    const web = subs.filter((s) => !estExpo(s.endpoint))

    let sent = 0, failed = 0
    const gone: string[] = []

    // ── Appareils natifs ──
    if (natifs.length) {
      const r = await envoyerExpo(natifs, { title, body, url })
      sent += r.sent; failed += r.failed; gone.push(...r.gone)
      const ids = natifs.map((s) => s.id)
      if (ids.length) {
        await sb.from('push_subscriptions')
          .update({ last_push_at: new Date().toISOString(), failures: 0 }).in('id', ids)
      }
    }

    // ── Navigateurs ──
    if (web.length) {
      const vapid = await loadVapid()
      if (!vapid) return json({ success: false, error: 'Clés VAPID absentes' }, 500)
      for (const s of web) {
        try {
          await sb.from('push_subscriptions').update({ pending: payload }).eq('id', s.id)
          const u = new URL(s.endpoint)
          const jwt = await vapidJwt(`${u.protocol}//${u.host}`, vapid.key)
          const r = await fetch(s.endpoint, {
            method: 'POST',
            headers: {
              TTL: '86400', Urgency: 'normal', 'Content-Length': '0',
              Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
            },
          })
          if (r.status === 404 || r.status === 410) { gone.push(s.endpoint); failed++ }
          else if (r.ok || r.status === 201 || r.status === 202) {
            sent++
            await sb.from('push_subscriptions').update({ last_push_at: new Date().toISOString(), failures: 0 }).eq('id', s.id)
          } else { failed++ }
        } catch (_) { failed++ }
      }
    }

    if (gone.length) {
      await sb.from('push_subscriptions').delete().in('endpoint', gone).eq('audience', 'client')
    }
    if (msg?.id) await sb.from('push_messages').update({ sent_count: sent, failed_count: failed }).eq('id', msg.id)

    return json({ success: true, sent, failed, total: subs.length, natifs: natifs.length, web: web.length })
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500)
  }
})
