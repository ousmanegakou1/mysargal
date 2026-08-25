// ============================================================
// MySargal — api-rewards : catalogue des récompenses d'une carte (caisse/POS)
// Auth : x-api-key (table api_partners)
// Body : { card_code }  OU  { phone }
// Réponse : { success, card_code, client, points, threshold, reward_desc,
//              rewards: [{ id, name, emoji, pts_cost, discount_type,
//                          discount_value, available }] }
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

function normPhone(raw: unknown): string {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9 && d.startsWith('7')) return '221' + d
  if (d.length === 10 && d.startsWith('0')) return '225' + d
  return d
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const apiKey = req.headers.get('x-api-key') || new URL(req.url).searchParams.get('key') || ''
    if (!apiKey) return json({ success: false, error: 'Clé API manquante' }, 401)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: partner } = await sb.from('api_partners').select('merchant_id,active').eq('api_key', apiKey).maybeSingle()
    if (!partner || partner.active === false) return json({ success: false, error: 'Clé API invalide' }, 401)
    const merchantId = String(partner.merchant_id)

    const body = await req.json().catch(() => ({}))
    const code = String(body.card_code || '').trim().toUpperCase()
    const phone = normPhone(body.phone)
    if (!code && !phone) return json({ success: false, error: 'card_code ou phone requis' }, 400)

    let card: any = null
    if (code) {
      const { data } = await sb.from('loyalty_cards').select('id,code,client_name,pts')
        .eq('code', code).eq('merchant_id', merchantId).maybeSingle()
      card = data
    } else {
      const orF = `client_phone.eq.+${phone},client_phone.eq.${phone},client_phone_raw.eq.+${phone},client_phone_raw.eq.${phone}`
      const { data } = await sb.from('loyalty_cards').select('id,code,client_name,pts')
        .eq('merchant_id', merchantId).or(orF).order('created_at', { ascending: true }).limit(1)
      card = data && data[0]
    }
    if (!card) return json({ success: false, error: 'not_found' }, 404)

    const [{ data: merchant }, { data: rewards }] = await Promise.all([
      sb.from('merchants').select('name,threshold,reward_desc').eq('id', merchantId).maybeSingle(),
      sb.from('rewards').select('id,name,emoji,pts_cost,discount_type,discount_value')
        .eq('merchant_id', merchantId).eq('active', true).order('pts_cost', { ascending: true }),
    ])

    const pts = card.pts || 0
    const list = (rewards || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      pts_cost: r.pts_cost,
      discount_type: r.discount_type || null,
      discount_value: r.discount_value != null ? Number(r.discount_value) : null,
      available: pts >= (r.pts_cost || 0),
    }))

    return json({
      success: true,
      card_code: card.code,
      client: card.client_name,
      points: pts,
      threshold: merchant?.threshold ?? null,
      reward_desc: merchant?.reward_desc ?? null,
      merchant: merchant?.name ?? null,
      rewards: list,
    })
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500)
  }
})
