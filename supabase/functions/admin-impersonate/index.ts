// MySargal — admin-impersonate : un admin obtient un jeton de session marchand
// pour voir/aider depuis son panel. Audité dans whatsapp_logs (template=admin_impersonate).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function adminClaims(req: Request): Record<string, unknown> | null {
  try {
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    return JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch (_) { return null; }
}
function b64url(d: Uint8Array | string): string {
  const b = typeof d === "string" ? new TextEncoder().encode(d) : d;
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function mintJwt(secret: string, claims: Record<string, unknown>, ttl: number) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttl }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${h}.${p}`)));
  return `${h}.${p}.${b64url(sig)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const claims = adminClaims(req);
    if (claims?.ms_admin !== "true" || claims?.iss !== "mysargal") return ok({ error: "Réservé à l'administrateur" }, 403);
    const jwtSecret = Deno.env.get("MS_JWT_SECRET");
    if (!jwtSecret) return ok({ error: "MS_JWT_SECRET manquant" }, 500);

    const { merchant_id } = await req.json();
    if (!merchant_id) return ok({ error: "merchant_id requis" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: m } = await sb.from("merchants").select("id, phone, name").eq("id", merchant_id).single();
    if (!m) return ok({ error: "Commerçant introuvable" }, 404);

    // Jeton marchand court (2h) avec marqueur d'impersonation
    const token = await mintJwt(jwtSecret, { role: "authenticated", iss: "mysargal", phone: m.phone, impersonated_by: "admin" }, 60 * 60 * 2);
    // Audit
    await sb.from("whatsapp_logs").insert({ merchant_id: m.id, to_phone: m.phone, template: "admin_impersonate", message: `Admin a ouvert le panel de ${m.name}`, status: "sent", provider: "system" });

    return ok({ success: true, token, merchant: m });
  } catch (e) {
    return ok({ error: (e as Error).message }, 500);
  }
});
