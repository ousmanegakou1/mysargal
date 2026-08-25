// ============================================================
// MySargal — get-google-pass (v30)
// - Logo cercle-safe sur fond marque (logo-maraz?m=...&g=1)
// - Classe ET objet versionnés par hash du design (inclut logo_invert)
// - En-tête = nom boutique, « Propulsé par MySargal » sous le QR
// ============================================================
import * as jose from 'https://esm.sh/jose@5.9.6'

const SB_URL  = Deno.env.get('SUPABASE_URL')!
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ISSUER  = Deno.env.get('GOOGLE_WALLET_ISSUER_ID') || '3388000000023131442'
const PREFIX  = Deno.env.get('GOOGLE_WALLET_CLASS_PREFIX') || 'BCR2DN5TY2B552Z6'
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

const LOYALTY_CLASS  = `${ISSUER}.${PREFIX}.mysargal_loyalty`
const GIFTCARD_CLASS = `${ISSUER}.${PREFIX}.mysargal_giftcard`
// Monnaie de la boutique émettrice, et langue du porteur.
const DEVISES: Record<string, { s: string; d: number; avant?: boolean }> = {
  XOF:{s:'FCFA',d:0}, XAF:{s:'FCFA',d:0}, NGN:{s:'₦',d:2,avant:true}, KES:{s:'KSh',d:2,avant:true},
  TZS:{s:'TSh',d:0,avant:true}, RWF:{s:'FRw',d:0,avant:true}, UGX:{s:'USh',d:0,avant:true},
  GHS:{s:'GH₵',d:2,avant:true}, ZAR:{s:'R',d:2,avant:true}, MAD:{s:'DH',d:2}, DZD:{s:'DA',d:2},
  TND:{s:'DT',d:3}, EUR:{s:'€',d:2}, USD:{s:'US$',d:2,avant:true}, GBP:{s:'£',d:2,avant:true},
  CAD:{s:'CA$',d:2,avant:true}, BRL:{s:'R$',d:2,avant:true},
}
const LOCALES: Record<string, string> = { fr:'fr-FR', en:'en-US', es:'es-ES' }
const devOk = (c: unknown) => { const s = String(c || 'XOF').toUpperCase(); return DEVISES[s] ? s : 'XOF' }
function fmtMontant(n: number, cur = 'XOF', lg = 'fr'): string {
  const d = DEVISES[cur] || DEVISES.XOF
  const v = new Intl.NumberFormat(LOCALES[lg] || 'fr-FR', { minimumFractionDigits: d.d, maximumFractionDigits: d.d }).format(Number(n) || 0)
  return d.avant ? `${d.s} ${v}` : `${v} ${d.s}`
}
const ANGLOPHONES = ['254','255','256','234','233','260','263','265','266','267','268','232','231','220','211','251','250','27','44','353','61','64','1']
const HISPANOPHONES = ['34','52','57','51','54','56']
function langueDe(tel: unknown): string {
  const dg = String(tel || '').replace(/\D/g, '')
  for (const p of HISPANOPHONES) if (dg.startsWith(p)) return 'es'
  for (const p of ANGLOPHONES) if (dg.startsWith(p)) return 'en'
  return 'fr'
}
// Libellés du pass, dans la langue du porteur.
const L: Record<string, Record<string, string>> = {
  fr: { boutique:'BOUTIQUE', valeur:'VALEUR INITIALE', benef:'BÉNÉFICIAIRE', code:'CODE',
        points:'POINTS', client:'CLIENT', statut:'STATUT', voirCadeau:'Voir ma carte cadeau', voirCarte:'Voir ma carte',
        propulse:'Propulsé par MySargal · mysargal.com', alt:'Propulsé par MySargal' },
  en: { boutique:'SHOP', valeur:'INITIAL VALUE', benef:'RECIPIENT', code:'CODE',
        points:'POINTS', client:'CUSTOMER', statut:'STATUS', voirCadeau:'View my gift card', voirCarte:'View my card',
        propulse:'Powered by MySargal · mysargal.com', alt:'Powered by MySargal' },
  es: { boutique:'TIENDA', valeur:'VALOR INICIAL', benef:'DESTINATARIO', code:'CÓDIGO',
        points:'PUNTOS', client:'CLIENTE', statut:'ESTADO', voirCadeau:'Ver mi tarjeta regalo', voirCarte:'Ver mi tarjeta',
        propulse:'Con tecnología de MySargal · mysargal.com', alt:'Con tecnología de MySargal' },
}

function hex6(h: string): string | null {
  let s = String(h || '').trim()
  if (!s.startsWith('#')) s = '#' + s
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null
}
function httpsUrl(u: string): string | null {
  return /^https:\/\/.+/i.test(String(u || '')) ? String(u) : null
}
const midSeg = (id: string) => String(id || '').replace(/[^a-zA-Z0-9]/g, '')
function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}

async function sb(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
  return r.ok ? r.json() : []
}

function designVer(br: any, m: any): string {
  const bg = br ? hex6(br.bg1) : null
  return djb2('pad3|' + String(bg || '') + '|' + String(m?.logo_url || '') + '|' + String(m?.logo_base64 || '').slice(0, 64) + '|' + (br?.logo_invert === true ? 'inv' : ''))
}

Deno.serve(async (req) => {
  try {
    const code = new URL(req.url).searchParams.get('code')?.trim().toUpperCase()
    if (!code) return new Response('code requis', { status: 400 })
    const isGift = code.startsWith('GC-')

    let obj: Record<string, unknown>
    let claimsKey: string
    let classKey: string | null = null
    let inlineClass: Record<string, unknown> | null = null

    if (isGift) {
      const [gc] = await sb(`gift_cards?code=eq.${code}&limit=1`)
      if (!gc) return new Response('Gift card introuvable', { status: 404 })
      const [m] = gc.merchant_id ? await sb(`merchants?id=eq.${gc.merchant_id}&select=name,brand,logo_url,logo_base64,currency`) : [{}]
      const mname = m?.name || 'MySargal'
      const br = (m && m.brand && typeof m.brand === 'object') ? m.brand : null
      const bg = br ? hex6(br.bg1) : null
      const hasLogo = !!httpsUrl(m?.logo_url) || /^data:image\/(png|jpe?g);base64,/.test(String(m?.logo_base64 || ''))
      const logo = hasLogo ? `${SB_URL}/functions/v1/logo-maraz?m=${gc.merchant_id}&g=1` : null
      let classId = GIFTCARD_CLASS
      let objId = `${ISSUER}.${code.replace(/-/g, '_')}`
      if (bg || logo) {
        const ver = designVer(br, m)
        classId = `${ISSUER}.${PREFIX}.m_${midSeg(gc.merchant_id)}_gc_${ver}`
        objId = `${ISSUER}.${code.replace(/-/g, '_')}_${ver}`
        inlineClass = {
          id: classId, issuerName: mname, merchantName: mname,
          reviewStatus: 'UNDER_REVIEW',
          ...(bg ? { hexBackgroundColor: bg } : {}),
          ...(logo ? { programLogo: { sourceUri: { uri: logo } } } : {}),
        }
        classKey = 'giftCardClasses'
      }
      const init = gc.initial_amount || 0
      // La monnaie suit la BOUTIQUE, la langue du pass suit le BÉNÉFICIAIRE.
      const devise = devOk(m?.currency)
      const lg = langueDe(gc.recipient_phone)
      const t = L[lg] || L.fr
      obj = {
        id: objId, classId, state: 'ACTIVE', cardNumber: code,
        balance: { micros: Math.round((gc.balance ?? init) * 1_000_000), currencyCode: devise },
        barcode: { type: 'QR_CODE', value: code, alternateText: t.alt },
        textModulesData: [
          { id: 'boutique', header: t.boutique, body: mname },
          { id: 'valeur', header: t.valeur, body: fmtMontant(init, devise, lg) },
          { id: 'beneficiaire', header: t.benef, body: gc.recipient_name || '—' },
          { id: 'code', header: t.code, body: code },
          { id: 'powered', header: 'MYSARGAL', body: t.propulse },
        ],
        linksModuleData: { uris: [{ uri: `https://mysargal.com/giftcard.html?code=${code}`, description: t.voirCadeau }] },
      }
      claimsKey = 'giftCardObjects'
    } else {
      const [card] = await sb(`loyalty_cards?code=eq.${code}&limit=1`)
      if (!card) return new Response('Carte introuvable', { status: 404 })
      const [tier] = card.tier_id ? await sb(`sargal_tiers?id=eq.${card.tier_id}&select=name`) : []
      const [m] = card.merchant_id ? await sb(`merchants?id=eq.${card.merchant_id}&select=name,brand,logo_url,logo_base64,currency`) : [{}]
      const mname = m?.name || 'MySargal'
      const br = (m && m.brand && typeof m.brand === 'object') ? m.brand : null
      const bg = br ? hex6(br.bg1) : null
      const hasLogo = !!httpsUrl(m?.logo_url) || /^data:image\/(png|jpe?g);base64,/.test(String(m?.logo_base64 || ''))
      const logo = hasLogo ? `${SB_URL}/functions/v1/logo-maraz?m=${card.merchant_id}&g=1` : null
      let classId = LOYALTY_CLASS
      let objId = `${ISSUER}.${code.replace(/-/g, '_')}`
      if (bg || logo) {
        const ver = designVer(br, m)
        classId = `${ISSUER}.${PREFIX}.m_${midSeg(card.merchant_id)}_lo_${ver}`
        objId = `${ISSUER}.${code.replace(/-/g, '_')}_${ver}`
        inlineClass = {
          id: classId, issuerName: mname, programName: mname,
          reviewStatus: 'UNDER_REVIEW',
          ...(bg ? { hexBackgroundColor: bg } : {}),
          ...(logo ? { programLogo: { sourceUri: { uri: logo } } } : {}),
        }
        classKey = 'loyaltyClasses'
      }
      // La langue du pass suit le CLIENT.
      const lgc = langueDe(card.client_phone)
      const tc = L[lgc] || L.fr
      obj = {
        id: objId, classId, state: 'ACTIVE', accountId: code,
        accountName: card.client_name || 'Client',
        loyaltyPoints: { label: tc.points, balance: { int: card.pts || 0 } },
        barcode: { type: 'QR_CODE', value: code, alternateText: tc.alt },
        textModulesData: [
          ...(tier?.name ? [{ id: 'statut', header: tc.statut, body: tier.name }] : []),
          { id: 'client', header: tc.client, body: card.client_name || '—' },
          { id: 'code', header: tc.code, body: code },
          { id: 'powered', header: 'MYSARGAL', body: tc.propulse },
        ],
        linksModuleData: { uris: [{ uri: `https://mysargal.com/c/?code=${code}`, description: tc.voirCarte }] },
      }
      claimsKey = 'loyaltyObjects'
    }

    const payload: Record<string, unknown> = { [claimsKey]: [obj] }
    if (classKey && inlineClass) payload[classKey] = [inlineClass]

    const claims = {
      iss: SA_MAIL, aud: 'google', typ: 'savetowallet',
      origins: ['https://mysargal.com'], payload,
    }

    const key = await jose.importPKCS8(SA_KEY, 'RS256')
    const token = await new jose.SignJWT(claims).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuedAt().sign(key)

    return Response.redirect(`https://pay.google.com/gp/v/save/${token}`, 302)
  } catch (e) {
    return new Response('Erreur: ' + (e as Error).message, { status: 500 })
  }
})
