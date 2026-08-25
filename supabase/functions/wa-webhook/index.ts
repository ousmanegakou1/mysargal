// MySargal — wa-webhook v6 : assistant WhatsApp maitrise. Points regroupes par enseigne.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const FALLBACK_TOKEN = 'mysargal-wh-2026'
const VERIFY_TOKEN = Deno.env.get('WA_VERIFY_TOKEN') || FALLBACK_TOKEN
const WA_TOKEN = Deno.env.get('WA_TOKEN'); const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID')
const sb = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const digits = (p: unknown) => String(p || '').replace(/\D/g, '')
function normPhone(raw: unknown): string { let d = digits(raw); if (!d) return ''; if (d.startsWith('00')) d = d.slice(2); if (d.length === 9 && d[0] === '7') return '221' + d; if (d.length === 10 && d[0] === '0') return '225' + d; return d }
function fmtAmount(n: number) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA' }
function fmtDate(iso: string) { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` } catch { return '' } }

async function sendText(to: string, body: string) {
  if (!WA_TOKEN || !WA_PHONE_ID || !to) return
  try {
    await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4000), preview_url: false } }) })
  } catch (e) { console.error('sendText', (e as Error).message) }
}

async function pointsSummary(db: any, phone: string): Promise<string> {
  const orf = `client_phone.eq.+${phone},client_phone.eq.${phone},client_phone_raw.eq.+${phone},client_phone_raw.eq.${phone}`
  const { data: cards } = await db.from('loyalty_cards').select('pts,merchant_id').or(orf).limit(50)
  if (!cards || !cards.length) return "Je ne trouve pas de carte de fidelite a ce numero. Passe chez un commerce partenaire MySargal pour en creer une, c'est gratuit."
  const byM: Record<string, number> = {}
  for (const c of cards as any[]) { const k = c.merchant_id || '?'; byM[k] = (byM[k] || 0) + (Number(c.pts) || 0) }
  const ids = Object.keys(byM).filter((k) => k !== '?')
  const names: Record<string, string> = {}
  if (ids.length) { const { data: ms } = await db.from('merchants').select('id,name').in('id', ids); (ms || []).forEach((m: any) => { names[m.id] = m.name }) }
  const lines = Object.keys(byM).sort((a, b) => byM[b] - byM[a]).map((k) => `- ${byM[k]} points chez ${names[k] || 'ta boutique'}`)
  return 'Voici tes points de fidelite :\n' + lines.join('\n') + '\n\nEcris "cadeau" pour verifier une carte cadeau.'
}

async function giftcardInfo(db: any, code: string): Promise<string> {
  const c = code.toUpperCase()
  const { data: g } = await db.from('gift_cards').select('code,balance,status,expires_at,merchant_id').eq('code', c).maybeSingle()
  if (!g) return `Je ne trouve pas la carte cadeau ${c}. Verifie le code (format GC-XXXXXX).`
  if (g.status !== 'active') return `La carte ${c} n'est plus active.`
  let brand = 'MySargal'
  if (g.merchant_id) { const { data: m } = await db.from('merchants').select('name').eq('id', g.merchant_id).maybeSingle(); if (m?.name) brand = m.name }
  return `Carte cadeau ${c} (${brand}) : solde ${fmtAmount(Number(g.balance) || 0)}${g.expires_at ? ', valable jusqu\'au ' + fmtDate(g.expires_at) : ''}.`
}

function detect(text: string): { intent: string; code?: string } {
  const t = text.toLowerCase().trim()
  if (/^(stop|stopp|arret|arrete|arrêter|desabonner|désabonner|unsubscribe)$/.test(t)) return { intent: 'stop' }
  if (/^(start|reabonner|réabonner)$/.test(t)) return { intent: 'start' }
  const gc = text.match(/GC-?[A-Za-z0-9]{4,8}/i)
  if (gc) return { intent: 'giftcard', code: gc[0].toUpperCase().replace(/^GC-?/, 'GC-') }
  if (/(conseiller|humain|parler a|agent|quelqu|réclam|reclam|problème|probleme|plainte)/.test(t)) return { intent: 'human' }
  if (t === '1' || /(solde|combien.*point|mes point|points|fidelit|fidélit)/.test(t)) return { intent: 'points' }
  if (t === '2' || /(carte cadeau|cadeau|cheque cadeau|chèque|bon d.achat)/.test(t)) return { intent: 'giftcard_ask' }
  if (t === '3' || /(comment|ça marche|ca marche|utiliser|fonctionne)/.test(t)) return { intent: 'howto' }
  if (/(bonjour|bonsoir|salut|coucou|menu|aide|help|début|debut|commencer|hello)/.test(t) || t === '0') return { intent: 'menu' }
  return { intent: 'unknown' }
}

async function llmAnswer(userMsg: string, context: string): Promise<string> {
  const key = Deno.env.get('ANTHROPIC_API_KEY'); if (!key) return 'HANDOFF'
  try {
    const sys = "Tu es l'assistant WhatsApp de MySargal (fidelite et cartes cadeaux au Senegal). Reponds en francais, en une a trois phrases, sans emoji. Tu ne peux utiliser QUE les informations du CONTEXTE ci-dessous. Si la reponse n'y est pas, reponds exactement le mot HANDOFF et rien d'autre."
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'claude-3-5-haiku-latest', max_tokens: 300, system: sys, messages: [{ role: 'user', content: `CONTEXTE:\n${context}\n\nMESSAGE DU CLIENT: ${userMsg}` }] }) })
    const d = await r.json().catch(() => ({}))
    const txt = (d?.content?.[0]?.text || '').trim()
    return txt || 'HANDOFF'
  } catch (_) { return 'HANDOFF' }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode'); const token = url.searchParams.get('hub.verify_token'); const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && (token === VERIFY_TOKEN || token === FALLBACK_TOKEN)) return new Response(challenge || '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    return new Response('Forbidden', { status: 403 })
  }
  if (req.method !== 'POST') return new Response('OK', { status: 200 })
  let body: any = {}
  try { body = await req.json() } catch (_) { return new Response('EVENT_RECEIVED', { status: 200 }) }
  try {
    const change = body?.entry?.[0]?.changes?.[0]?.value
    const msg = change?.messages?.[0]
    if (!msg || !msg.from) return new Response('EVENT_RECEIVED', { status: 200 })
    const from = String(msg.from)
    const wamid = String(msg.id || '')
    let text = ''
    if (msg.type === 'text') text = msg.text?.body || ''
    else if (msg.type === 'button') text = msg.button?.text || ''
    else if (msg.type === 'interactive') text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || ''
    const db = sb()
    if (wamid) { const { data: seen } = await db.from('wa_bot_log').select('id').eq('wa_message_id', wamid).maybeSingle(); if (seen) return new Response('EVENT_RECEIVED', { status: 200 }) }
    const { data: cfg } = await db.from('wa_bot_config').select('*').eq('id', 1).maybeSingle()
    const C = cfg || {}
    const log = async (intent: string, reply: string) => { try { await db.from('wa_bot_log').insert({ wa_message_id: wamid || null, phone: from, msg_in: text.slice(0, 500), intent, reply_out: reply.slice(0, 800) }) } catch (_) {} }
    if (C.enabled === false) { await log('disabled', ''); return new Response('EVENT_RECEIVED', { status: 200 }) }
    const det = detect(text)
    if (det.intent === 'stop') { try { await db.from('wa_bot_optout').upsert({ phone: from }) } catch (_) {} ; const r = "Tu ne recevras plus de reponses automatiques. Ecris START a tout moment pour reactiver."; await sendText(from, r); await log('stop', r); return new Response('EVENT_RECEIVED', { status: 200 }) }
    if (det.intent === 'start') { try { await db.from('wa_bot_optout').delete().eq('phone', from) } catch (_) {} ; const r = C.greeting || 'Assistant reactive.'; await sendText(from, r); await log('start', r); return new Response('EVENT_RECEIVED', { status: 200 }) }
    const { data: opted } = await db.from('wa_bot_optout').select('phone').eq('phone', from).maybeSingle()
    if (opted) { await log('skipped_optout', ''); return new Response('EVENT_RECEIVED', { status: 200 }) }
    let reply = ''; let intent = det.intent
    if (det.intent === 'points') reply = await pointsSummary(db, normPhone(from))
    else if (det.intent === 'giftcard' && det.code) reply = await giftcardInfo(db, det.code)
    else if (det.intent === 'giftcard_ask') reply = 'Envoie-moi le code de ta carte cadeau (format GC-XXXXXX) et je te donne le solde tout de suite.'
    else if (det.intent === 'howto') reply = C.howto || 'A chaque achat tu gagnes des points, et tu peux payer avec une carte cadeau.'
    else if (det.intent === 'menu') reply = C.greeting || 'Bonjour ! 1 = points, 2 = carte cadeau, 3 = comment ca marche.'
    else if (det.intent === 'human') { reply = C.handoff_notice || 'Un conseiller va te recontacter.'; try { await db.from('wa_bot_handoff').insert({ phone: from, msg: text.slice(0, 500) }) } catch (_) {}; if (C.team_phone) await sendText(digits(C.team_phone), `Nouvelle demande client sur WhatsApp (${from}) : "${text.slice(0,200)}"`) }
    else {
      if (C.llm_enabled === true) {
        const ctx = await pointsSummary(db, normPhone(from))
        const ans = await llmAnswer(text, `Infos disponibles sur ce client:\n${ctx}\n\nFAQ:\n${C.howto || ''}`)
        if (ans && ans.trim().toUpperCase() !== 'HANDOFF') { reply = ans.trim(); intent = 'llm' }
        else { reply = C.handoff_notice || 'Un conseiller va te recontacter.'; intent = 'human'; try { await db.from('wa_bot_handoff').insert({ phone: from, msg: text.slice(0, 500) }) } catch (_) {}; if (C.team_phone) await sendText(digits(C.team_phone), `Question client non resolue (${from}) : "${text.slice(0,200)}"`) }
      } else { reply = C.fallback || 'Reponds 1 pour tes points, 2 pour une carte cadeau, 3 pour comment ca marche, ou ecris "conseiller".'; intent = 'fallback' }
    }
    if (reply) await sendText(from, reply)
    await log(intent, reply)
  } catch (e) { console.error('wa-assistant', (e as Error).message) }
  return new Response('EVENT_RECEIVED', { status: 200 })
})
