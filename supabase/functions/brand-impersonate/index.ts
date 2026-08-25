// MySargal — brand-impersonate : un ADMIN authentifié obtient un jeton marque
// scopé à n'importe quelle campagne (TTL court) pour « ouvrir la marque » dans /brand.
// Auth : Bearer <jeton admin ms_admin> ; Body : { campaign_id } -> { token, brand_name }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
function b64urlToBytes(s: string): Uint8Array { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out }
function b64url(data: Uint8Array | string): string { const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data; let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
async function mintJwt(secret: string, claims: Record<string, unknown>, ttlSec: number): Promise<string> { const now = Math.floor(Date.now() / 1000); const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttlSec })); const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`))); return `${header}.${payload}.${b64url(sig)}` }
async function verifyAdmin(req: Request, secret: string): Promise<Record<string, unknown> | null> {
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
    if (claims.ms_admin !== 'true') return null
    return claims
  } catch { return null }
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const secret = Deno.env.get('MS_JWT_SECRET')!
    const admin = await verifyAdmin(req, secret)
    if (!admin) return json({ error: 'Réservé aux administrateurs' }, 401)
    const b = await req.json().catch(() => ({}))
    const campId = String(b.campaign_id || '').trim()
    if (!campId) return json({ error: 'campaign_id requis' }, 400)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: camp } = await sb.from('brand_campaigns').select('id,brand_name').eq('id', campId).single()
    if (!camp) return json({ error: 'Campagne introuvable' }, 404)
    const token = await mintJwt(secret, { role: 'authenticated', iss: 'mysargal', ms_brand: 'true', brand_campaign: camp.id, brand_name: camp.brand_name, brand_role: 'brand', imp_by: admin.adm_name || 'admin' }, 2 * 3600)
    return json({ success: true, token, campaign_id: camp.id, brand_name: camp.brand_name })
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
