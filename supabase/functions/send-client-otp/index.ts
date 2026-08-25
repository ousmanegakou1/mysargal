// ============================================================
// MySargal — send-client-otp : envoie un code OTP au CLIENT via WhatsApp.
// Canal officiel : template Authentication « mysargal_otp » (bouton Copier le code).
// Body : { phone }
// Déploiement : supabase functions deploy send-client-otp --no-verify-jwt
// Secrets : WA_TOKEN, WA_PHONE_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')

async function sha256hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const b = await req.json().catch(() => ({}))
    const phone = digits(b.phone)
    if (phone.length < 8) return json({ error: 'Numéro invalide' }, 400)

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Rate limit : max 3 codes / heure / numéro
    const since = new Date(Date.now() - 3600_000).toISOString()
    const { count } = await sb.from('client_otps')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone).gte('created_at', since)
    if ((count || 0) >= 3) {
      return json({ error: 'Trop de demandes. Réessaie dans une heure.' }, 429)
    }

    // Génère un code 6 chiffres
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const code_hash = await sha256hex(phone + ':' + code)
    const expires_at = new Date(Date.now() + 5 * 60_000).toISOString() // 5 min

    const { error: insErr } = await sb.from('client_otps').insert({ phone, code_hash, expires_at })
    if (insErr) return json({ error: 'Erreur serveur' }, 500)

    // Envoi via le template Authentication officiel (bouton « Copier le code »)
    const TOKEN = Deno.env.get('WA_TOKEN'); const PHONE_ID = Deno.env.get('WA_PHONE_ID')
    if (!TOKEN || !PHONE_ID) return json({ error: 'Service WhatsApp non configuré' }, 500)
    const payload = {
      messaging_product: 'whatsapp', to: phone, type: 'template',
      template: {
        name: 'mysargal_otp', language: { code: 'fr' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    }
    const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error('WA OTP error:', r.status, JSON.stringify(data))
      return json({ error: "Impossible d'envoyer le code sur WhatsApp" }, 502)
    }

    return json({ success: true })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
