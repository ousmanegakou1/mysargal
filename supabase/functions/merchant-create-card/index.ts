import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const onlyDigits = (p) => String(p || '').replace(/\D/g, '')
const genCode = () => 'LC-' + [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='
  const bin = atob(s); const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out
}
async function verifyJwt(token, secret) {
  try {
    const [h, p, sig] = token.split('.'); if (!h || !p || !sig) return null
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`))
    if (!ok) return null
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)))
    if (claims.exp && Number(claims.exp) * 1000 < Date.now()) return null
    return claims
  } catch (_) { return null }
}

// Envoi du message de bienvenue + JOURNALISATION (whatsapp_logs) pour diagnostic.
// L'erreur exacte de Meta est rangée dans le champ message quand l'envoi échoue.
async function sendWelcome(sb, ctx, phone, name, brand, cardUrl, welcome) {
  const digits = onlyDigits(phone)
  const to = '+' + digits
  // On range l'identifiant Meta (wamid) : c'est lui qui permet au webhook de
  // rattacher ensuite l'accuse de livraison (delivered / read / failed).
  const log = async (status, provider, note, wamid) => {
    try { await sb.from('whatsapp_logs').insert({ merchant_id: ctx?.merchant_id || null, card_id: ctx?.card_id || null, to_phone: to, template: 'welcome', message: String(note || 'Carte creee').slice(0, 280), status, provider, wa_message_id: wamid || null }) } catch (_) {}
  }
  if (digits.length < 8) { await log('failed', 'none', 'numero invalide'); return { ok: false } }
  const TOKEN = Deno.env.get('WA_TOKEN'); const PHONE_ID = Deno.env.get('WA_PHONE_ID')
  if (TOKEN && PHONE_ID) {
    try {
      const payload = { messaging_product: 'whatsapp', to: digits, type: 'template', template: { name: 'carte_fidelite', language: { code: 'fr' }, components: [{ type: 'body', parameters: [{ type: 'text', text: name }, { type: 'text', text: brand }, { type: 'text', text: cardUrl }] }] } }
      const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const txt = await r.text()
      if (r.ok) {
        let wamid = null
        try { wamid = JSON.parse(txt)?.messages?.[0]?.id || null } catch (_) {}
        await log('sent', 'wa-cloud', 'carte_fidelite', wamid)
        return { ok: true, provider: 'wa-cloud', wamid }
      }
      await log('failed', 'wa-cloud', `carte_fidelite ${r.status} ${txt}`)
    } catch (e) { await log('failed', 'wa-cloud', 'exc ' + (e?.message || e)) }
  } else {
    await log('failed', 'none', 'WA_TOKEN/PHONE_ID manquant')
  }
  const wa = Deno.env.get('WASENDER_API_KEY')
  if (wa) {
    try {
      const r = await fetch('https://wasenderapi.com/api/send-message', { method: 'POST', headers: { Authorization: `Bearer ${wa}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: digits, text: `Bienvenue chez ${brand} ! Ta carte de fidelite est prete${welcome > 0 ? ` (+${welcome} points de bienvenue)` : ''} :\n${cardUrl}` }) })
      const txt = await r.text()
      if (r.ok) { await log('sent', 'wasender', 'fallback'); return { ok: true, provider: 'wasender' } }
      await log('failed', 'wasender', `${r.status} ${txt}`)
    } catch (e) { await log('failed', 'wasender', 'exc ' + (e?.message || e)) }
  }
  return { ok: false }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const secret = Deno.env.get('MS_JWT_SECRET') || ''
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    const claims = tok ? await verifyJwt(tok, secret) : null
    if (!claims) return json({ error: 'Session invalide - reconnecte-toi' }, 401)

    const b = await req.json().catch(() => ({}))
    const merchant_id = String(b.merchant_id || '').trim()
    const name = String(b.name || '').trim().slice(0, 80)
    if (!merchant_id) return json({ error: 'merchant_id requis' }, 400)
    if (!name) return json({ error: 'Nom requis' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
    const { data: m } = await sb.from('merchants').select('id,name,phone,parent_id,reward_config,plan_expires,active,card_validity_months').eq('id', merchant_id).single()
    if (!m) return json({ error: 'Boutique introuvable' }, 404)
    if (m.active === false) return json({ error: 'Boutique indisponible' }, 403)

    let autorise = false
    if (claims.ms_admin === 'true' || claims.impersonated_by === 'admin') autorise = true
    if (!autorise && claims.phone) {
      const tel = onlyDigits(claims.phone)
      if (onlyDigits(m.phone) === tel) autorise = true
      else if (m.parent_id) {
        const { data: mere } = await sb.from('merchants').select('phone').eq('id', m.parent_id).single()
        if (mere && onlyDigits(mere.phone) === tel) autorise = true
      }
    }
    if (!autorise) return json({ error: 'Non autorise pour cette boutique' }, 403)

    if (m.plan_expires && new Date(m.plan_expires).getTime() < Date.now()) {
      return json({ error: 'Abonnement expire' }, 402)
    }

    const phoneDigits = onlyDigits(b.phone)
    const clientPhone = phoneDigits.length >= 8 ? '+' + phoneDigits : null

    if (clientPhone) {
      const orFilter = `client_phone.eq.${clientPhone},client_phone.eq.${phoneDigits},client_phone_raw.eq.${clientPhone},client_phone_raw.eq.${phoneDigits}`
      const { data: ex } = await sb.from('loyalty_cards').select('id,code,created_at,client_phone_mask').eq('merchant_id', merchant_id).or(orFilter).order('created_at', { ascending: true }).limit(1)
      if (ex && ex[0]) {
        return json({ success: true, already: true, card: ex[0], card_url: `https://mysargal.com/c/?code=${ex[0].code}` })
      }
    }

    let code = genCode()
    for (let i = 0; i < 5; i++) { const { data: dup } = await sb.from('loyalty_cards').select('id').eq('code', code).limit(1); if (!dup || !dup.length) break; code = genCode() }

    const cfg = (m.reward_config || {})
    const welcome = Math.max(0, Math.min(parseInt(cfg.welcome || cfg.welcome_bonus || 0) || 0, 1000))

    // Validite de la carte : duree definie par la boutique (0 = pas d expiration).
    // A l echeance, une tache quotidienne remet les points actifs a zero.
    const validite = Math.max(0, Math.min(parseInt(m.card_validity_months) || 0, 120))
    let expiresAt = null
    if (validite > 0) { const d = new Date(); d.setMonth(d.getMonth() + validite); expiresAt = d.toISOString() }

    const { data: ins, error } = await sb.from('loyalty_cards').insert({
      merchant_id, code, client_name: name,
      client_phone: clientPhone, client_phone_raw: clientPhone,
      design_url: b.design_url || null, design_name: b.design_name || 'green',
      pts: welcome, lifetime_pts: welcome, tier: 'bronze', active: true, whatsapp_opt_in: true,
      expires_at: expiresAt,
    }).select('id,code,created_at,client_phone_mask,expires_at').single()
    if (error || !ins) return json({ error: 'Creation impossible : ' + (error?.message || 'insertion refusee') }, 500)

    if (welcome > 0) {
      try { await sb.from('transactions').insert({ card_id: ins.id, merchant_id, pts: welcome, type: 'earn', note: 'Bonus de bienvenue', source: 'welcome' }) } catch (_) {}
    }

    const ref = String(b.referrer_code || '').trim().toUpperCase()
    if (ref) {
      try { await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/apply-referral`, { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant_id, referrer_code: ref, referee_code: ins.code }) }) } catch (_) {}
    }

    const cardUrl = `https://mysargal.com/c/?code=${ins.code}`
    let waSent = false
    if (clientPhone) { try { const w = await sendWelcome(sb, { merchant_id, card_id: ins.id }, clientPhone, name, m.name || 'MySargal', cardUrl, welcome); waSent = !!(w && w.ok) } catch (_) {} }

    return json({ success: true, already: false, card: ins, card_url: cardUrl, welcome, wa_sent: waSent, merchant: { name: m.name } })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
})
