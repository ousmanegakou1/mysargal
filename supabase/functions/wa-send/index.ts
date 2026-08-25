// MySargal — wa-send : envoie un modèle (template) WhatsApp via l'API Cloud de Meta.
// Secrets requis : WA_TOKEN (token permanent), WA_PHONE_ID.
// Body JSON : { to, template, lang?, body_params?: string[], button_url_param?: string }
// Robustesse : si le bouton URL du template n'accepte pas de paramètre (err 132018),
// on réessaie sans le bouton (utile pendant la ré-approbation d'un template).
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const TOKEN = Deno.env.get('WA_TOKEN'); const PHONE_ID = Deno.env.get('WA_PHONE_ID')
    if (!TOKEN || !PHONE_ID) return json({ error: 'Config manquante : WA_TOKEN / WA_PHONE_ID' }, 500)
    const b = await req.json().catch(() => ({}))
    const to = digits(b.to)
    if (!to || !b.template) return json({ error: 'Champs requis : to, template' }, 400)

    const bodyComp: any[] = []
    if (Array.isArray(b.body_params) && b.body_params.length) {
      bodyComp.push({ type: 'body', parameters: b.body_params.map((t: string) => ({ type: 'text', text: String(t) })) })
    }
    const btnComp: any[] = []
    if (b.button_url_param) {
      btnComp.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(b.button_url_param) }] })
    }

    const build = (withBtn: boolean) => {
      const components = [...bodyComp, ...(withBtn ? btnComp : [])]
      return { messaging_product: 'whatsapp', to, type: 'template',
        template: { name: String(b.template), language: { code: b.lang || 'fr' }, ...(components.length ? { components } : {}) } }
    }
    const post = async (payload: unknown) => {
      const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await r.json().catch(() => ({}))
      return { r, data }
    }

    let { r, data } = await post(build(btnComp.length > 0))
    // Repli : bouton statique (ne prend pas de paramètre) → on renvoie sans le bouton.
    if (!r.ok && btnComp.length > 0 && data?.error?.code === 132018) {
      ({ r, data } = await post(build(false)))
    }
    return json(data, r.ok ? 200 : r.status)
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
