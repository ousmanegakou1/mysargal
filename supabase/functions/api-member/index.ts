// ============================================================
// MySargal - api-member
// Espace membre du client final : verifie la session OTP client (JWT MySargal),
// expose /me, /catalog, /redeem pour MARAZ Summit Club (et tout marchand
// qui a configure des sargal_tiers).
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')
const firstName = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || ''

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function verifyMemberJwt(token: string, secret: string): Promise<{ phone: string } | null> {
  try {
    const [h, p, sig] = token.split('.')
    if (!h || !p || !sig) return null
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`))
    if (!valid) return null
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)))
    if (claims.iss !== 'mysargal' || !claims.phone) return null
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null
    return { phone: String(claims.phone) }
  } catch (_) { return null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const secret = Deno.env.get('MS_JWT_SECRET')
    if (!secret) return json({ error: 'JWT secret manquant' }, 500)

    // 1) Token via Authorization Bearer, header member_token, ou body
    const url = new URL(req.url)
    const action = (url.searchParams.get('action') || '').toLowerCase() || (req.method === 'POST' ? '' : 'me')
    let token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('x-member-token') || ''
    let body: any = {}
    if (req.method === 'POST') {
      try { body = await req.json() } catch (_) { body = {} }
      if (!token && body?.member_token) token = String(body.member_token)
    }
    if (!token) return json({ error: 'Session membre requise' }, 401)

    const session = await verifyMemberJwt(token, secret)
    if (!session) return json({ error: 'Session invalide ou expiree' }, 401)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const phoneDigits = digits(session.phone)

    // 2) Trouver la carte du membre. On peut prefiltrer par merchant_id si fourni.
    const requestedMerchant = url.searchParams.get('merchant_id') || body?.merchant_id || null

    let cardQuery = sb.from('loyalty_cards')
      .select('id,code,client_name,client_phone,client_birthday,merchant_id,pts,lifetime_pts,tier,tier_id,active_points,member_number,whatsapp_opt_in')
      .eq('client_phone', '+' + phoneDigits)
    if (requestedMerchant) cardQuery = cardQuery.eq('merchant_id', requestedMerchant)
    const { data: cards } = await cardQuery.limit(50)

    if (!cards || cards.length === 0) {
      return json({ error: 'Aucune carte pour ce membre' }, 404)
    }
    // Priorite : celle demandee ou la premiere
    const card: any = cards[0]

    const { data: merchant } = await sb.from('merchants')
      .select('id,name,reward_config')
      .eq('id', card.merchant_id).single()
    const rewardCfg = (merchant?.reward_config || {}) as Record<string, any>
    const merchantSlug = (rewardCfg.slug as string) || (merchant?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    // 3) Charger tous les tiers du marchand (public)
    const { data: allTiers } = await sb.from('sargal_tiers')
      .select('id,name,min_points,max_points,color_hex,benefits_json,priority')
      .eq('merchant_id', card.merchant_id)
      .order('priority', { ascending: true })

    // ------------------------- ACTION: ME -------------------------
    if (action === 'me' || action === '') {
      // Recalcul actif pour etre a jour
      try { await sb.rpc('reevaluate_tier', { p_card_id: card.id }) } catch (_) {}
      const { data: fresh } = await sb.from('loyalty_cards')
        .select('active_points,tier_id,lifetime_pts,member_number')
        .eq('id', card.id).single()
      const active = fresh?.active_points ?? card.active_points ?? 0
      const tierId = fresh?.tier_id ?? card.tier_id
      const current = tierId ? (allTiers || []).find((t: any) => t.id === tierId) : null
      const next = (allTiers || []).find((t: any) => (t.min_points || 0) > active)

      // Historique 100 derniers mouvements ledger + prochainement expirants
      const [{ data: history }, { data: expiringSoon }] = await Promise.all([
        sb.from('sargal_points')
          .select('delta,reason,earned_at,expires_at')
          .eq('card_id', card.id)
          .order('earned_at', { ascending: false })
          .limit(100),
        sb.from('sargal_points')
          .select('delta,expires_at')
          .eq('card_id', card.id)
          .gt('delta', 0)
          .gt('expires_at', new Date().toISOString())
          .lte('expires_at', new Date(Date.now() + 90 * 86400000).toISOString())
          .order('expires_at', { ascending: true })
          .limit(20),
      ])

      return json({
        success: true,
        member_number: fresh?.member_number || card.member_number || null,
        first_name: firstName(card.client_name),
        client_name: card.client_name,
        active_points: active,
        lifetime_pts: fresh?.lifetime_pts ?? card.lifetime_pts ?? 0,
        card_code: card.code,
        tier: current
          ? {
              id: current.id,
              name: current.name,
              color_hex: current.color_hex,
              min_points: current.min_points,
              max_points: current.max_points,
              benefits: current.benefits_json || [],
            }
          : null,
        next_tier: next
          ? {
              id: next.id,
              name: next.name,
              min_points: next.min_points,
              points_needed: Math.max(0, (next.min_points || 0) - active),
            }
          : null,
        expiring_soon: expiringSoon || [],
        history: history || [],
        merchant: {
          id: merchant?.id,
          name: merchant?.name,
          slug: merchantSlug,
          color: (rewardCfg.brand_color as string) || null,
        },
      })
    }

    // ------------------------- ACTION: CATALOG -------------------------
    if (action === 'catalog') {
      const family = url.searchParams.get('family') || body?.family || null
      const currentTier = card.tier_id ? (allTiers || []).find((t: any) => t.id === card.tier_id) : null
      const currentPriority = currentTier?.priority ?? 0

      let q = sb.from('sargal_rewards')
        .select('id,family,name,description,points_cost,tier_required_id,image_url,sort_order,active')
        .eq('merchant_id', card.merchant_id)
        .eq('active', true)
        .order('sort_order', { ascending: true })
      if (family) q = q.eq('family', family)
      const { data: rewards } = await q

      // Filtrer par tier accessible : tier_required_id null OU priority <= currentPriority
      const tierPriorityById = new Map<string, number>((allTiers || []).map((t: any) => [t.id, t.priority ?? 0]))
      const accessible = (rewards || []).filter((r: any) => {
        if (!r.tier_required_id) return true
        const reqPri = tierPriorityById.get(r.tier_required_id) ?? 999
        return reqPri <= currentPriority
      })
      return json({ success: true, rewards: accessible, current_tier_id: card.tier_id || null })
    }

    // ------------------------- ACTION: REDEEM -------------------------
    if (action === 'redeem') {
      const rewardId = body?.reward_id
      if (!rewardId) return json({ error: 'reward_id requis' }, 400)

      const { data: reward } = await sb.from('sargal_rewards')
        .select('id,merchant_id,family,name,points_cost,tier_required_id,active')
        .eq('id', rewardId).single()
      if (!reward || !reward.active) return json({ error: 'Recompense introuvable' }, 404)
      if (reward.merchant_id !== card.merchant_id) return json({ error: 'Recompense hors marchand' }, 403)

      // Verifier tier accessible
      if (reward.tier_required_id) {
        const currentTier = card.tier_id ? (allTiers || []).find((t: any) => t.id === card.tier_id) : null
        const reqTier = (allTiers || []).find((t: any) => t.id === reward.tier_required_id)
        const currentPriority = currentTier?.priority ?? 0
        const reqPriority = reqTier?.priority ?? 999
        if (reqPriority > currentPriority) return json({ error: 'Tier insuffisant pour cette recompense' }, 403)
      }

      // Verifier solde
      const cost = Number(reward.points_cost || 0)
      const currentActive = Number(card.active_points || 0)
      if (currentActive < cost) return json({ error: 'Points insuffisants', active_points: currentActive, points_cost: cost }, 402)

      // Insere une ligne negative dans le ledger
      const nowIso = new Date().toISOString()
      const { error: ledgerErr } = await sb.from('sargal_points').insert({
        merchant_id: card.merchant_id,
        card_id: card.id,
        delta: -cost,
        reason: `Redeem: ${reward.name}`,
        source: 'redeem',
        earned_at: nowIso,
      })
      if (ledgerErr) return json({ error: 'Debit ledger echoue: ' + ledgerErr.message }, 500)

      // Log dans transactions (compatible avec le reste du systeme)
      try {
        await sb.from('transactions').insert({
          card_id: card.id, merchant_id: card.merchant_id, pts: -cost, type: 'redeem',
          note: reward.name, source: 'member_app',
        })
      } catch (_) {}

      // Reevaluer et relire
      try { await sb.rpc('reevaluate_tier', { p_card_id: card.id }) } catch (_) {}
      const { data: fresh } = await sb.from('loyalty_cards')
        .select('active_points,tier_id,pts,lifetime_pts,member_number')
        .eq('id', card.id).single()

      return json({
        success: true,
        reward: { id: reward.id, name: reward.name, family: reward.family, points_cost: cost },
        active_points: fresh?.active_points ?? Math.max(0, currentActive - cost),
        tier_id: fresh?.tier_id ?? card.tier_id,
        pts_wallet: fresh?.pts ?? card.pts,
        redeemed_at: nowIso,
      })
    }

    return json({ error: 'Action inconnue (me, catalog, redeem)' }, 400)
  } catch (e: any) {
    return json({ error: (e as Error).message }, 500)
  }
})
