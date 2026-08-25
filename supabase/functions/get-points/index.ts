import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const ok  = (d: unknown, s=200) => new Response(JSON.stringify(d), { status:s, headers:{...cors,'Content-Type':'application/json'} })
const bad = (m: string, s=400) => ok({ error: m }, s)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const mid  = url.searchParams.get('merchant_id')
  if (!code) return bad('code requis')
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let query = sb.from('loyalty_cards').select('id,code,client_name,client_phone,pts,lifetime_pts,tier,last_scan_at,merchant:merchant_id(name,threshold,reward_desc,emoji,plan,brand)').eq('code', code).eq('active', true)
  if (mid) query = query.eq('merchant_id', mid)
  const { data: card, error } = await query.single()
  if (error || !card) return bad('Carte introuvable', 404)
  const m: any = card.merchant
  const remaining = Math.max(0, (m?.threshold||10) - (card.pts||0))
  const pct = Math.min(100, Math.round(((card.pts||0)/(m?.threshold||10))*100))
  return ok({ code: card.code, client_name: card.client_name, client_phone: card.client_phone, pts: card.pts, lifetime_pts: card.lifetime_pts, tier: card.tier, progress_pct: pct, reward_ready: (card.pts||0)>=(m?.threshold||10), remaining_pts: remaining, merchant: { name: m?.name, emoji: m?.emoji, threshold: m?.threshold, reward_desc: m?.reward_desc, brand: m?.brand }, last_scan_at: card.last_scan_at })
})
