// MySargal — brand-scan : scan d'un code produit unique → +points carte marque.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')
function brandOut(c: any) { return { brand: c.brand_name, emoji: c.emoji, color: c.brand_color || '#0b6cd4', tagline: c.tagline || '', logo_url: c.logo_url || null, threshold: c.reward_threshold, reward_label: c.reward_label, catalog: c.rewards_catalog || [], ad: c.ad_enabled ? { title: c.ad_title || '', text: c.ad_text || '', image_url: c.ad_image_url || null, link: c.ad_link || null } : null, ad_slides: Array.isArray(c.ad_slides) ? c.ad_slides : [], hero: { image_url: c.hero_image_url || null, headline: c.hero_headline || '', subtext: c.hero_subtext || '', layout: c.hero_layout || 'centre', font: c.hero_font || 'moderne' } } }

const SCAN_LIMIT = 25

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='
  const bin = atob(s); const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
async function verifiedPhone(req: Request, secret: string): Promise<string | null> {
  try {
    const auth = req.headers.get('authorization') || ''
    const tok = auth.replace(/^Bearer\s+/i, '').trim()
    if (!tok || tok.split('.').length !== 3) return null
    const [h, p, sig] = tok.split('.')
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`))
    if (!ok) return null
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)))
    if (claims.exp && claims.exp * 1000 < Date.now()) return null
    const ph = digits(claims.phone)
    return ph.length >= 8 ? ph : null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const secret = Deno.env.get('MS_JWT_SECRET')!

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const code = (url.searchParams.get('code') || '').toUpperCase()
      let campId = url.searchParams.get('campaign')
      if (code && !campId) {
        const { data: bc } = await sb.from('brand_codes').select('campaign_id,scanned').eq('code', code).single()
        if (bc) { campId = bc.campaign_id }
      }
      if (!campId) return json({ error: 'Campagne introuvable' }, 404)
      const { data: camp } = await sb.from('brand_campaigns').select('*').eq('id', campId).single()
      if (!camp) return json({ error: 'Campagne introuvable' }, 404)
      return json({ success: true, ...brandOut(camp) })
    }

    const b = await req.json().catch(() => ({}))
    const code = String(b.code || '').trim().toUpperCase()
    const name = String(b.name || '').trim().slice(0, 60)
    if (!code) return json({ error: 'Code manquant' }, 400)

    const phone = await verifiedPhone(req, secret)
    if (!phone) return json({ needs_otp: true, error: 'Vérification du numéro requise' }, 401)

    const { data: bcode } = await sb.from('brand_codes').select('code,campaign_id,scanned').eq('code', code).single()
    if (!bcode) return json({ error: 'Code invalide — ce produit n\'est pas reconnu' }, 404)
    if (bcode.scanned) return json({ error: 'Ce code a déjà été utilisé', already_used: true }, 409)

    const sinceHour = new Date(Date.now() - 3600_000).toISOString()
    const { count: recent } = await sb.from('brand_codes')
      .select('code', { count: 'exact', head: true })
      .eq('campaign_id', bcode.campaign_id).eq('scanned_by', `+${phone}`).gte('scanned_at', sinceHour)
    if ((recent ?? 0) >= SCAN_LIMIT) return json({ error: 'Trop de scans en peu de temps. Réessaie dans une heure.', rate_limited: true }, 429)

    const { data: camp } = await sb.from('brand_campaigns').select('*').eq('id', bcode.campaign_id).single()
    if (!camp || !camp.active) return json({ error: 'Campagne indisponible' }, 403)

    const { data: claimed } = await sb.from('brand_codes').update({ scanned: true, scanned_by: `+${phone}`, scanned_at: new Date().toISOString() }).eq('code', code).eq('scanned', false).select('code')
    if (!claimed || !claimed.length) return json({ error: 'Ce code vient d\'être utilisé', already_used: true }, 409)

    const pts = Math.max(1, camp.points_per_scan || 1)
    const { data: existing } = await sb.from('brand_cards').select('id,points,lifetime_points,rewards_won,name').eq('campaign_id', camp.id).eq('phone', `+${phone}`).single()
    let newPts: number, lifetime: number, rewardsWon: number
    if (existing) { newPts = (existing.points || 0) + pts; lifetime = (existing.lifetime_points || 0) + pts; rewardsWon = existing.rewards_won || 0 }
    else { newPts = pts; lifetime = pts; rewardsWon = 0 }

    let rewardUnlocked = false
    const threshold = camp.reward_threshold || 100
    if (newPts >= threshold) { newPts -= threshold; rewardsWon += 1; rewardUnlocked = true }

    if (existing) await sb.from('brand_cards').update({ points: newPts, lifetime_points: lifetime, rewards_won: rewardsWon, name: name || existing.name }).eq('id', existing.id)
    else await sb.from('brand_cards').insert({ campaign_id: camp.id, phone: `+${phone}`, name: name || null, points: newPts, lifetime_points: lifetime, rewards_won: rewardsWon })

    return json({ success: true, ...brandOut(camp), points_added: pts, points: newPts, lifetime, remaining: Math.max(0, threshold - newPts), reward_unlocked: rewardUnlocked, rewards_won: rewardsWon })
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
