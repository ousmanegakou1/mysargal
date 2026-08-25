// ============================================================
// MySargal — refresh-session : renouvelle silencieusement la session marchand.
// Reçoit un JWT MySargal ENCORE VALIDE → réémet un JWT 30 jours.
// Un jeton expiré est refusé (sécurité : il faut repasser par l'OTP).
// L'app appelle ça au démarrage quand il reste < 15 jours → un marchand
// actif ne retape JAMAIS son code OTP.
// ============================================================
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const secret = Deno.env.get('MS_JWT_SECRET')!
    const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const [h, p, sig] = tok.split('.')
    if (!h || !p || !sig) return json({ error: 'Jeton manquant' }, 401)

    // Vérification de la signature
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify', 'sign'])
    const valid = await crypto.subtle.verify('HMAC', key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`))
    if (!valid) return json({ error: 'Jeton invalide' }, 401)

    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)))
    if (claims.iss !== 'mysargal' || !claims.phone) return json({ error: 'Jeton non renouvelable' }, 401)
    if (claims.ms_admin) return json({ error: 'Les sessions admin ne se renouvellent pas' }, 403)
    if (!claims.exp || claims.exp * 1000 < Date.now()) return json({ error: 'Session expirée — reconnecte-toi par OTP' }, 401)

    // Réémission : mêmes claims essentiels, 30 jours
    const now = Math.floor(Date.now() / 1000)
    const fresh = { role: 'authenticated', iss: 'mysargal', phone: claims.phone, iat: now, exp: now + 30 * 86400 }
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = b64url(JSON.stringify(fresh))
    const sig2 = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`)))
    const token = `${header}.${payload}.${b64url(sig2)}`

    return json({ success: true, token, expires_in: 30 * 86400 })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
