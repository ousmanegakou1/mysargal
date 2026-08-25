// MySargal — notify-whatsapp : DÉSACTIVÉ. WaSender supprimé. Tout passe désormais par les templates officiels (wa-send).
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  return new Response(JSON.stringify({ success: false, disabled: true, reason: 'WaSender désactivé — utiliser les templates officiels (wa-send).' }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })
})
