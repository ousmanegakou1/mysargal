// ============================================================
// MySargal — giftcard-find : retrouve la/les carte(s) cadeau d'un client par son
// numéro, puis envoie un OTP WhatsApp au client pour confirmer l'encaissement.
// Ne révèle jamais le code complet.
//
// v2 — SÉCURITÉ. La version précédente n'exigeait aucune authentification et
// acceptait le merchant_id fourni dans le corps de la requête. N'importe qui
// pouvait donc demander « ce numéro a-t-il une carte chez ce commerçant ? »,
// obtenir le nom du porteur et son solde, et déclencher l'envoi d'un WhatsApp.
// Désormais :
//   • une authentification est obligatoire (clé partenaire ou session marchande)
//   • le merchant_id du corps doit correspondre à la boutique authentifiée
//   • une boutique fille est acceptée si son enseigne mère est authentifiée
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')
const enc = new TextEncoder()
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const JWT_SECRET = Deno.env.get('MS_JWT_SECRET') || ''

async function sha256hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(s))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function b64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
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
async function byApiKey(k: string): Promise<string | null> {
  if (!k) return null
  const { data } = await sb.from('api_partners').select('merchant_id,active').eq('api_key', k.trim()).maybeSingle()
  if (!data || data.active === false || !data.merchant_id) return null
  return String(data.merchant_id)
}

// Autorise l'accès à `wanted`. Renvoie la boutique retenue, ou une erreur.
async function autoriser(req: Request, body: any, wanted: string): Promise<{ merchantId: string } | { error: string; status: number }> {
  const headerKey = req.headers.get('x-api-key') || ''
  const bodyKey = typeof body?.api_key === 'string' ? body.api_key : ''
  for (const k of [headerKey, bodyKey]) {
    if (!k) continue
    const mid = await byApiKey(k)
    if (mid) {
      if (wanted && wanted !== mid) return { error: 'Boutique non autorisée', status: 403 }
      return { merchantId: mid }
    }
    if (k === headerKey) return { error: 'Clé API invalide', status: 401 }
  }

  const auth = req.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return { error: 'Authentification requise', status: 401 }
  const claims = await verifySessionJwt(token)
  if (!claims) return { error: 'Session expirée — déconnectez-vous puis reconnectez-vous', status: 401 }
  const sessionPhone = digits(claims.phone)
  if (!sessionPhone) return { error: 'Session ancienne — déconnectez-vous puis reconnectez-vous', status: 401 }

  const { data: m } = await sb.from('merchants').select('id,phone,parent_id').eq('id', wanted).maybeSingle()
  if (!m) return { error: 'Boutique introuvable', status: 404 }
  if (digits(m.phone) === sessionPhone) return { merchantId: String(m.id) }
  // boutique fille : l'enseigne mère peut l'administrer
  if (m.parent_id) {
    const { data: p } = await sb.from('merchants').select('phone').eq('id', m.parent_id).maybeSingle()
    if (p && digits(p.phone) === sessionPhone) return { merchantId: String(m.id) }
  }
  return { error: 'Boutique non autorisée', status: 403 }
}

async function sendOtp(phone: string, code: string): Promise<boolean> {
  const TOKEN = Deno.env.get('WA_TOKEN'); const PHONE_ID = Deno.env.get('WA_PHONE_ID')
  if (TOKEN && PHONE_ID) {
    try {
      const payload = { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: 'code_otp', language: { code: 'fr' }, components: [ { type: 'body', parameters: [{ type: 'text', text: code }] }, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] } ] } }
      const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (r.ok) return true
    } catch (_) {}
  }
  const wa = Deno.env.get('WASENDER_API_KEY')
  if (wa) { try { const r = await fetch('https://wasenderapi.com/api/send-message', { method: 'POST', headers: { Authorization: `Bearer ${wa}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, text: `🔐 *${code}* est ton code MySargal pour valider ta carte cadeau. Il expire dans 5 minutes.` }) }); return r.ok } catch (_) {} }
  return false
}

const mask = (code: string) => { const s = String(code || ''); return s.length <= 4 ? s : s.slice(0, 3) + '•••' + s.slice(-2) }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json().catch(() => ({}))
    const phone = digits(b.phone)
    const merchant_id = String(b.merchant_id || '').trim()
    if (phone.length < 8) return json({ error: 'Numéro invalide' }, 400)
    if (!merchant_id) return json({ error: 'Commerçant manquant' }, 400)

    // Authentification AVANT toute lecture : sans elle, la réponse trouvé/pas trouvé
    // renseignerait un inconnu sur la clientèle du commerçant.
    const a = await autoriser(req, b, merchant_id)
    if ('error' in a) return json({ error: a.error }, a.status)
    const boutique = a.merchantId

    const { data: cards } = await sb.from('gift_cards').select('id,code,balance,expires_at,recipient_name')
      .eq('status', 'active').gt('balance', 0)
      .or(`merchant_id.eq.${boutique},merchant_id.is.null`)
      .or(`recipient_phone.eq.+${phone},recipient_phone.eq.${phone}`)
      .order('created_at', { ascending: true }).limit(5)
    if (!cards || cards.length === 0) return json({ found: false })

    // Rate limit OTP (3/h) — protège le client du harcèlement par SMS
    const since = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await sb.from('client_otps').select('id', { count: 'exact', head: true }).eq('phone', phone).gte('created_at', since)
    if ((count || 0) >= 3) return json({ error: 'Trop de demandes de code. Réessaie dans une heure.' }, 429)

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const code_hash = await sha256hex(phone + ':' + code)
    const expires_at = new Date(Date.now() + 5 * 60_000).toISOString()
    await sb.from('client_otps').insert({ phone, code_hash, expires_at })
    const sent = await sendOtp(phone, code)
    if (!sent) return json({ error: "Impossible d'envoyer le code au client" }, 502)

    const total = cards.reduce((s: number, c: any) => s + Number(c.balance || 0), 0)
    return json({ found: true, otp_sent: true, count: cards.length, total_balance: total, name: cards[0].recipient_name || null, cards: cards.map((c: any) => ({ masked: mask(c.code), balance: Number(c.balance || 0) })) })
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
