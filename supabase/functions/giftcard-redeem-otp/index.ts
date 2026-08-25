// MySargal — giftcard-redeem-otp : débite une carte cadeau retrouvée par NUMÉRO, après vérif OTP.
// Body : { merchant_id, phone, code (OTP), amount, note }. Débit atomique via RPC redeem_gift_card_srv.
//
// v2 — SÉCURITÉ. Le merchant_id venait du corps de la requête sans vérification :
// le débit pouvait donc être imputé à n'importe quelle boutique. L'authentification
// est désormais exigée et le merchant_id doit correspondre à la session.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')
const enc = new TextEncoder()
const JWT_SECRET = Deno.env.get('MS_JWT_SECRET') || ''
async function sha256hex(s: string): Promise<string> { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('') }

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
async function autoriser(sb: any, req: Request, body: any, wanted: string): Promise<{ merchantId: string } | { error: string; status: number }> {
  const headerKey = req.headers.get('x-api-key') || ''
  const bodyKey = typeof body?.api_key === 'string' ? body.api_key : ''
  for (const k of [headerKey, bodyKey]) {
    if (!k) continue
    const { data } = await sb.from('api_partners').select('merchant_id,active').eq('api_key', k.trim()).maybeSingle()
    if (data && data.active !== false && data.merchant_id) {
      if (wanted !== String(data.merchant_id)) return { error: 'Boutique non autorisée', status: 403 }
      return { merchantId: String(data.merchant_id) }
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
  if (m.parent_id) {
    const { data: p } = await sb.from('merchants').select('phone').eq('id', m.parent_id).maybeSingle()
    if (p && digits(p.phone) === sessionPhone) return { merchantId: String(m.id) }
  }
  return { error: 'Boutique non autorisée', status: 403 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json().catch(() => ({}))
    const phone = digits(b.phone)
    const otp = String(b.code || '').replace(/\D/g, '')
    const merchant_id = String(b.merchant_id || '').trim()
    const amount = Number(b.amount)
    const note = String(b.note || 'Encaissement').slice(0, 120)
    if (phone.length < 8 || otp.length < 4) return json({ error: 'Code invalide' }, 400)
    if (!merchant_id) return json({ error: 'Commerçant manquant' }, 400)
    if (!Number.isFinite(amount) || amount < 1) return json({ error: 'Montant invalide' }, 400)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 0) Authentification : le débit doit être imputé à une boutique prouvée.
    const a = await autoriser(sb, req, b, merchant_id)
    if ('error' in a) return json({ error: a.error }, a.status)
    const boutique = a.merchantId

    // 1) Vérifier l'OTP
    const { data: rows } = await sb.from('client_otps').select('id,code_hash,expires_at,attempts,used').eq('phone', phone).eq('used', false).order('created_at', { ascending: false }).limit(1)
    const o = rows && rows[0]
    if (!o) return json({ error: 'Aucun code en attente — redemande un code' }, 400)
    if (o.attempts >= 5) return json({ error: 'Trop d’essais — redemande un code' }, 429)
    if (new Date(o.expires_at).getTime() < Date.now()) return json({ error: 'Code expiré — redemande un code' }, 400)
    const hash = await sha256hex(phone + ':' + otp)
    if (hash !== o.code_hash) { await sb.from('client_otps').update({ attempts: o.attempts + 1 }).eq('id', o.id); return json({ error: 'Code incorrect' }, 401) }

    // 2) Retrouver la carte (même requête que giftcard-find)
    const { data: cards } = await sb.from('gift_cards').select('id,code,balance')
      .eq('status', 'active').gt('balance', 0)
      .or(`merchant_id.eq.${boutique},merchant_id.is.null`)
      .or(`recipient_phone.eq.+${phone},recipient_phone.eq.${phone}`)
      .order('created_at', { ascending: true }).limit(5)
    if (!cards || cards.length === 0) return json({ error: 'Aucune carte active pour ce numéro' }, 404)
    const card = cards.find((c: any) => Number(c.balance) >= amount) || cards[0]
    if (Number(card.balance) < amount) return json({ error: `Solde insuffisant (${Number(card.balance)} disponible)` }, 400)

    // 3) Consommer l'OTP puis débiter atomiquement (RPC serveur, autorisé par merchant_id)
    await sb.from('client_otps').update({ used: true }).eq('id', o.id)
    const { data: res, error: rpcErr } = await sb.rpc('redeem_gift_card_srv', { p_code: card.code, p_amount: amount, p_merchant_id: boutique, p_note: note })
    if (rpcErr || !res || res.ok === false) return json({ error: (res && res.error) || rpcErr?.message || 'Encaissement refusé' }, 400)
    return json({ ok: true, code: card.code, new_balance: res.new_balance, status: res.status })
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
