// Neutralisée (outil temporaire de correction de template, désactivé).
Deno.serve(() => new Response(JSON.stringify({ disabled: true }), { status: 410, headers: { 'Content-Type': 'application/json' } }))
