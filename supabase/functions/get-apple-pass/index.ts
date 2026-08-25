// ============================================================
// MySargal — get-apple-pass v12
// Logo via logo-maraz?m=<id> (PNG garanti, JPG + inversion gérés).
// Bande : asset apple_pass_assets prioritaire, sinon générée depuis
// brand.strip=[c1,c2] via logo-maraz?strip=1. Texte : brand.text.
//
// v12 : géolocalisation. Quand la boutique a des coordonnées, le pass
// embarque un tableau `locations` (10 points max) et remonte sur l'écran
// verrouillé quand le porteur passe à proximité. Sans coordonnées, le
// pass est strictement identique aux versions précédentes.
// ============================================================
import forge from 'https://esm.sh/node-forge@1.3.1'
import JSZip from 'https://esm.sh/jszip@3.10.1'

const SB_URL  = Deno.env.get('SUPABASE_URL')!
const SB_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PASS_TYPE = Deno.env.get('APPLE_PASS_TYPE_ID') || 'pass.com.mysargal.app'
const TEAM_ID   = Deno.env.get('APPLE_TEAM_ID') || '6779DNV7Y5'
const JWT_SECRET = Deno.env.get('MS_JWT_SECRET') || ''
const WEB_SERVICE_URL = `${SB_URL}/functions/v1/apple-wallet`

function pemBlocks(raw: string): string[] {
  let s = String(raw || '').replace(/\\r/g, '').replace(/\\n/g, '\n').trim()
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).replace(/\\n/g, '\n')
  const blocks = s.match(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g) || []
  return blocks.map((b) => {
    const h = b.match(/-----BEGIN ([^-]+)-----/)
    const label = h ? h[1].trim() : 'CERTIFICATE'
    const m = b.match(/-----BEGIN [^-]+-----([\s\S]*?)-----END/)
    const body = (m ? m[1] : '').replace(/[^A-Za-z0-9+/=]/g, '')
    const lines = body.match(/.{1,64}/g) || []
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
  })
}
const CERT_BLOCKS = pemBlocks(Deno.env.get('APPLE_PASS_CERT') || '')
const KEY_PEM     = pemBlocks(Deno.env.get('APPLE_PASS_KEY')  || '')[0] || ''
const WWDR_BLOCKS = pemBlocks(Deno.env.get('APPLE_WWDR')      || '')
const KEY_PASS    = Deno.env.get('APPLE_PASS_KEY_PASSWORD') || undefined

// La MONNAIE suit la boutique émettrice, la LANGUE suit le porteur du pass.
const DEVISES: Record<string, { s: string; d: number; avant?: boolean }> = {
  XOF:{s:'FCFA',d:0}, XAF:{s:'FCFA',d:0}, NGN:{s:'₦',d:2,avant:true}, KES:{s:'KSh',d:2,avant:true},
  TZS:{s:'TSh',d:0,avant:true}, RWF:{s:'FRw',d:0,avant:true}, UGX:{s:'USh',d:0,avant:true},
  GHS:{s:'GH₵',d:2,avant:true}, ZAR:{s:'R',d:2,avant:true}, MAD:{s:'DH',d:2}, DZD:{s:'DA',d:2},
  TND:{s:'DT',d:3}, EUR:{s:'€',d:2}, USD:{s:'US$',d:2,avant:true}, GBP:{s:'£',d:2,avant:true},
  CAD:{s:'CA$',d:2,avant:true}, BRL:{s:'R$',d:2,avant:true},
}
const LOCALES: Record<string, string> = { fr:'fr-FR', en:'en-US', es:'es-ES' }
const devOk = (c: unknown) => { const x = String(c || 'XOF').toUpperCase(); return DEVISES[x] ? x : 'XOF' }
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
// Libellés du pass Apple, dans la langue du porteur.
const L: Record<string, any> = {
  fr: { solde:'SOLDE', boutique:'BOUTIQUE', benef:'BÉNÉFICIAIRE', code:'CODE', client:'CLIENT', statut:'STATUT',
        points:'POINTS FIDÉLITÉ', descCadeau:'Carte Cadeau', descFid:'Carte de Fidélité',
        commentT:'Comment utiliser', commentCadeau:'Présentez le QR code en caisse pour utiliser votre carte cadeau.',
        commentFid:'Présentez le QR code en caisse pour cumuler vos points.',
        nouveauSolde:'Nouveau solde : %@', alt:'Propulsé par MySargal',
        pts:(n:string,m:string)=>`Vous avez ${n} points chez ${m} — votre récompense vous attend` },
  en: { solde:'BALANCE', boutique:'SHOP', benef:'RECIPIENT', code:'CODE', client:'CUSTOMER', statut:'STATUS',
        points:'LOYALTY POINTS', descCadeau:'Gift Card', descFid:'Loyalty Card',
        commentT:'How to use', commentCadeau:'Show the QR code at checkout to use your gift card.',
        commentFid:'Show the QR code at checkout to earn your points.',
        nouveauSolde:'New balance: %@', alt:'Powered by MySargal',
        pts:(n:string,m:string)=>`You have ${n} points at ${m} — your reward is waiting` },
  es: { solde:'SALDO', boutique:'TIENDA', benef:'DESTINATARIO', code:'CÓDIGO', client:'CLIENTE', statut:'ESTADO',
        points:'PUNTOS DE FIDELIDAD', descCadeau:'Tarjeta Regalo', descFid:'Tarjeta de Fidelidad',
        commentT:'Cómo usarla', commentCadeau:'Muestra el código QR en caja para usar tu tarjeta regalo.',
        commentFid:'Muestra el código QR en caja para acumular puntos.',
        nouveauSolde:'Nuevo saldo: %@', alt:'Con tecnología de MySargal',
        pts:(n:string,m:string)=>`Tienes ${n} puntos en ${m}: tu recompensa te espera` },
}
const b64ToBytes = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0))
function b64Try(b: string): Uint8Array | null { try { return b64ToBytes(String(b || '').replace(/\s/g, '')) } catch { return null } }
const isPng = (b: Uint8Array | null) => !!b && b.length > 100 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
function hexToRgb(h: string): string | null {
  let s = String(h || '').replace('#', '')
  if (s.length === 3) s = s.split('').map((c) => c + c).join('')
  if (s.length !== 6 || /[^0-9a-fA-F]/.test(s)) return null
  const n = parseInt(s, 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
async function sb(path: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } })
  return r.ok ? r.json() : []
}
async function sha1hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', bytes)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function passAuthToken(code: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(JWT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('applepass:' + code)))
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40)
}
let ICONS: Record<string, string> | null = null
async function loadIcons(): Promise<Record<string, string>> {
  if (ICONS) return ICONS
  const rows = await sb('apple_pass_assets?select=name,b64&name=in.(icon,icon@2x,icon@3x,logo,logo@2x,logo@3x)')
  const m: Record<string, string> = {}
  for (const r of rows || []) m[r.name] = r.b64
  if (!m['icon'] || !m['logo']) throw new Error('Assets du pass manquants (apple_pass_assets)')
  ICONS = m
  return m
}
async function loadStrip(merchantId: string): Promise<string | null> {
  if (!merchantId) return null
  const rows = await sb(`apple_pass_assets?select=b64&name=eq.${encodeURIComponent('strip:' + merchantId)}`)
  return (rows && rows[0] && rows[0].b64) ? rows[0].b64 : null
}
// ── Géolocalisation du pass ────────────────────────────────────────────
// Apple accepte au maximum 10 points. Quand le porteur passe à proximité de
// l'un d'eux, la carte remonte sur l'écran verrouillé avec relevantText.
// Tout est fait par l'appareil : aucune notification envoyée, aucun coût.
const MAX_LIEUX = 10

function texteDePertinence(card: any, merchant: any, isGift: boolean, lg: string, devise: string): string {
  const nom = merchant?.name || 'MySargal'
  if (isGift) {
    const solde = Number(card?.balance ?? card?.initial_amount ?? 0)
    if (solde <= 0) return lg === 'en' ? `Your ${nom} gift card` : lg === 'es' ? `Tu tarjeta regalo ${nom}` : `Votre carte cadeau ${nom}`
    const m = fmtMontant(solde, devise, lg)
    return lg === 'en' ? `Your ${nom} gift card: ${m}` : lg === 'es' ? `Tu tarjeta regalo ${nom}: ${m}` : `Votre carte cadeau ${nom} : ${m}`
  }
  const pts = Number(card?.pts || 0)
  const seuil = Number(merchant?.threshold || 0)
  if (seuil > 0 && pts < seuil) {
    const reste = seuil - pts
    if (lg === 'en') return `${pts} point${pts > 1 ? 's' : ''} at ${nom} — ${reste} to go before your reward`
    if (lg === 'es') return `${pts} punto${pts > 1 ? 's' : ''} en ${nom}: te faltan ${reste} para tu recompensa`
    return `${pts} point${pts > 1 ? 's' : ''} chez ${nom} — plus que ${reste} avant votre récompense`
  }
  if (seuil > 0 && pts >= seuil) {
    if (lg === 'en') return `${nom}: your reward is available`
    if (lg === 'es') return `${nom}: tu recompensa está disponible`
    return `${nom} : votre récompense est disponible`
  }
  if (lg === 'en') return `${pts} point${pts > 1 ? 's' : ''} at ${nom}`
  if (lg === 'es') return `${pts} punto${pts > 1 ? 's' : ''} en ${nom}`
  return `${pts} point${pts > 1 ? 's' : ''} chez ${nom}`
}

function construireLieux(boutiques: any[], texte: string) {
  const lieux: any[] = []
  for (const b of boutiques || []) {
    const lat = Number(b?.branch_lat), lng = Number(b?.branch_lng)
    if (!isFinite(lat) || !isFinite(lng)) continue
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue
    if (lat === 0 && lng === 0) continue          // coordonnée nulle probable erreur de saisie
    lieux.push({ latitude: lat, longitude: lng, relevantText: texte })
    if (lieux.length >= MAX_LIEUX) break
  }
  return lieux
}

function buildPass(code: string, card: any, merchant: any, isGift: boolean, authToken: string, boutiques: any[] = [], tierName: string | null = null) {
  const mname = merchant?.name || 'MySargal'
  // La monnaie vient de la boutique, la langue du numéro du porteur.
  const devise = devOk(merchant?.currency)
  const lg = langueDe(isGift ? card?.recipient_phone : card?.client_phone)
  const t = L[lg] || L.fr
  const br = (merchant && merchant.brand && typeof merchant.brand === 'object') ? merchant.brand : null
  const bgColor = (br && br.bg1 && hexToRgb(br.bg1)) || 'rgb(240, 252, 235)'
  const fgColor = br ? ((br.text && hexToRgb(br.text)) || 'rgb(255, 255, 255)') : 'rgb(10, 10, 10)'
  const lblColor = (br && br.accent && hexToRgb(br.accent)) || 'rgb(0, 150, 70)'
  const base: any = { formatVersion: 1, passTypeIdentifier: PASS_TYPE, serialNumber: code, teamIdentifier: TEAM_ID, organizationName: 'MySargal', webServiceURL: WEB_SERVICE_URL, authenticationToken: authToken, backgroundColor: bgColor, foregroundColor: fgColor, labelColor: lblColor, barcodes: [{ message: code, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1', altText: t.alt }] }
  // Ajouté seulement si au moins une boutique a des coordonnées : sans cela le
  // pass reste strictement identique à ce qu'il était.
  const lieux = construireLieux(boutiques, texteDePertinence(card, merchant, isGift, lg, devise))
  if (lieux.length) { base.locations = lieux; base.maxDistance = 150 }
  if (isGift) {
    // Le solde qui bouge, c'est de l'argent dépensé : ça mérite toujours un avertissement.
    const soldeField: any = { key: 'in', label: t.solde, value: fmtMontant(card.balance ?? card.initial_amount ?? 0, devise, lg), changeMessage: t.nouveauSolde }
    return { ...base, description: `${t.descCadeau} — ${mname}`, storeCard: { headerFields: [{ key: 'b', label: t.boutique, value: mname }], primaryFields: [soldeField], secondaryFields: [{ key: 'r', label: t.benef, value: card.recipient_name || '' }], auxiliaryFields: [{ key: 'cd', label: t.code, value: code }], backFields: [ { key: 'i', label: t.commentT, value: t.commentCadeau }, { key: 's', label: 'MySargal', value: 'https://mysargal.com', dataDetectorTypes: ['PKDataDetectorTypeLink'] } ] } }
  }
  // Fidélité : notification uniquement au franchissement du palier.
  // Sans changeMessage, iOS met le pass à jour en silence — c'est ce qu'on veut
  // pour les points intermédiaires, sinon le porteur se lasse et supprime la carte.
  const ptsField: any = { key: 'pts', label: t.points, value: String(card.pts || 0) }
  const seuil = Number(merchant?.threshold || 0)
  const pts   = Number(card?.pts || 0)
  if (seuil > 0 && pts > 0 && pts % seuil === 0) {
    ptsField.changeMessage = t.pts('%@', mname)
  }
  return { ...base, description: `${t.descFid} — ${mname}`, storeCard: { headerFields: [{ key: 'b', label: t.boutique, value: mname }], primaryFields: [ptsField], secondaryFields: [ ...(tierName ? [{ key: 'st', label: t.statut, value: tierName }] : []), { key: 'c', label: t.client, value: card.client_name || '' }, { key: 'cd', label: t.code, value: code } ], backFields: [ { key: 'i', label: t.commentT, value: t.commentFid }, { key: 's', label: 'MySargal', value: 'https://mysargal.com', dataDetectorTypes: ['PKDataDetectorTypeLink'] } ] } }
}

Deno.serve(async (req) => {
  try {
    const code = new URL(req.url).searchParams.get('code')?.trim().toUpperCase()
    if (!code) return new Response('code requis', { status: 400 })
    if (!CERT_BLOCKS.length || !KEY_PEM || !WWDR_BLOCKS.length) return new Response('Certificats Apple non configurés (secrets)', { status: 500 })
    const isGift = code.startsWith('GC-')
    const table = isGift ? 'gift_cards' : 'loyalty_cards'
    const [card] = await sb(`${table}?code=eq.${code}&limit=1`)
    if (!card) return new Response('Carte introuvable', { status: 404 })
    const [merchant] = card.merchant_id ? await sb(`merchants?id=eq.${card.merchant_id}&select=id,parent_id,name,brand,logo_base64,logo_url,threshold,branch_lat,branch_lng,currency`) : [{}]

    // Statut Summit Club (si un tier est configuré sur cette carte)
    let tierName: string | null = null
    try { if (!isGift && card.tier_id) { const [tier] = await sb(`sargal_tiers?id=eq.${card.tier_id}&select=name`); tierName = tier?.name || null } } catch { tierName = null }

    // Points de vente à géolocaliser : la boutique de la carte, plus les autres
    // boutiques de la même enseigne. Échec silencieux : le pass reste valide.
    let boutiques: any[] = []
    try {
      if (merchant?.id) {
        const racine = merchant.parent_id || merchant.id
        boutiques = await sb(
          `merchants?select=id,branch_lat,branch_lng&or=(id.eq.${racine},parent_id.eq.${racine})` +
          `&branch_lat=not.is.null&branch_lng=not.is.null&limit=${MAX_LIEUX}`
        )
        // la boutique de la carte passe en premier
        boutiques.sort((a: any, b: any) => (a.id === merchant.id ? -1 : b.id === merchant.id ? 1 : 0))
      }
    } catch { boutiques = [] }

    const icons = await loadIcons()
    const stripB64 = await loadStrip(card.merchant_id)
    const authToken = await passAuthToken(code)

    const files: Record<string, Uint8Array> = {
      'pass.json': new TextEncoder().encode(JSON.stringify(buildPass(code, card, merchant, isGift, authToken, boutiques, tierName))),
      'icon.png': b64ToBytes(icons['icon']),
      'icon@2x.png': b64ToBytes(icons['icon@2x'] || icons['icon']),
      'icon@3x.png': b64ToBytes(icons['icon@3x'] || icons['icon']),
      'logo.png': b64ToBytes(icons['logo']),
      'logo@2x.png': b64ToBytes(icons['logo@2x'] || icons['logo']),
      'logo@3x.png': b64ToBytes(icons['logo@3x'] || icons['logo']),
    }
    // Logo marque via la fonction logo (PNG garanti)
    const hasLogo = /^data:image\/(png|jpe?g);base64,/.test(String(merchant?.logo_base64 || '')) || /^https:\/\//i.test(String(merchant?.logo_url || ''))
    if (card.merchant_id && hasLogo) {
      try {
        const lr = await fetch(`${SB_URL}/functions/v1/logo-maraz?m=${card.merchant_id}`)
        if (lr.ok) {
          const buf = new Uint8Array(await lr.arrayBuffer())
          if (isPng(buf)) { files['logo.png'] = buf; files['logo@2x.png'] = buf; files['logo@3x.png'] = buf }
        }
      } catch { /* ignore */ }
    }
    // Bande : asset stocké prioritaire, sinon générée depuis brand.strip
    let stripBytes: Uint8Array | null = null
    if (stripB64) { const s2 = b64Try(stripB64); if (isPng(s2)) stripBytes = s2 }
    const brStrip = merchant?.brand && Array.isArray(merchant.brand.strip) && merchant.brand.strip.length >= 2
    if (!stripBytes && card.merchant_id && brStrip) {
      try {
        const sr = await fetch(`${SB_URL}/functions/v1/logo-maraz?m=${card.merchant_id}&strip=1`)
        if (sr.ok) { const buf = new Uint8Array(await sr.arrayBuffer()); if (isPng(buf)) stripBytes = buf }
      } catch { /* ignore */ }
    }
    if (stripBytes) { files['strip.png'] = stripBytes; files['strip@2x.png'] = stripBytes; files['strip@3x.png'] = stripBytes }

    const manifest: Record<string, string> = {}
    for (const [name, bytes] of Object.entries(files)) manifest[name] = await sha1hex(bytes)
    const manifestStr = JSON.stringify(manifest)
    const manifestBytes = new TextEncoder().encode(manifestStr)

    const cert = forge.pki.certificateFromPem(CERT_BLOCKS[0])
    const key  = KEY_PASS ? forge.pki.decryptRsaPrivateKey(KEY_PEM, KEY_PASS) : forge.pki.privateKeyFromPem(KEY_PEM)
    const p7 = forge.pkcs7.createSignedData()
    p7.content = forge.util.createBuffer(manifestStr, 'utf8')
    p7.addCertificate(cert)
    CERT_BLOCKS.slice(1).forEach((c) => { try { p7.addCertificate(forge.pki.certificateFromPem(c)) } catch (_) {} })
    WWDR_BLOCKS.forEach((c) => { try { p7.addCertificate(forge.pki.certificateFromPem(c)) } catch (_) {} })
    p7.addSigner({ key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256, authenticatedAttributes: [ { type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() as any } ] })
    p7.sign({ detached: true })
    const derBin = forge.asn1.toDer(p7.toAsn1()).getBytes()
    const signature = Uint8Array.from(derBin, (c) => c.charCodeAt(0))

    const zip = new JSZip()
    for (const [name, bytes] of Object.entries(files)) zip.file(name, bytes)
    zip.file('manifest.json', manifestBytes)
    zip.file('signature', signature)
    const pkpass = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
    return new Response(pkpass, { headers: { 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': `attachment; filename="${code}.pkpass"`, 'Last-Modified': new Date().toUTCString(), 'Cache-Control': 'no-store' } })
  } catch (e) { return new Response('Erreur: ' + (e as Error).message, { status: 500 }) }
})
