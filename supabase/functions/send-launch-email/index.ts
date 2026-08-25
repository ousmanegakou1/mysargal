// ============================================================
// MySargal — Edge Function : send-launch-email
// Envoie l'email de lancement MARAZ Summit Club a une liste VIP.
// - Body : { merchant_slug, vip_list:[{phone,first_name,email,lang?}], dry_run?, segment?, lang_override? }
// - Detecte lang (fr/en) selon phone prefix si non fourni.
// - Estime le tier initial en interrogeant compute_active_points + sargal_tiers.
// - Envoie via Resend (RESEND_API_KEY) depuis "MARAZ Summit Club <club@marazorigins.com>".
// - dry_run:true retourne le HTML rendu pour le premier destinataire, sans envoi.
// - Si vip_list absent, resout la liste server-side via segment
//   ("all" | "tier:membre" | "tier:ascension" | "tier:sommet" | "manual").
// - Journalise un rang dans public.sargal_email_campaigns si la table existe.
// ============================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const ok  = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const bad = (m: string, s = 400) => ok({ error: m }, s)

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || ''
const FROM_ADDR  = Deno.env.get('LAUNCH_FROM') || 'MARAZ Summit Club <club@marazorigins.com>'
const FROM_FALLBACK = 'MySargal <noreply@mysargal.com>'
const SB_URL     = Deno.env.get('SUPABASE_URL') || ''
const SB_SVC     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

function detectLang(phone: string, fallback = 'fr'): 'fr' | 'en' {
  const p = String(phone || '').trim()
  if (!p) return fallback as any
  if (p.startsWith('+1'))   return 'en'
  if (p.startsWith('+44'))  return 'en'
  if (p.startsWith('+212') || p.startsWith('+213') || p.startsWith('+216')) return 'fr'
  return fallback as any
}

async function estimateTier(sb: any, merchantId: string, phone: string): Promise<string> {
  try {
    const digits = String(phone || '').replace(/\D/g, '')
    if (!digits) return 'Membre'
    // Cherche la loyalty_card
    const { data: cards } = await sb.from('loyalty_cards')
      .select('id')
      .eq('merchant_id', merchantId)
      .ilike('client_phone_mask', `%${digits.slice(-6)}%`)
      .limit(1)
    if (!cards || !cards.length) return 'Membre'
    const cardId = cards[0].id
    let pts = 0
    try {
      const { data: p } = await sb.rpc('compute_active_points', { p_card_id: cardId })
      pts = Number(p || 0)
    } catch (_) {}
    // Bucket vs tiers
    const { data: tiers } = await sb.from('sargal_tiers')
      .select('name, min_points, max_points')
      .eq('merchant_id', merchantId)
      .order('priority', { ascending: false })
    if (!tiers || !tiers.length) return 'Membre'
    for (const t of tiers) {
      const mn = Number(t.min_points || 0)
      const mx = t.max_points == null ? Infinity : Number(t.max_points)
      if (pts >= mn && pts <= mx) return String(t.name || 'Membre')
    }
    return String(tiers[tiers.length - 1].name || 'Membre')
  } catch (_) {
    return 'Membre'
  }
}

function renderEmail(lang: 'fr' | 'en', vars: { first_name: string; tier: string; cta_url: string; merchant_name: string }): { subject: string; html: string } {
  const NAVY = '#1e3a5f'
  const ORANGE = '#c85a3e'
  const CREAM = '#f3ede0'
  const first = vars.first_name || (lang === 'en' ? 'friend' : 'cher client')
  const tier  = vars.tier || 'Membre'
  const url   = vars.cta_url

  if (lang === 'en') {
    const subject = `${vars.merchant_name} — Welcome to Summit Club`
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:Georgia,'Times New Roman',serif;color:${NAVY}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${CREAM};padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(30,58,95,.12)">
        <tr><td style="background:${NAVY};padding:36px 28px;text-align:center">
          <div style="color:${CREAM};font-size:.75rem;letter-spacing:.28em;text-transform:uppercase">${vars.merchant_name}</div>
          <div style="color:#ffffff;font-size:2rem;font-weight:800;margin-top:10px;letter-spacing:.02em">Summit Club</div>
          <div style="color:${ORANGE};font-size:.9rem;margin-top:8px;letter-spacing:.14em;text-transform:uppercase">Your journey begins</div>
        </td></tr>
        <tr><td style="padding:36px 32px">
          <p style="font-size:1.05rem;line-height:1.7;margin:0 0 16px">Dear ${first},</p>
          <p style="font-size:1rem;line-height:1.75;margin:0 0 16px">You are among the first VIP members invited to join <b>Summit Club</b>, our new premium loyalty program. Three tiers, five reward families, one promise: to celebrate every step of your journey with us.</p>
          <p style="font-size:1rem;line-height:1.75;margin:0 0 20px">Based on your history with us, your starting tier is:</p>
          <div style="text-align:center;margin:24px 0">
            <div style="display:inline-block;background:${NAVY};color:#ffffff;padding:14px 32px;border-radius:99px;font-size:1.1rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${tier}</div>
          </div>
          <p style="font-size:1rem;line-height:1.75;margin:0 0 24px">Discover your benefits, your rewards catalog and your personalized experiences below.</p>
          <div style="text-align:center;margin:32px 0 8px">
            <a href="${url}" style="display:inline-block;background:${ORANGE};color:#ffffff;padding:16px 36px;border-radius:12px;font-size:1rem;font-weight:800;text-decoration:none;letter-spacing:.04em">Discover my Summit Club</a>
          </div>
        </td></tr>
        <tr><td style="background:${CREAM};padding:22px 28px;text-align:center;color:${NAVY};font-size:.75rem;line-height:1.6">
          <div>${vars.merchant_name} &middot; Powered by MySargal</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
    return { subject, html }
  }

  // FR (default)
  const subject = `${vars.merchant_name} — Bienvenue au Summit Club`
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:Georgia,'Times New Roman',serif;color:${NAVY}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${CREAM};padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(30,58,95,.12)">
        <tr><td style="background:${NAVY};padding:36px 28px;text-align:center">
          <div style="color:${CREAM};font-size:.75rem;letter-spacing:.28em;text-transform:uppercase">${vars.merchant_name}</div>
          <div style="color:#ffffff;font-size:2rem;font-weight:800;margin-top:10px;letter-spacing:.02em">Summit Club</div>
          <div style="color:${ORANGE};font-size:.9rem;margin-top:8px;letter-spacing:.14em;text-transform:uppercase">Votre ascension commence</div>
        </td></tr>
        <tr><td style="padding:36px 32px">
          <p style="font-size:1.05rem;line-height:1.7;margin:0 0 16px">Cher(e) ${first},</p>
          <p style="font-size:1rem;line-height:1.75;margin:0 0 16px">Vous faites partie des premiers membres VIP invites a rejoindre le <b>Summit Club</b>, notre nouveau programme de fidelite premium. Trois niveaux, cinq familles de recompenses, une promesse : celebrer chaque etape de votre parcours avec nous.</p>
          <p style="font-size:1rem;line-height:1.75;margin:0 0 20px">A partir de votre historique, votre niveau de depart est :</p>
          <div style="text-align:center;margin:24px 0">
            <div style="display:inline-block;background:${NAVY};color:#ffffff;padding:14px 32px;border-radius:99px;font-size:1.1rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${tier}</div>
          </div>
          <p style="font-size:1rem;line-height:1.75;margin:0 0 24px">Decouvrez vos avantages, votre catalogue de recompenses et vos experiences personnalisees des maintenant.</p>
          <div style="text-align:center;margin:32px 0 8px">
            <a href="${url}" style="display:inline-block;background:${ORANGE};color:#ffffff;padding:16px 36px;border-radius:12px;font-size:1rem;font-weight:800;text-decoration:none;letter-spacing:.04em">Decouvrir mon Summit Club</a>
          </div>
        </td></tr>
        <tr><td style="background:${CREAM};padding:22px 28px;text-align:center;color:${NAVY};font-size:.75rem;line-height:1.6">
          <div>${vars.merchant_name} &middot; Propulse par MySargal</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  return { subject, html }
}

async function sendResend(to: string, subject: string, html: string): Promise<{ ok: boolean; err?: string }> {
  if (!RESEND_KEY) return { ok: false, err: 'RESEND_API_KEY manquant' }
  const attempt = async (from: string) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    const d = await r.json().catch(() => ({}))
    return { okr: r.ok, err: (d && (d.message || d.error)) || null }
  }
  try {
    let { okr, err } = await attempt(FROM_ADDR)
    if (!okr) { ({ okr, err } = await attempt(FROM_FALLBACK)) }
    return { ok: okr, err: okr ? undefined : (err || 'send failed') }
  } catch (e) {
    return { ok: false, err: String((e as any)?.message || e) }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return bad('POST required', 405)

  let body: any = {}
  try { body = await req.json() } catch (_) { return bad('bad json') }
  const merchantSlug = String(body?.merchant_slug || '').trim()
  let list: any[] = Array.isArray(body?.vip_list) ? body.vip_list : []
  const dryRun = !!body?.dry_run
  const segment = String(body?.segment || '').trim().toLowerCase() // "all" | "tier:membre" | ...
  const langOverride = (body?.lang_override === 'fr' || body?.lang_override === 'en') ? body.lang_override : null

  if (!merchantSlug) return bad('merchant_slug required')

  const sb = createClient(SB_URL, SB_SVC, { auth: { persistSession: false } })

  // Charge merchant + tiers
  const { data: mrows } = await sb.from('merchants').select('id, name, slug').eq('slug', merchantSlug).limit(1)
  if (!mrows || !mrows.length) return bad('merchant introuvable', 404)
  const merchant = mrows[0]

  // Resolution server-side du segment quand vip_list est absent/vide.
  if (!list.length && segment && segment !== 'manual') {
    let query = sb.from('loyalty_cards')
      .select('id, client_phone, client_first, client_email, tier_id')
      .eq('merchant_id', merchant.id)
      .not('client_email', 'is', null)
    if (segment.indexOf('tier:') === 0) {
      const wantedName = segment.split(':')[1] || ''
      // Cherche l'id du tier par nom (case-insensitive)
      const { data: tt } = await sb.from('sargal_tiers')
        .select('id, name')
        .eq('merchant_id', merchant.id)
      const match = (tt || []).find((r: any) => String(r.name || '').toLowerCase() === wantedName)
      if (!match) return bad('segment tier inconnu', 400)
      query = query.eq('tier_id', match.id)
    }
    const { data: cards } = await query.limit(5000)
    list = (cards || [])
      .filter((c: any) => !!c.client_email)
      .map((c: any) => ({ phone: c.client_phone || '', first_name: c.client_first || '', email: c.client_email, lang: langOverride || '' }))
  }

  if (!list.length) return bad('vip_list vide (segment resolu = 0)', 400)

  const results: Array<{ email: string; ok: boolean; tier: string; lang: string; err?: string }> = []
  let firstHtml = ''

  for (const v of list) {
    const email = String(v?.email || '').trim()
    const phone = String(v?.phone || '').trim()
    const firstName = String(v?.first_name || '').trim()
    const lang = langOverride
      ? langOverride
      : ((v?.lang === 'fr' || v?.lang === 'en') ? v.lang : detectLang(phone))
    if (!email) { results.push({ email: '', ok: false, tier: 'Membre', lang, err: 'email vide' }); continue }

    const tier = await estimateTier(sb, merchant.id, phone)
    const { subject, html } = renderEmail(lang, {
      first_name: firstName,
      tier,
      cta_url: `https://mysargal.com/${merchantSlug}/membre?ref=launch`,
      merchant_name: String(merchant.name || 'MARAZ'),
    })

    if (!firstHtml) firstHtml = html
    if (dryRun) { results.push({ email, ok: true, tier, lang }); continue }

    const r = await sendResend(email, subject, html)
    results.push({ email, ok: r.ok, tier, lang, err: r.ok ? undefined : r.err })
  }

  const sent = results.filter((r) => r.ok).length
  const failed = results.length - sent

  // Journalise (best-effort, ignore silencieusement si table absente)
  try {
    const subjectPreview = results.length
      ? `${String(merchant.name || 'MARAZ')} — Summit Club`
      : ''
    await sb.from('sargal_email_campaigns').insert({
      merchant_id: merchant.id,
      subject: subjectPreview,
      segment: segment || (list.length ? 'manual' : 'all'),
      lang: langOverride || 'auto',
      sent_count: sent,
      failed_count: failed,
      dry_run: dryRun,
      payload_snapshot: { size: list.length, results: results.map((r) => ({ email: r.email, ok: r.ok, tier: r.tier, lang: r.lang })) },
    })
  } catch (_) { /* table absente ou RLS -> on ignore */ }

  const resp: any = { sent, failed, dry_run: dryRun, results }
  if (dryRun) resp.preview_html = firstHtml
  return ok(resp)
})
