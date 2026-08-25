// MySargal — api-order v11 : webhook e-commerce universel. Crédite les points à chaque commande payée.
// Identification par téléphone (WhatsApp) ou, à défaut, par email.
// Le canal email est optionnel par marchand (merchants.email_enabled).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')
const genCode = () => 'LC-' + [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
const firstName = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || 'Client'
const WA_TOKEN = Deno.env.get('WA_TOKEN'); const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID')
const isEmail = (e: unknown) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim())
function normPhone(raw: unknown): string {
  let d = digits(raw); if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9 && d.startsWith('7')) return '221' + d
  if (d.length === 10 && d.startsWith('0')) return '225' + d
  return d
}
async function sendCard(phone: string, name: string, brand: string, cardUrl: string): Promise<boolean> {
  if (WA_TOKEN && WA_PHONE_ID) {
    try {
      const payload = { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: 'carte_fidelite', language: { code: 'fr' }, components: [ { type: 'body', parameters: [ { type: 'text', text: name }, { type: 'text', text: brand }, { type: 'text', text: cardUrl } ] } ] } }
      const r = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (r.ok) return true
    } catch (_) {}
  }
  const wa = Deno.env.get('WASENDER_API_KEY')
  if (wa) { try { await fetch('https://wasenderapi.com/api/send-message', { method: 'POST', headers: { Authorization: `Bearer ${wa}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, text: `🎉 Bienvenue chez *${brand}* !\n\nTa carte de fidélité : ${cardUrl}` }) }); return true } catch (_) {} }
  return false
}
async function sendCardByEmail(to: string, name: string, merchantName: string, merchantId: string, cardUrl: string, brand: unknown, points: number): Promise<boolean> {
  try {
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-card-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, client_name: name, merchant_name: merchantName, merchant_id: merchantId, card_url: cardUrl, brand, points, kind: 'loyalty' }),
    })
    const d = await r.json().catch(() => ({}))
    return r.ok && d?.success === true
  } catch (_) { return false }
}
async function sendPoints(phone: string, name: string, points: number, brand: string, total: number, code: string) {
  if (WA_TOKEN && WA_PHONE_ID) {
    const bodyComp = { type: 'body', parameters: [ { type: 'text', text: name }, { type: 'text', text: String(points) }, { type: 'text', text: brand }, { type: 'text', text: String(total) } ] }
    const btnComp = { type: 'button', sub_type: 'url', index: '0', parameters: [ { type: 'text', text: code } ] }
    const post = async (withBtn: boolean) => {
      const components = withBtn ? [bodyComp, btnComp] : [bodyComp]
      const payload = { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: 'points_credites', language: { code: 'fr' }, components } }
      const r = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await r.json().catch(() => ({})); return { okr: r.ok, d }
    }
    try { let { okr, d } = await post(true); if (!okr && (d as any)?.error?.code === 132018) { ({ okr } = await post(false)) }; if (okr) return } catch (_) {}
  }
  const wa = Deno.env.get('WASENDER_API_KEY')
  if (wa) { try { await fetch('https://wasenderapi.com/api/send-message', { method: 'POST', headers: { Authorization: `Bearer ${wa}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, text: `🎉 +${points} points chez *${brand}* ! Solde : ${total} points.\nhttps://mysargal.com/c/?code=${code}` }) }) } catch (_) {} }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = new URL(req.url)
    const apiKey = req.headers.get('x-api-key') || url.searchParams.get('key') || ''
    if (!apiKey) return json({ error: 'Clé API manquante' }, 401)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: partner } = await sb.from('api_partners').select('id,name,merchant_id,active').eq('api_key', apiKey).single()
    if (!partner) return json({ error: 'Clé API invalide' }, 401)
    if (!partner.active) return json({ error: 'Clé API désactivée' }, 401)

    const b = await req.json().catch(() => ({}))

    // Identité de l'opérateur, déclarée par le système de caisse du commerçant
    // (login Odoo, matricule, session POS). MySargal ne peut pas la vérifier :
    // elle vient de chez eux. On la conserve telle quelle, bornée en longueur.
    const coupe = (v: unknown, n: number) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null }
    const opRef  = coupe(b.operator_ref  ?? b.user_login ?? b.cashier_id, 80)
    const opName = coupe(b.operator_name ?? b.user_name  ?? b.cashier_name, 80)
    const opSrc  = coupe(b.operator_src, 40) ?? (opRef ? 'Caisse externe' : null)

    let phoneRaw: unknown = '', name = '', amount = 0, orderId = '', points: number | null = null, emailRaw: unknown = ''
    if (b.total_price !== undefined || b.checkout_token !== undefined) {
      phoneRaw = b.customer?.phone || b.billing_address?.phone || b.shipping_address?.phone || b.phone
      emailRaw = b.customer?.email || b.email || b.contact_email
      name = [b.customer?.first_name, b.customer?.last_name].filter(Boolean).join(' ') || b.billing_address?.name || ''
      amount = parseFloat(b.total_price || '0') || 0
      orderId = String(b.order_number || b.id || '')
    } else if (b.billing !== undefined && b.total !== undefined) {
      if (String(b.status || '').match(/^(pending|cancelled|refunded|failed|trash)$/)) return json({ success: true, skipped: 'statut ' + b.status })
      phoneRaw = b.billing?.phone
      emailRaw = b.billing?.email
      name = [b.billing?.first_name, b.billing?.last_name].filter(Boolean).join(' ')
      amount = parseFloat(b.total || '0') || 0
      orderId = String(b.number || b.id || '')
    } else {
      phoneRaw = b.phone; emailRaw = b.email
      name = String(b.name || '').slice(0, 60); amount = Number(b.amount || 0) || 0; orderId = String(b.order_id || '')
      if (b.points !== undefined) points = Math.max(0, Math.min(parseInt(b.points) || 0, 100000))
    }

    const phone = normPhone(phoneRaw)
    const email = isEmail(emailRaw) ? String(emailRaw).trim().toLowerCase() : ''
    const hasPhone = phone.length >= 10
    if (!hasPhone && !email) {
      return json({ success: true, skipped: 'ni numéro ni email exploitable', phone_recu: String(phoneRaw || '').slice(0, 20) })
    }

    const { data: merchant } = await sb.from('merchants').select('id,name,brand,email_enabled,pts_amount_mode,pts_fcfa_per_point,reward_config,plan,plan_expires,threshold,reward_desc').eq('id', partner.merchant_id).single()
    if (!merchant) return json({ error: 'Marchand introuvable' }, 404)
    if (merchant.plan_expires && new Date(merchant.plan_expires).getTime() < Date.now()) return json({ success: false, error: 'Abonnement MySargal expiré' })
    const emailEnabled = merchant.email_enabled !== false

    const noteBase = orderId ? `Commande #${orderId}` : `Commande en ligne`
    if (orderId) {
      const { data: dup } = await sb.from('transactions').select('id').eq('merchant_id', merchant.id).eq('source', 'ecommerce').like('note', noteBase + '%').limit(1)
      if (dup && dup.length) return json({ success: true, duplicate: true, order_id: orderId })
    }

    let card: any = null
    if (hasPhone) {
      const orFilter = `client_phone.eq.+${phone},client_phone.eq.${phone},client_phone_raw.eq.+${phone},client_phone_raw.eq.${phone}`
      const { data: cards } = await sb.from('loyalty_cards').select('id,code,pts,lifetime_pts,client_name,client_email').eq('merchant_id', merchant.id).or(orFilter).order('created_at', { ascending: true }).limit(1)
      card = cards && cards[0]
    }
    if (!card && email) {
      const { data: cards } = await sb.from('loyalty_cards').select('id,code,pts,lifetime_pts,client_name,client_email').eq('merchant_id', merchant.id).ilike('client_email', email).order('created_at', { ascending: true }).limit(1)
      card = cards && cards[0]
    }

    let newClient = false
    if (!card) {
      newClient = true
      let code = genCode()
      for (let i = 0; i < 3; i++) { const { data: ex } = await sb.from('loyalty_cards').select('id').eq('code', code).limit(1); if (!ex || !ex.length) break; code = genCode() }
      const row: Record<string, unknown> = {
        merchant_id: merchant.id, code, client_name: name || 'Client en ligne',
        pts: 0, lifetime_pts: 0, tier: 'bronze', active: true,
      }
      if (hasPhone) { row.client_phone = `+${phone}`; row.client_phone_raw = `+${phone}`; row.whatsapp_opt_in = true }
      if (email) { row.client_email = email }
      const { data: ins, error: insErr } = await sb.from('loyalty_cards').insert(row).select('id,code,pts,lifetime_pts,client_name,client_email').single()
      if (insErr || !ins) return json({ error: 'Création de carte impossible: ' + (insErr?.message || '') }, 500)
      card = ins
    } else if (email && !card.client_email) {
      try { await sb.from('loyalty_cards').update({ client_email: email }).eq('id', card.id) } catch (_) {}
    }

    let pts = points !== null ? points : 0
    if (points === null) {
      if (merchant.pts_amount_mode && Number(merchant.pts_fcfa_per_point) > 0 && amount > 0) pts = Math.floor(amount / Number(merchant.pts_fcfa_per_point))
      else pts = 1
    }
    const cfg = (merchant.reward_config || {}) as Record<string, any>
    let boostX = 1
    if (cfg.boost_until && new Date(cfg.boost_until).getTime() > Date.now()) boostX = Math.min(Math.max(Number(cfg.boost_x || 2), 1), 5)
    const earned = Math.round(pts * boostX)

    let newPts = card.pts || 0, newLifetime = card.lifetime_pts || 0
    if (earned > 0) {
      newPts += earned; newLifetime += earned
      const newTier = newLifetime >= 500 ? 'platinum' : newLifetime >= 200 ? 'gold' : newLifetime >= 50 ? 'silver' : 'bronze'
      await sb.from('loyalty_cards').update({ pts: newPts, lifetime_pts: newLifetime, tier: newTier, last_scan_at: new Date().toISOString() }).eq('id', card.id)
      await sb.from('transactions').insert({ card_id: card.id, merchant_id: merchant.id, pts: earned, type: 'earn', note: noteBase + (boostX > 1 ? ` (x${boostX} 🔥)` : ''), source: 'ecommerce', amount_fcfa: amount || null, operator_ref: opRef, operator_name: opName, operator_src: opSrc })
      // --- MARAZ SUMMIT CLUB : ledger 24 mois glissants + reevaluation du statut (zero-regression) ---
      try {
        const { data: tiersExist } = await sb.from('sargal_tiers').select('id').eq('merchant_id', merchant.id).limit(1)
        if (tiersExist && tiersExist.length > 0) {
          try { await sb.from('sargal_points').insert({ merchant_id: merchant.id, card_id: card.id, delta: earned, reason: noteBase, source: 'ecommerce', earned_at: new Date().toISOString() }) } catch (_) {}
          try { await sb.rpc('reevaluate_tier', { p_card_id: card.id }) } catch (_) {}
        }
      } catch (_) { /* jamais bloquant */ }
      try { fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-google-pass?code=${encodeURIComponent(card.code)}`, { method: 'POST' }).catch(() => {}) } catch (_) {}
      try { fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-apple-pass?code=${encodeURIComponent(card.code)}`, { method: 'POST' }).catch(() => {}) } catch (_) {}
    }

    const cardUrl = `https://mysargal.com/c/?code=${card.code}`
    let sentBy: string | null = null
    if (newClient) {
      if (hasPhone) { try { if (await sendCard(phone, firstName(name), merchant.name, cardUrl)) sentBy = 'whatsapp' } catch (_) {} }
      if (!sentBy && email && emailEnabled) {
        try { if (await sendCardByEmail(email, firstName(name), merchant.name, String(merchant.id), cardUrl, merchant.brand, newPts)) sentBy = 'email' } catch (_) {}
      }
    } else if (earned > 0 && cfg.notify_points === true && hasPhone) {
      try { await sendPoints(phone, firstName(card.client_name), earned, merchant.name, newPts, card.code); sentBy = 'whatsapp' } catch (_) {}
    }

    return json({ success: true, card_code: card.code, card_url: cardUrl, client: card.client_name, new_client: newClient, points_added: earned, boost_x: boostX > 1 ? boostX : null, total_points: newPts, order_id: orderId || null, sent_by: sentBy })
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
