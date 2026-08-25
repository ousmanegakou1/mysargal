// ============================================================
// MySargal — send-card-email v4 : carte par email, avec logos
//   • logo de la boutique en en-tête (si le marchand en a un)
//   • logo MySargal en pied de page
// Body : { to, client_name, merchant_name, card_url, merchant_id?,
//          brand?, points?, kind? }
// Secrets : RESEND_API_KEY (obligatoire) · MS_MAIL_FROM · MS_MAIL_REPLY
// ============================================================
const SB_URL = Deno.env.get('SUPABASE_URL')!
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const RESEND = Deno.env.get('RESEND_API_KEY') || ''
const FROM = Deno.env.get('MS_MAIL_FROM') || 'MySargal <carte@mysargal.com>'
const REPLY = Deno.env.get('MS_MAIL_REPLY') || 'hello@mysargal.com'
const MS_LOGO = `${SB_URL}/functions/v1/logo-mysargal?size=2x`

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
function hex6(h: unknown, fallback: string): string {
  let s = String(h || '').trim()
  if (!s.startsWith('#')) s = '#' + s
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback
}

function template(o: {
  client: string; merchant: string; url: string; points?: number | null
  bg1: string; bg2: string; accent: string; kind: string; logo: string | null
}): string {
  const isGift = o.kind === 'gift'
  const titre = isGift ? 'Votre carte cadeau' : 'Votre carte de fidélité'
  const intro = isGift
    ? `Vous avez reçu une carte cadeau <strong>${esc(o.merchant)}</strong>.`
    : `Bienvenue dans le programme de fidélité <strong>${esc(o.merchant)}</strong>.`

  const entete = o.logo
    ? `<tr><td style="padding-bottom:16px"><img src="${esc(o.logo)}" alt="${esc(o.merchant)}" height="34" style="height:34px;width:auto;display:block;border:0"/></td></tr>`
    : `<tr><td style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${o.accent};padding-bottom:14px">${esc(o.merchant)}</td></tr>`

  const ptsLine = (!isGift && o.points != null)
    ? `<tr><td style="padding:6px 0 0"><div style="font-family:Georgia,serif;font-size:44px;line-height:1;color:#ffffff;font-weight:bold">${o.points}</div><div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${o.accent};padding-top:6px">points fidélité</div></td></tr>`
    : ''

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(titre)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px">
  <tr><td align="center">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 34px rgba(14,26,51,.10)">

    <tr><td style="background:${o.bg1};background-image:linear-gradient(135deg,${o.bg1},${o.bg2});padding:32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
       ${entete}
       <tr><td style="font-family:Georgia,serif;font-size:24px;color:#ffffff">${esc(titre)}</td></tr>
       ${ptsLine}
      </table>
    </td></tr>

    <tr><td style="padding:30px 32px 8px;font-size:15px;line-height:1.65;color:#1c2436">
      Bonjour ${esc(o.client)},<br/><br/>${intro}<br/><br/>
      Elle est accessible à tout moment depuis le lien ci-dessous, et vous pouvez l'ajouter à Apple Wallet ou Google Wallet en un clic.
    </td></tr>

    <tr><td align="center" style="padding:26px 32px 30px">
      <a href="${esc(o.url)}" style="display:inline-block;background:${o.bg1};color:#ffffff;text-decoration:none;padding:15px 34px;border-radius:10px;font-weight:bold;font-size:15px">Voir ma carte</a>
    </td></tr>

    <tr><td style="padding:0 32px 30px;font-size:12px;color:#8a92a0;line-height:1.6">
      Si le bouton ne fonctionne pas, copiez ce lien :<br/>
      <span style="color:#5a6472;word-break:break-all">${esc(o.url)}</span>
    </td></tr>

    <tr><td style="background:#fafbfc;padding:20px 32px;border-top:1px solid #eef1f5">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
       <tr>
        <td align="center" style="padding-bottom:8px">
          <img src="${esc(MS_LOGO)}" alt="MySargal" height="22" style="height:22px;width:auto;display:inline-block;border:0"/>
        </td>
       </tr>
       <tr><td align="center" style="font-size:11px;color:#9aa3af">
         Propulsé par <a href="https://mysargal.com" style="color:#9aa3af;text-decoration:none">mysargal.com</a>
       </td></tr>
      </table>
    </td></tr>

   </table>
  </td></tr>
 </table>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (!RESEND) return json({ success: false, error: 'RESEND_API_KEY absent' }, 500)
    const b = await req.json().catch(() => ({}))
    const to = String(b.to || '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ success: false, error: 'Email invalide' }, 400)

    // Logo de la boutique : servi par la fonction logo (PNG garanti)
    let logo: string | null = null
    if (b.merchant_id) logo = `${SB_URL}/functions/v1/logo-maraz?m=${encodeURIComponent(String(b.merchant_id))}`
    else if (typeof b.logo_url === 'string' && /^https:\/\//i.test(b.logo_url)) logo = b.logo_url

    const brand = (b.brand && typeof b.brand === 'object') ? b.brand : {}
    const html = template({
      client: b.client_name || 'Cher client',
      merchant: b.merchant_name || 'MySargal',
      url: b.card_url || 'https://mysargal.com',
      points: b.points ?? null,
      bg1: hex6(brand.bg1, '#06210f'),
      bg2: hex6(brand.bg2, '#16a34a'),
      accent: hex6(brand.accent, '#7fe0a6'),
      kind: b.kind === 'gift' ? 'gift' : 'loyalty',
      logo,
    })

    const subject = b.kind === 'gift'
      ? `Votre carte cadeau ${b.merchant_name || ''}`.trim()
      : `Votre carte de fidélité ${b.merchant_name || ''}`.trim()

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, reply_to: REPLY }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return json({ success: false, error: d?.message || `Resend ${r.status}` }, 502)
    return json({ success: true, id: d?.id ?? null })
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500)
  }
})
