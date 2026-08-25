// MySargal — brand-login : authentifie un compte marque/boutique (login+password)
// et émet un JWT scopé à sa campagne (claim brand_campaign + brand_role).
// Body: { login, password } -> { token, campaign_id, brand_name, role }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function mintJwt(secret: string, claims: Record<string, unknown>, ttlSec: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttlSec }))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`)))
  return `${header}.${payload}.${b64url(sig)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const secret = Deno.env.get('MS_JWT_SECRET')!
    const b = await req.json().catch(() => ({}))
    const login = String(b.login || '').trim().toLowerCase()
    const password = String(b.password || '')
    if (!login || !password) return json({ error: 'Login et mot de passe requis' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await sb.rpc('brand_verify_login', { p_login: login, p_password: password })
    if (error) return json({ error: error.message }, 500)
    if (!data || !data.campaign_id) return json({ error: 'Identifiants incorrects' }, 401)

    await sb.from('brand_accounts').update({ last_login: new Date().toISOString() }).eq('id', data.id)

    const role = data.role === 'shop' ? 'shop' : 'brand'
    const token = await mintJwt(secret, {
      role: 'authenticated', iss: 'mysargal',
      ms_brand: 'true', brand_campaign: data.campaign_id, brand_name: data.brand_name, brand_role: role,
    }, 7 * 86400)
    return json({ success: true, token, campaign_id: data.campaign_id, brand_name: data.brand_name, role })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
