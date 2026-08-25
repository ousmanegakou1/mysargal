// MySargal — api-giftcard-redeem · x-api-key · rate-limit · webhook giftcard.redeemed
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' }
const ok  = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const bad = (m: string, s = 400) => ok({ success: false, error: m }, s)
function apiKey(req: Request) { return (req.headers.get('x-api-key') || new URL(req.url).searchParams.get('key') || '').trim() }
async function resolvePartner(sb: any, key: string): Promise<any | null> {
  if (!key) return null
  const { data } = await sb.from('api_partners').select('merchant_id, active, webhook_url, webhook_secret').eq('api_key', key).limit(1).maybeSingle()
  if (!data || data.active === false || !data.merchant_id) return null
  return data
}
async function hmacHex(secret: string, body: string): Promise<string> { try { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body))); return [...s].map((b) => b.toString(16).padStart(2, '0')).join('') } catch { return '' } }
async function dispatch(sb: any, partner: any, event: string, data: Record<string, unknown>) {
  if (!partner?.webhook_url) return
  const body = JSON.stringify({ event, data, created_at: new Date().toISOString() })
  const sig = await hmacHex(partner.webhook_secret || '', body)
  const run = (async () => { let status = 0, okk = false; try { const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000); const r = await fetch(partner.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MySargal-Event': event, 'X-MySargal-Signature': 'sha256=' + sig }, body, signal: ctrl.signal }); clearTimeout(t); status = r.status; okk = r.ok } catch (_) {} try { await sb.from('webhook_deliveries').insert({ merchant_id: partner.merchant_id, event, url: partner.webhook_url, status_code: status, ok: okk, payload: JSON.parse(body) }) } catch (_) {} })()
  // @ts-ignore
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(run); else await run
}
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const key = apiKey(req)
    const partner = await resolvePartner(sb, key)
    if (!partner) return bad('Clé API invalide ou révoquée', 401)
    const { data: allowed } = await sb.rpc('api_rate_hit', { p_key: key, p_limit: 120, p_window: 60 })
    if (allowed === false) return bad('rate_limited: trop de requêtes', 429)
    const merchant = String(partner.merchant_id)
    const { code, amount, reference, idempotency_key } = await req.json().catch(() => ({}))
    if (!code || !amount) return bad('code et amount requis')
    const amt = Math.round(Number(amount))
    if (!Number.isFinite(amt) || amt <= 0) return bad('amount invalide')
    const { data, error } = await sb.rpc('gift_card_partner_redeem', { p_merchant: merchant, p_code: String(code).toUpperCase().trim(), p_amount: amt, p_reference: reference ?? null, p_idem: idempotency_key ?? reference ?? null })
    if (error) return bad(error.message, 500)
    const r = data as any
    if (!r?.success) { const status = r?.error === 'insufficient_balance' ? 402 : r?.error === 'not_found' ? 404 : r?.error === 'card_inactive' ? 409 : 400; return ok(r, status) }
    await dispatch(sb, partner, 'giftcard.redeemed', { code: String(code).toUpperCase().trim(), amount_charged: r.amount_charged, balance_remaining: r.balance_remaining, authorization_code: r.authorization_code, reference: r.reference ?? reference ?? null })
    return ok(r)
  } catch (e: any) { return bad('Erreur: ' + e.message, 500) }
})
