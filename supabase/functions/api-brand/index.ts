// ============================================================
// MySargal — Edge Function : api-brand
// Auth partenaire : en-tête  x-api-key: msk_live_...   (ou ?key=)
// Renvoie l'identité de marque du commerce pour habiller le plugin.
// GET ou POST -> { success, merchant:{ name, logo_url, brand:{bg1,bg2,accent,text} } }
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const ok  = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const bad = (m: string, s = 400) => ok({ success: false, error: m }, s)

async function resolveMerchant(sb: any, req: Request): Promise<string | null> {
  const url = new URL(req.url)
  const key = (req.headers.get('x-api-key') || url.searchParams.get('key') || '').trim()
  if (!key) return null
  const { data, error } = await sb.from('api_partners')
    .select('merchant_id, active')
    .eq('api_key', key).limit(1).maybeSingle()
  if (error || !data) return null
  if (data.active === false || !data.merchant_id) return null
  return String(data.merchant_id)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const merchant = await resolveMerchant(sb, req)
    if (!merchant) return bad('Clé API invalide ou révoquée', 401)

    const { data: m, error } = await sb.from('merchants')
      .select('name, logo_url, brand')
      .eq('id', merchant).maybeSingle()
    if (error) return bad(error.message, 500)
    if (!m) return bad('Commerce introuvable', 404)

    const brand = (m.brand && typeof m.brand === 'object') ? m.brand : null
    return ok({
      success: true,
      merchant: {
        name: m.name ?? null,
        logo_url: m.logo_url ?? null,
        brand: brand ? {
          bg1: brand.bg1 ?? null,
          bg2: brand.bg2 ?? null,
          accent: brand.accent ?? null,
          text: brand.text ?? '#ffffff',
        } : null,
      },
    })
  } catch (e: any) { return bad('Erreur: ' + e.message, 500) }
})
