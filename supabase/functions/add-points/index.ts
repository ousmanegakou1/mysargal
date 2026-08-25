// ============================================================
// MySargal - Edge Function : add-points
// + ABONNEMENT : blocage si essai/abonnement expire (plan_expires)
// + Wallet : sync Google + Apple apres chaque scan
// + BOOST : jours points x2 (reward_config.boost_until / boost_x)
// + NOTIF points credites (opt-in reward_config.notify_points, template officiel + repli WaSender)
// + MARAZ SUMMIT CLUB : ledger 24 mois glissants + reevaluation tier + notif tier_changed
//   (zero-regression : ne s'active que si le marchand a des sargal_tiers configures)
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ok  = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const bad = (m: string, s = 400) => ok({ error: m }, s)
const onlyDigits = (p: unknown) => String(p || '').replace(/\D/g, '')
const firstName = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || 'toi'
const WA_TOKEN = Deno.env.get('WA_TOKEN')
const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID')

async function sendTpl(digits: string, tpl: string, params: string[], code: string): Promise<boolean> {
  if (!WA_TOKEN || !WA_PHONE_ID || digits.length < 8) return false
  const bodyComp = { type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }
  const btnComp = { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] }
  const post = async (withBtn: boolean) => {
    const components = withBtn ? [bodyComp, btnComp] : [bodyComp]
    const payload = { messaging_product: 'whatsapp', to: digits, type: 'template', template: { name: tpl, language: { code: 'fr' }, components } }
    const r = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await r.json().catch(() => ({}))
    return { okr: r.ok, d }
  }
  try {
    let { okr, d } = await post(true)
    if (!okr && (d as any)?.error?.code === 132018) { ({ okr } = await post(false)) }
    return okr
  } catch (_) { return false }
}

async function notifyPoints(sb: any, phone: string, name: string, added: number, brand: string, total: number, code: string) {
  const digits = onlyDigits(phone)
  let sent = false
  if (digits.length >= 8) {
    sent = await sendTpl(digits, 'points_credites', [firstName(name), String(added), brand, String(total)], code)
    if (!sent) {
      const wa = Deno.env.get('WASENDER_API_KEY')
      if (wa) { try { const r = await fetch('https://wasenderapi.com/api/send-message', { method: 'POST', headers: { Authorization: `Bearer ${wa}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: digits, text: `+${added} points chez ${brand}. Nouveau solde : ${total} points.\nTa carte : https://mysargal.com/c/?code=${code}` }) }); sent = r.ok } catch (_) {} }
    }
  }
  try { await sb.from('whatsapp_logs').insert({ merchant_id: null, card_id: null, to_phone: '+' + digits, template: 'points', message: `+${added} pts`, status: sent ? 'sent' : 'failed', provider: sent ? 'official' : 'none' }) } catch (_) {}
}

async function notifyTierChanged(sb: any, phone: string, name: string, tierName: string, brand: string, code: string) {
  const digits = onlyDigits(phone)
  let sent = false
  if (digits.length >= 8) {
    sent = await sendTpl(digits, 'tier_changed', [firstName(name), tierName, brand], code)
    if (!sent) {
      const wa = Deno.env.get('WASENDER_API_KEY')
      if (wa) {
        try {
          const r = await fetch('https://wasenderapi.com/api/send-message', {
            method: 'POST',
            headers: { Authorization: `Bearer ${wa}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: digits, text: `Felicitations ${firstName(name)}, vous accedez au niveau ${tierName} chez ${brand}.` }),
          })
          sent = r.ok
        } catch (_) {}
      }
    }
  }
  try { await sb.from('whatsapp_logs').insert({ merchant_id: null, card_id: null, to_phone: '+' + digits, template: 'tier_changed', message: `tier -> ${tierName}`, status: sent ? 'sent' : 'failed', provider: sent ? 'official' : 'none' }) } catch (_) {}
  return sent
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json()
    const { card_code, merchant_id, note, source, cashier_id, amount_fcfa } = body
    let { pts } = body

    if (!card_code || !merchant_id) return bad('card_code et merchant_id requis')

    const { data: card, error: cardErr } = await sb.from('loyalty_cards')
      .select('id,pts,lifetime_pts,client_name,client_phone,tier,tier_id,whatsapp_opt_in,last_scan_at,client_birthday')
      .eq('code', card_code).eq('merchant_id', merchant_id).single()
    if (cardErr || !card) return bad('Carte introuvable', 404)

    const { data: merchant } = await sb.from('merchants')
      .select('name,threshold,reward_desc,scan_cooldown_min,daily_points_cap,reward_config,plan,plan_expires')
      .eq('id', merchant_id).single()

    // --- ABONNEMENT : blocage si l'essai/abonnement est expire ---
    if (merchant?.plan_expires && new Date(merchant.plan_expires).getTime() < Date.now()) {
      return bad('Abonnement expire - renouvelle ton acces MySargal pour continuer a scanner.', 402)
    }

    const rewardCfg = (merchant?.reward_config || {}) as Record<string, any>

    // --- Conversion amount_fcfa -> pts si le caller n'a pas passe pts (MARAZ ratio) ---
    if ((pts === undefined || pts === null) && amount_fcfa !== undefined && amount_fcfa !== null) {
      const ratio = Number(rewardCfg.point_ratio_fcfa || 0)
      const rounding = String(rewardCfg.point_rounding || '')
      if (ratio > 0) {
        const amt = Number(amount_fcfa) || 0
        if (rounding === 'floor_10k') {
          const floored = Math.floor(amt / ratio) * ratio
          pts = Math.floor(floored / ratio)
        } else {
          pts = Math.floor(amt / ratio)
        }
      }
    }

    if (!pts || pts < 1) return bad('pts requis (ou amount_fcfa avec ratio configure)')

    const isBonus = source === 'welcome' || source === 'birthday'
    const cooldownMin = Number(merchant?.scan_cooldown_min || 0)
    const dailyCap = Number(merchant?.daily_points_cap || 0)

    if (!isBonus && cooldownMin > 0 && card.last_scan_at) {
      const diffMin = (Date.now() - new Date(card.last_scan_at).getTime()) / 60000
      if (diffMin < cooldownMin) {
        const rem = Math.ceil(cooldownMin - diffMin)
        return bad(`Carte deja scannee - reessaie dans ${rem} min`, 429)
      }
    }

    if (!isBonus && dailyCap > 0) {
      try {
        const startOfDay = new Date().toISOString().slice(0, 10) + 'T00:00:00Z'
        const { data: todays } = await sb.from('transactions')
          .select('pts').eq('merchant_id', merchant_id).eq('type', 'earn').gte('created_at', startOfDay)
        const usedToday = (todays || []).reduce((s: number, t: any) => s + (t.pts || 0), 0)
        if (usedToday + pts > dailyCap) return bad(`Plafond du jour atteint (${dailyCap} pts)`, 429)
      } catch (_) { /* si created_at absent, on n'enforce pas */ }
    }

    // --- BOOST points x2 (jours promo configures par le marchand) ---
    let boostX = 1
    if (!isBonus && rewardCfg.boost_until && new Date(rewardCfg.boost_until).getTime() > Date.now()) {
      boostX = Math.min(Math.max(Number(rewardCfg.boost_x || 2), 1), 5)
    }
    const earned = Math.round(pts * boostX)

    let birthdayBonus = 0
    if (!isBonus && card.client_birthday && Number(rewardCfg.birthday || 0) > 0) {
      try {
        const todayMMDD = new Date().toISOString().slice(5, 10)
        const bdayMMDD = String(card.client_birthday).slice(5, 10)
        if (todayMMDD === bdayMMDD) {
          const startOfDay = new Date().toISOString().slice(0, 10) + 'T00:00:00Z'
          const { data: already } = await sb.from('transactions')
            .select('id').eq('card_id', card.id).eq('source', 'birthday').gte('created_at', startOfDay).limit(1)
          if (!already || already.length === 0) birthdayBonus = Number(rewardCfg.birthday)
        }
      } catch (_) { birthdayBonus = 0 }
    }

    const totalAdd = earned + birthdayBonus
    const newPts = (card.pts || 0) + totalAdd
    const newLifetime = (card.lifetime_pts || 0) + totalAdd
    const newTier = newLifetime >= 500 ? 'platinum' : newLifetime >= 200 ? 'gold' : newLifetime >= 50 ? 'silver' : 'bronze'

    await sb.from('loyalty_cards')
      .update({ pts: newPts, lifetime_pts: newLifetime, tier: newTier, last_scan_at: new Date().toISOString() })
      .eq('id', card.id)

    try { fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-google-pass?code=${encodeURIComponent(card_code)}`, { method: 'POST' }).catch(() => {}) } catch (_) {}
    try { fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-apple-pass?code=${encodeURIComponent(card_code)}`, { method: 'POST' }).catch(() => {}) } catch (_) {}

    await sb.from('transactions').insert({
      card_id: card.id, merchant_id, pts: earned, type: 'earn',
      note: (note || 'Achat') + (boostX > 1 ? ` (x${boostX})` : ''),
      source: source || 'manual', cashier_id: cashier_id || null,
    })
    if (birthdayBonus > 0) {
      await sb.from('transactions').insert({
        card_id: card.id, merchant_id, pts: birthdayBonus, type: 'earn', note: 'Bonus anniversaire', source: 'birthday', cashier_id: cashier_id || null,
      })
    }

    // --- MARAZ SUMMIT CLUB : ledger 24 mois + reevaluation tier ---
    // Zero regression : on ne fait rien si le marchand n'a aucun tier configure.
    let sargalTierChanged: any = null
    try {
      const { data: tiersExist } = await sb.from('sargal_tiers').select('id').eq('merchant_id', merchant_id).limit(1)
      if (tiersExist && tiersExist.length > 0 && totalAdd > 0) {
        // Insert dans le ledger glissant
        try {
          await sb.from('sargal_points').insert({
            merchant_id,
            card_id: card.id,
            delta: totalAdd,
            reason: note || 'Achat',
            source: source || 'scan',
            earned_at: new Date().toISOString(),
          })
        } catch (_) {}

        const prevTierId = card.tier_id || null
        // Reevaluation via RPC SQL
        const { data: rpcRes } = await sb.rpc('reevaluate_tier', { p_card_id: card.id })
        const newTierId = (rpcRes as any) || null

        if (newTierId && newTierId !== prevTierId) {
          try {
            const { data: newTierRow } = await sb.from('sargal_tiers')
              .select('id,name,color_hex,min_points,max_points,benefits_json')
              .eq('id', newTierId).single()
            if (newTierRow && card.whatsapp_opt_in && card.client_phone) {
              try { await notifyTierChanged(sb, card.client_phone, card.client_name, newTierRow.name, merchant?.name || 'MySargal', card_code) } catch (_) {}
            }
            sargalTierChanged = newTierRow || { id: newTierId }
          } catch (_) {}
        }
      }
    } catch (_) { /* Zero regression : jamais bloquant */ }

    // --- NOTIF points credites (opt-in) ---
    if (!isBonus && rewardCfg.notify_points === true && card.whatsapp_opt_in && card.client_phone) {
      try { await notifyPoints(sb, card.client_phone, card.client_name, totalAdd, merchant?.name || 'MySargal', newPts, card_code) } catch (_) {}
    }

    const threshold = merchant?.threshold || 10
    const rewardReady = newPts >= threshold
    const justUnlocked = rewardReady && (card.pts || 0) < threshold

    let tierUnlocked: any = null
    try {
      const tiers = Array.isArray(rewardCfg.tiers) ? rewardCfg.tiers : []
      for (const t of tiers) {
        if ((card.pts || 0) < t.at && newPts >= t.at) {
          if (!tierUnlocked || t.at > tierUnlocked.at) tierUnlocked = t
        }
      }
    } catch (_) { /* ignore */ }

    return ok({
      success: true, card_code, pts_added: earned, boost_x: boostX > 1 ? boostX : null, birthday_bonus: birthdayBonus,
      pts_total: newPts, lifetime_pts: newLifetime, tier: newTier,
      reward_ready: rewardReady, just_unlocked: justUnlocked, reward_desc: merchant?.reward_desc,
      tier_unlocked: tierUnlocked,
      sargal_tier_changed: sargalTierChanged,
    })
  } catch (e: any) { return bad('Erreur: ' + e.message, 500) }
})
