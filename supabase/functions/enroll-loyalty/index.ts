// MySargal — enroll-loyalty : auto-inscription fidélité par le client (OTP WhatsApp → carte créée).
// Body : { merchant_id, name } ; Auth : Bearer <JWT OTP>. Envoi de bienvenue : carte_fidelite (officiel) + repli WaSender.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')
const genCode = () => 'LC-' + [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
function b64urlDecode(s: string): Uint8Array { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out }
async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> { try { const [h, p, sig] = token.split('.'); if (!h || !p || !sig) return null; const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']); const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`)); if (!ok) return null; const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p))); if (claims.exp && claims.exp * 1000 < Date.now()) return null; return claims } catch (_) { return null } }

async function sendWelcome(phone: string, name: string, brand: string, cardUrl: string, welcome: number) {
  const TOKEN = Deno.env.get('WA_TOKEN'); const PHONE_ID = Deno.env.get('WA_PHONE_ID')
  if (TOKEN && PHONE_ID) {
    try {
      const payload = { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: 'carte_fidelite', language: { code: 'fr' }, components: [ { type: 'body', parameters: [ { type: 'text', text: name }, { type: 'text', text: brand }, { type: 'text', text: cardUrl } ] } ] } }
      const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (r.ok) return
      console.error('carte_fidelite officiel échec:', r.status, await r.text())
    } catch (e) { console.error('carte_fidelite exception:', (e as Error).message) }
  }
  const wa = Deno.env.get('WASENDER_API_KEY')
  if (wa) { try { await fetch('https://wasenderapi.com/api/send-message', { method: 'POST', headers: { Authorization: `Bearer ${wa}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, text: `🎉 Bienvenue chez *${brand}* !\n\nTa carte de fidélité est prête${welcome > 0 ? ` (+${welcome} points de bienvenue 🎁)` : ''} :\n${cardUrl}` }) }) } catch (_) {} }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const secret = Deno.env.get('MS_JWT_SECRET')!
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const claims = await verifyJwt(tok, secret)
    if (!claims || claims.iss !== 'mysargal' || !claims.phone) return json({ error: "Vérifie d'abord ton numéro par OTP" }, 401)
    const phone = digits(claims.phone)
    if (phone.length < 8) return json({ error: 'Numéro invalide' }, 400)
    const b = await req.json().catch(() => ({}))
    const merchant_id = String(b.merchant_id || '').trim()
    const name = String(b.name || '').trim().slice(0, 60) || 'Client'
    if (!merchant_id) return json({ error: 'Boutique manquante' }, 400)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: merchant } = await sb.from('merchants').select('id,name,emoji,reward_config,active').eq('id', merchant_id).single()
    if (!merchant) return json({ error: 'Boutique introuvable' }, 404)
    if (merchant.active === false) return json({ error: 'Boutique indisponible' }, 403)
    const orFilter = `client_phone.eq.+${phone},client_phone.eq.${phone},client_phone_raw.eq.+${phone},client_phone_raw.eq.${phone}`
    const { data: cards } = await sb.from('loyalty_cards').select('id,code').eq('merchant_id', merchant_id).or(orFilter).order('created_at', { ascending: true }).limit(1)
    if (cards && cards[0]) { return json({ success: true, already: true, card_code: cards[0].code, card_url: `https://mysargal.com/c/?code=${cards[0].code}`, merchant: { name: merchant.name, emoji: merchant.emoji } }) }
    let code = genCode()
    for (let i = 0; i < 4; i++) { const { data: ex } = await sb.from('loyalty_cards').select('id').eq('code', code).limit(1); if (!ex || !ex.length) break; code = genCode() }
    const cfg = (merchant.reward_config || {}) as Record<string, any>
    const welcome = Math.max(0, Math.min(parseInt(cfg.welcome || cfg.welcome_bonus || 0) || 0, 1000))
    const tier = welcome >= 50 ? 'silver' : 'bronze'
    const { data: ins, error } = await sb.from('loyalty_cards').insert({ merchant_id, code, client_name: name, client_phone: `+${phone}`, client_phone_raw: `+${phone}`, pts: welcome, lifetime_pts: welcome, tier, active: true, whatsapp_opt_in: true }).select('id,code').single()
    if (error || !ins) return json({ error: 'Création impossible: ' + (error?.message || '') }, 500)
    if (welcome > 0) { await sb.from('transactions').insert({ card_id: ins.id, merchant_id, pts: welcome, type: 'earn', note: 'Bonus de bienvenue', source: 'welcome' }) }
    const cardUrl = `https://mysargal.com/c/?code=${ins.code}`
    await sendWelcome(phone, name, merchant.name, cardUrl, welcome)
    return json({ success: true, already: false, card_code: ins.code, card_url: cardUrl, welcome, merchant: { name: merchant.name, emoji: merchant.emoji } })
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
