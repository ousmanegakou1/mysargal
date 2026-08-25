// MySargal — wa-templates : liste les modèles d'un WABA (diagnostic). ?waba=ID
Deno.serve(async (req) => {
  const TOKEN = Deno.env.get('WA_TOKEN')
  if (!TOKEN) return new Response(JSON.stringify({ error: 'WA_TOKEN manquant' }), { status: 500 })
  const url = new URL(req.url)
  const waba = url.searchParams.get('waba')
  if (!waba) return new Response(JSON.stringify({ error: 'waba requis' }), { status: 400 })
  const r = await fetch(`https://graph.facebook.com/v21.0/${waba}/message_templates?fields=name,language,status,category&limit=100`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } })
})
