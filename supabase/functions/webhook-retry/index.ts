// MySargal — webhook-retry : ré-envoie les webhooks partenaires échoués (backoff exponentiel).
// Planifié toutes les 5 min via pg_cron. Max 6 tentatives, abandon après 24h.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } })
async function hmacHex(secret: string, body: string): Promise<string> { try { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body))); return [...s].map((b) => b.toString(16).padStart(2, '0')).join('') } catch { return '' } }
const MAX_ATTEMPTS = 6

Deno.serve(async (_req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const nowIso = new Date().toISOString()
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data: rows } = await sb.from('webhook_deliveries')
    .select('id, merchant_id, event, url, payload, attempts')
    .eq('ok', false).lt('attempts', MAX_ATTEMPTS).gte('created_at', since)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true }).limit(50)
  let retried = 0, delivered = 0
  for (const d of rows || []) {
    // Retrouver le partenaire (secret/url) par merchant_id
    const { data: partner } = await sb.from('api_partners')
      .select('webhook_url, webhook_secret').eq('merchant_id', d.merchant_id).eq('active', true)
      .not('webhook_url', 'is', null).limit(1).maybeSingle()
    const url = d.url || partner?.webhook_url
    if (!url) { await sb.from('webhook_deliveries').update({ attempts: MAX_ATTEMPTS, last_error: 'no_webhook_url' }).eq('id', d.id); continue }
    const body = JSON.stringify(d.payload)
    const sig = await hmacHex(partner?.webhook_secret || '', body)
    let status = 0, okk = false, err = ''
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 5000)
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MySargal-Event': d.event, 'X-MySargal-Signature': 'sha256=' + sig, 'X-MySargal-Retry': String((d.attempts || 1)) }, body, signal: ctrl.signal })
      clearTimeout(t); status = r.status; okk = r.ok
    } catch (e) { err = (e as Error).message }
    retried++; if (okk) delivered++
    const nextMin = Math.min(360, Math.pow(2, (d.attempts || 1)))  // 2,4,8,16,32,64 min
    await sb.from('webhook_deliveries').update({
      ok: okk, status_code: status, attempts: (d.attempts || 1) + 1,
      next_retry_at: okk ? null : new Date(Date.now() + nextMin * 60_000).toISOString(),
      last_error: okk ? null : (err || ('http_' + status)),
    }).eq('id', d.id)
  }
  return json({ success: true, scanned: (rows || []).length, retried, delivered })
})
