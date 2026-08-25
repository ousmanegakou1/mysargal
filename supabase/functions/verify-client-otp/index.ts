// MySargal — verify-client-otp : vérifie le code WhatsApp client + émet un JWT MySargal.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')
function b64url(data: Uint8Array | string): string { const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data; let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
async function mintJwt(secret: string, claims: Record<string, unknown>, ttlSec: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttlSec }))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`)))
  return `${header}.${payload}.${b64url(sig)}`
}
async function sha256hex(s: string): Promise<string> { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('') }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const secret = Deno.env.get('MS_JWT_SECRET')!
    const b = await req.json().catch(() => ({}))
    const phone = digits(b.phone)
    const code = String(b.code || '').replace(/\D/g, '')
    if (phone.length < 8 || code.length < 4) return json({ error: 'Code invalide' }, 400)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: rows } = await sb.from('client_otps').select('id,code_hash,expires_at,attempts,used').eq('phone', phone).eq('used', false).order('created_at', { ascending: false }).limit(1)
    const otp = rows && rows[0]
    if (!otp) return json({ error: 'Aucun code en attente — redemande un code' }, 400)
    if (otp.attempts >= 5) return json({ error: 'Trop d’essais — redemande un code' }, 429)
    if (new Date(otp.expires_at).getTime() < Date.now()) return json({ error: 'Code expiré — redemande un code' }, 400)
    const hash = await sha256hex(phone + ':' + code)
    if (hash !== otp.code_hash) { await sb.from('client_otps').update({ attempts: otp.attempts + 1 }).eq('id', otp.id); return json({ error: 'Code incorrect' }, 401) }
    await sb.from('client_otps').update({ used: true }).eq('id', otp.id)
    const token = await mintJwt(secret, { role: 'authenticated', iss: 'mysargal', phone: `+${phone}` }, 30 * 86400)
    return json({ success: true, token })
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
