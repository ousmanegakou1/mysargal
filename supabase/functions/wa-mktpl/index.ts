// MySargal — wa-mktpl : create (erreur détaillée)/list/delete. Secret: WA_TOKEN.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const TOKEN = Deno.env.get('WA_TOKEN'); if (!TOKEN) return json({ error: 'WA_TOKEN manquant' }, 500)
    const b = await req.json().catch(() => ({}))
    const waba = String(b.waba_id || '')
    const H = { 'Authorization': `Bearer ${TOKEN}` }
    if (b.action === 'list') {
      let url = `https://graph.facebook.com/v21.0/${waba}/message_templates?limit=200&fields=name,status`
      const names: any[] = []; const byStatus: Record<string, number> = {}
      for (let i = 0; i < 5 && url; i++) { const r = await fetch(url, { headers: H }); const d = await r.json().catch(()=>({}))
        for (const t of (d.data||[])) { names.push({name:t.name,status:t.status}); byStatus[t.status]=(byStatus[t.status]||0)+1 } url = d.paging?.next||'' }
      return json({ count: names.length, byStatus, names })
    }
    if (b.action === 'create') {
      const url = `https://graph.facebook.com/v21.0/${waba}/message_templates`
      const out: any[] = []
      for (const p of (b.templates || [])) {
        try {
          const r = await fetch(url, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
          const d = await r.json().catch(() => ({}))
          out.push({ name: p.name, status: r.status, ok: r.ok, id: d.id, tstatus: d.status,
            err: r.ok ? null : { code: d.error?.code, sub: d.error?.error_subcode, msg: d.error?.message, title: d.error?.error_user_title, umsg: d.error?.error_user_msg } })
        } catch (e) { out.push({ name: p.name, status: 0, err: (e as Error).message }) }
        await new Promise((res) => setTimeout(res, 300))
      }
      return json({ total: out.length, results: out })
    }
    return json({ error: 'action inconnue' }, 400)
  } catch (e) { return json({ error: (e as Error).message }, 500) }
})
