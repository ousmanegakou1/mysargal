import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const ok  = (d: unknown, s=200) => new Response(JSON.stringify(d), { status:s, headers:{...cors,'Content-Type':'application/json'} })
const bad = (m: string, s=400) => ok({ error: m }, s)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { card_code, merchant_id, reward_id } = await req.json()
    if (!card_code || !merchant_id) return bad('card_code et merchant_id requis')
    const [{ data: card }, { data: merchant }] = await Promise.all([
      sb.from('loyalty_cards').select('id,pts,client_name,client_phone').eq('code', card_code).eq('merchant_id', merchant_id).single(),
      sb.from('merchants').select('name,threshold,reward_desc').eq('id', merchant_id).single()
    ])
    if (!card || !merchant) return bad('Carte ou commerçant introuvable', 404)
    let reward: any = null
    if (reward_id) { const { data } = await sb.from('rewards').select('*').eq('id', reward_id).eq('merchant_id', merchant_id).single(); reward = data }
    const ptsCost = reward?.pts_cost || merchant.threshold
    if ((card.pts||0) < ptsCost) return bad(`Pas assez de points. Disponible: ${card.pts}, requis: ${ptsCost}`)
    await sb.from('loyalty_cards').update({ pts: (card.pts||0) - ptsCost }).eq('id', card.id)
    await sb.from('transactions').insert({ card_id: card.id, merchant_id, pts: -ptsCost, type: 'reward', note: reward?.name || merchant.reward_desc, source: 'manual' })
    if (reward_id) await sb.from('rewards').update({ redemptions: (reward.redemptions||0)+1 }).eq('id', reward_id)
    // Wallet : rafraîchit les cartes Google + Apple (fire-and-forget)
    try { fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-google-pass?code=${encodeURIComponent(card_code)}`, { method: 'POST' }).catch(() => {}) } catch (_) {}
    try { fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-apple-pass?code=${encodeURIComponent(card_code)}`, { method: 'POST' }).catch(() => {}) } catch (_) {}
    return ok({ success: true, pts_used: ptsCost, pts_remaining: (card.pts||0)-ptsCost, reward: reward?.name || merchant.reward_desc })
  } catch(e: any) { return bad('Erreur: '+e.message, 500) }
})
