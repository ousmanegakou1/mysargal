// ============================================================
// MySargal - cron-reevaluate-tiers
// Batch reevaluation des tiers pour tous les marchands qui ont configure
// des sargal_tiers. Renouvellement annuel : si un tier n'est plus atteint
// depuis > 365 jours, on retrograde explicitement.
//
// Deploy via supabase functions deploy cron-reevaluate-tiers;
// schedule nightly via pg_cron ou Supabase Scheduled Functions.
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
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

async function notifyTierChanged(sb: any, phone: string, name: string, tierName: string, brand: string, code: string): Promise<boolean> {
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

    // 1) Liste des marchands ayant des tiers configures
    const { data: tierMerchants } = await sb.from('sargal_tiers').select('merchant_id')
    const merchantIds = Array.from(new Set((tierMerchants || []).map((t: any) => t.merchant_id))).filter(Boolean)

    let processed = 0
    let upgraded = 0
    let downgraded = 0
    let notified = 0
    const errors: string[] = []

    if (merchantIds.length === 0) {
      return json({ success: true, processed, upgraded, downgraded, notified, errors, note: 'aucun marchand avec sargal_tiers' })
    }

    // Cache noms marchands
    const { data: merchantsRows } = await sb.from('merchants').select('id,name').in('id', merchantIds)
    const merchantNameById = new Map<string, string>((merchantsRows || []).map((m: any) => [m.id, m.name || 'MySargal']))

    // Cache tiers par marchand
    const { data: allTiers } = await sb.from('sargal_tiers').select('id,merchant_id,name,min_points,max_points,priority').in('merchant_id', merchantIds)
    const tiersById = new Map<string, any>((allTiers || []).map((t: any) => [t.id, t]))

    // 2) Iterer les cartes par batches de 500
    const batchSize = 500
    let offset = 0
    while (true) {
      const { data: cards, error: cardsErr } = await sb.from('loyalty_cards')
        .select('id,code,client_name,client_phone,whatsapp_opt_in,merchant_id,tier_id,active_points,tier_last_evaluated_at')
        .in('merchant_id', merchantIds)
        .order('id', { ascending: true })
        .range(offset, offset + batchSize - 1)
      if (cardsErr) { errors.push('cards fetch: ' + cardsErr.message); break }
      if (!cards || cards.length === 0) break

      for (const card of cards) {
        try {
          const prevTierId = card.tier_id || null
          const brand = merchantNameById.get(card.merchant_id) || 'MySargal'

          const { data: newTierId } = await sb.rpc('reevaluate_tier', { p_card_id: card.id })
          processed++

          const newT = newTierId ? tiersById.get(newTierId) : null
          const oldT = prevTierId ? tiersById.get(prevTierId) : null
          const oldPri = oldT?.priority ?? 0
          const newPri = newT?.priority ?? 0

          if (newTierId && newTierId !== prevTierId) {
            if (newPri > oldPri) upgraded++
            else if (newPri < oldPri) downgraded++
            if (card.whatsapp_opt_in && card.client_phone && newT) {
              const sent = await notifyTierChanged(sb, card.client_phone, card.client_name, newT.name, brand, card.code)
              if (sent) notified++
            }
          }

          // 3) Renouvellement annuel : si carte est sur un tier paye mais active_points sous le floor du tier
          //    (recalcule apres l'appel RPC ci-dessus, on relit la carte pour l'etat actuel)
          const { data: reread } = await sb.from('loyalty_cards')
            .select('active_points,tier_id,tier_last_evaluated_at')
            .eq('id', card.id).single()
          if (reread && reread.tier_id) {
            const currentTier = tiersById.get(reread.tier_id)
            if (currentTier && currentTier.min_points > 0 && (reread.active_points || 0) < currentTier.min_points) {
              // Chercher le tier atteint le plus haut sous le seuil
              const merchantTiers = (allTiers || []).filter((t: any) => t.merchant_id === card.merchant_id)
              let target: any = null
              for (const t of merchantTiers) {
                if ((t.min_points || 0) <= (reread.active_points || 0)) {
                  if (!target || (t.priority || 0) > (target.priority || 0)) target = t
                }
              }
              const targetId = target ? target.id : null
              if (targetId !== reread.tier_id) {
                await sb.from('loyalty_cards').update({
                  tier_id: targetId,
                  tier_last_evaluated_at: new Date().toISOString(),
                }).eq('id', card.id)
                downgraded++
                if (card.whatsapp_opt_in && card.client_phone && target) {
                  const sent = await notifyTierChanged(sb, card.client_phone, card.client_name, target.name, brand, card.code)
                  if (sent) notified++
                }
              }
            }
          }
        } catch (e: any) {
          errors.push(`card ${card.id}: ${e?.message || e}`)
        }
      }

      if (cards.length < batchSize) break
      offset += batchSize
    }

    return json({ success: true, processed, upgraded, downgraded, notified, errors })
  } catch (e: any) {
    return json({ error: (e as Error).message }, 500)
  }
})
