// MySargal — giftcard-pool : cagnotte collective. Actions: create | get | contribute | close.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const SB_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || ''
const db = () => createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const genCode = () => 'CG-' + [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
const clean = (v: unknown, n = 80) => String(v || '').trim().slice(0, n)

async function poolPublic(sb: any, pool: any) {
  const { data: contribs } = await sb.from('giftcard_pool_contributions').select('contributor_name,amount,created_at').eq('pool_id', pool.id).order('created_at', { ascending: true })
  let brand = 'MySargal'
  if (pool.merchant_id) { const { data: m } = await sb.from('merchants').select('name').eq('id', pool.merchant_id).maybeSingle(); if (m?.name) brand = m.name }
  return {
    code: pool.code, organizer_name: pool.organizer_name, recipient_name: pool.recipient_name,
    merchant_name: brand, merchant_id: pool.merchant_id, message: pool.message,
    target_amount: pool.target_amount, collected: Number(pool.collected) || 0, status: pool.status,
    gift_card_code: pool.gift_card_code, created_at: pool.created_at,
    contributions: (contribs || []).map((c: any) => ({ name: c.contributor_name, amount: Number(c.amount) || 0, at: c.created_at }))
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = db()
    const b = await req.json().catch(() => ({}))
    const action = String(b.action || '')

    if (action === 'create') {
      const recipient_name = clean(b.recipient_name)
      if (!recipient_name) return json({ error: 'Nom du/de la beneficiaire requis' }, 400)
      const target = b.target_amount ? Math.max(0, Math.min(Number(b.target_amount) || 0, 5_000_000)) : null
      let merchant_id: string | null = null
      if (b.merchant_id) { const { data: m } = await sb.from('merchants').select('id,active').eq('id', b.merchant_id).maybeSingle(); if (m && m.active !== false) merchant_id = String(m.id) }
      let code = genCode()
      for (let i = 0; i < 4; i++) { const { data: ex } = await sb.from('giftcard_pools').select('id').eq('code', code).limit(1); if (!ex || !ex.length) break; code = genCode() }
      const row = { code, organizer_name: clean(b.organizer_name) || 'Organisateur', recipient_name, recipient_phone: b.recipient_phone ? String(b.recipient_phone).replace(/[^+0-9]/g, '').slice(0, 20) : null, merchant_id, message: b.message ? clean(b.message, 300) : null, target_amount: target, collected: 0, status: 'open' }
      const { data: ins, error } = await sb.from('giftcard_pools').insert(row).select().single()
      if (error) return json({ error: 'Creation impossible: ' + error.message }, 500)
      return json({ success: true, pool: await poolPublic(sb, ins) })
    }

    if (action === 'get') {
      const { data: pool } = await sb.from('giftcard_pools').select('*').eq('code', clean(b.code, 20).toUpperCase()).maybeSingle()
      if (!pool) return json({ error: 'Cagnotte introuvable' }, 404)
      return json({ success: true, pool: await poolPublic(sb, pool) })
    }

    if (action === 'contribute') {
      const { data: pool } = await sb.from('giftcard_pools').select('*').eq('code', clean(b.code, 20).toUpperCase()).maybeSingle()
      if (!pool) return json({ error: 'Cagnotte introuvable' }, 404)
      if (pool.status !== 'open') return json({ error: 'Cette cagnotte est cloturee' }, 409)
      const amount = Math.floor(Number(b.amount) || 0)
      if (amount < 100 || amount > 2_000_000) return json({ error: 'Montant invalide (100 a 2 000 000 FCFA)' }, 400)
      await sb.from('giftcard_pool_contributions').insert({ pool_id: pool.id, contributor_name: clean(b.contributor_name) || 'Anonyme', amount })
      const collected = (Number(pool.collected) || 0) + amount
      await sb.from('giftcard_pools').update({ collected }).eq('id', pool.id)
      const { data: fresh } = await sb.from('giftcard_pools').select('*').eq('id', pool.id).maybeSingle()
      return json({ success: true, pool: await poolPublic(sb, fresh) })
    }

    if (action === 'close') {
      const { data: pool } = await sb.from('giftcard_pools').select('*').eq('code', clean(b.code, 20).toUpperCase()).maybeSingle()
      if (!pool) return json({ error: 'Cagnotte introuvable' }, 404)
      if (pool.status !== 'open') return json({ error: 'Cagnotte deja cloturee', gift_card_code: pool.gift_card_code }, 409)
      const total = Number(pool.collected) || 0
      if (total < 100) return json({ error: 'La cagnotte est vide (minimum 100 FCFA)' }, 400)
      // Emet une carte cadeau du total via create-gift-card (envoi WhatsApp au beneficiaire)
      let card: any = null
      try {
        const r = await fetch(SB_URL + '/functions/v1/create-gift-card', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant_id: pool.merchant_id || undefined, initial_amount: total, recipient_name: pool.recipient_name, recipient_phone: pool.recipient_phone || undefined, message: pool.message || ('Cagnotte offerte par ' + (pool.organizer_name || 'tes proches')) }) })
        const d = await r.json().catch(() => ({})); card = d?.card || null
      } catch (_) {}
      const gcCode = card?.code || null
      await sb.from('giftcard_pools').update({ status: 'closed', closed_at: new Date().toISOString(), gift_card_code: gcCode }).eq('id', pool.id)
      const { data: fresh } = await sb.from('giftcard_pools').select('*').eq('id', pool.id).maybeSingle()
      return json({ success: true, gift_card_code: gcCode, pool: await poolPublic(sb, fresh) })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
