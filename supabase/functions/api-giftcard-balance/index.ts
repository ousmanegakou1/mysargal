// MySargal — api-giftcard-balance · x-api-key · rate-limit · POST { code }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' }
const ok  = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const bad = (m: string, s = 400) => ok({ success: false, error: m }, s)
function apiKey(req: Request) { return (req.headers.get('x-api-key') || new URL(req.url).searchParams.get('key') || '').trim() }
async function resolveMerchant(sb: any, key: string): Promise<string | null> {
  if (!key) return null
  const { data } = await sb.from('api_partners').select('merchant_id, active').eq('api_key', key).limit(1).maybeSingle()
  if (!data || data.active === false || !data.merchant_id) return null
  return String(data.merchant_id)
}
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const key = apiKey(req)
    const merchant = await resolveMerchant(sb, key)
    if (!merchant) return bad('Clé API invalide ou révoquée', 401)
    const { data: allowed } = await sb.rpc('api_rate_hit', { p_key: key, p_limit: 120, p_window: 60 })
    if (allowed === false) return bad('rate_limited: trop de requêtes', 429)
    const { code } = await req.json().catch(() => ({}))
    if (!code) return bad('code requis')
    const { data, error } = await sb.rpc('gift_card_partner_balance', { p_merchant: merchant, p_code: String(code).toUpperCase().trim() })
    if (error) return bad(error.message, 500)
    const r = data as any
    if (!r?.success) return ok(r, r?.error === 'not_found' ? 404 : 400)
    let merchantName: string | null = null
    try { const { data: mrow } = await sb.from('merchants').select('name').eq('id', merchant).maybeSingle(); merchantName = mrow?.name ?? null } catch (_) {}
    return ok({ ...r, merchant: merchantName })
  } catch (e: any) { return bad('Erreur: ' + e.message, 500) }
})
