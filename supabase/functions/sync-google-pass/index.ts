// ============================================================
// MySargal — Edge Function : sync-google-pass
// Met à jour l'objet Google Wallet (points / solde / STATUT) du client.
// Appel : POST/GET .../functions/v1/sync-google-pass?code=LC-XXXX
// Réutilise les MÊMES secrets que get-google-pass.
// Déploiement :  supabase functions deploy sync-google-pass --no-verify-jwt
// ============================================================
import * as jose from 'https://esm.sh/jose@5.9.6'

const SB_URL  = Deno.env.get('SUPABASE_URL')!
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ISSUER  = Deno.env.get('GOOGLE_WALLET_ISSUER_ID') || '3388000000023131442'
const SA_MAIL = Deno.env.get('GOOGLE_WALLET_SA_EMAIL')!

function normalizePem(raw: string): string {
  let s = String(raw || '').replace(/\\r/g, '').replace(/\\n/g, '\n').trim()
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).replace(/\\n/g, '\n')
  const m = s.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END/)
  const body = (m ? m[1] : s).replace(/[^A-Za-z0-9+/=]/g, '')
  const lines = body.match(/.{1,64}/g) || []
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`
}
const SA_KEY = normalizePem(Deno.env.get('GOOGLE_WALLET_SA_PRIVATE_KEY') || '')
const objId = (code: string) => `${ISSUER}.${code.replace(/-/g, '_')}`

const ANGLOPHONES = ['254','255','256','234','233','260','263','265','266','267','268','232','231','220','211','251','250','27','44','353','61','64','1']
const HISPANOPHONES = ['34','52','57','51','54','56']
function langueDe(tel: unknown): string {
  const dg = String(tel || '').replace(/\D/g, '')
  for (const p of HISPANOPHONES) if (dg.startsWith(p)) return 'es'
  for (const p of ANGLOPHONES) if (dg.startsWith(p)) return 'en'
  return 'fr'
}
const L: Record<string, Record<string, string>> = {
  fr: { points:'POINTS', client:'CLIENT', code:'CODE', statut:'STATUT', propulse:'Propulsé par MySargal · mysargal.com' },
  en: { points:'POINTS', client:'CUSTOMER', code:'CODE', statut:'STATUS', propulse:'Powered by MySargal · mysargal.com' },
  es: { points:'PUNTOS', client:'CLIENTE', code:'CÓDIGO', statut:'ESTADO', propulse:'Con tecnología de MySargal · mysargal.com' },
}

async function sb(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
  return r.ok ? r.json() : []
}

async function accessToken(): Promise<string> {
  const key = await jose.importPKCS8(SA_KEY, 'RS256')
  const assertion = await new jose.SignJWT({ scope: 'https://www.googleapis.com/auth/wallet_object.issuer' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(SA_MAIL).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt().setExpirationTime('1h').sign(key)
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('OAuth: ' + JSON.stringify(d))
  return d.access_token
}

Deno.serve(async (req) => {
  try {
    const code = new URL(req.url).searchParams.get('code')?.trim().toUpperCase()
    if (!code) return new Response('code requis', { status: 400 })
    const isGift = code.startsWith('GC-')

    let body: Record<string, unknown>
    let notifier = false

    if (isGift) {
      const [gc] = await sb(`gift_cards?code=eq.${code}&limit=1&select=balance`)
      if (!gc) return new Response('introuvable', { status: 404 })
      body = { balance: { micros: Math.round((gc.balance || 0) * 1_000_000), currencyCode: 'XOF' } }
    } else {
      const [card] = await sb(`loyalty_cards?code=eq.${code}&limit=1&select=pts,merchant_id,tier_id,client_name,client_phone`)
      if (!card) return new Response('introuvable', { status: 404 })
      const tc = L[langueDe(card.client_phone)] || L.fr
      body = { loyaltyPoints: { label: tc.points, balance: { int: card.pts || 0 } } }

      // Rafraîchit aussi la ligne STATUT (Summit Club) si un tier est configuré.
      // On reconstruit tout le bloc textModulesData car PATCH remplace le tableau.
      try {
        const [tier] = card.tier_id ? await sb(`sargal_tiers?id=eq.${card.tier_id}&select=name`) : []
        body.textModulesData = [
          ...(tier?.name ? [{ id: 'statut', header: tc.statut, body: tier.name }] : []),
          { id: 'client', header: tc.client, body: card.client_name || '—' },
          { id: 'code', header: tc.code, body: code },
          { id: 'powered', header: 'MYSARGAL', body: tc.propulse },
        ]
      } catch { /* si l'enrichissement statut échoue, on garde au moins les points */ }

      // On ne notifie qu'au franchissement du palier (Google plafonne à 3 notifs / 24h).
      try {
        if (card.merchant_id) {
          const [m] = await sb(`merchants?id=eq.${card.merchant_id}&select=threshold`)
          const seuil = Number(m?.threshold || 0)
          const pts   = Number(card.pts || 0)
          if (seuil > 0 && pts > 0 && pts % seuil === 0) notifier = true
        }
      } catch { /* pas de notification, mais la mise à jour continue */ }
    }

    if (notifier) body.notifyPreference = 'NOTIFY_ON_UPDATE'

    const token = await accessToken()
    const url = `https://walletobjects.googleapis.com/walletobjects/v1/${isGift ? 'giftCardObject' : 'loyaltyObject'}/${objId(code)}`
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.status === 404) return new Response(JSON.stringify({ ok: true, note: 'objet non créé (carte pas encore ajoutée)' }), { headers: { 'Content-Type': 'application/json' } })
    const out = await r.text()
    if (!r.ok) return new Response('Google: ' + out, { status: 502 })
    return new Response(JSON.stringify({ ok: true, updated: code, notifie: notifier }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response('Erreur: ' + (e as Error).message, { status: 500 })
  }
})
