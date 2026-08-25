// MySargal — admin-login v2 : mot de passe maître (super) OU compte admin individuel (téléphone + mot de passe).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function mintJwt(secret: string, claims: Record<string, unknown>, ttlSec: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttlSec }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(sig)}`;
}
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}
async function sha256hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const digits = (p: string) => String(p || "").replace(/\D/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { password, phone } = await req.json();
    const master = Deno.env.get("ADMIN_PASSWORD");
    const jwtSecret = Deno.env.get("MS_JWT_SECRET");
    if (!master || !jwtSecret) throw new Error("Configuration serveur incomplète");
    if (!password) { await new Promise((r) => setTimeout(r, 900)); return json({ error: "Mot de passe requis" }, 401); }

    let claims: Record<string, unknown> | null = null;
    let who = { role: "super", name: "Super Admin" };

    if (phone && digits(phone).length >= 8) {
      // ── Compte admin individuel ──
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: rows } = await sb.from("ms_admins").select("*").eq("active", true);
      const adm = (rows || []).find((a: any) => digits(a.phone) === digits(phone));
      if (adm) {
        const h = await sha256hex(adm.salt + ":" + String(password));
        if (safeEqual(h, adm.password_hash)) {
          claims = { role: "authenticated", iss: "mysargal", ms_admin: "true", adm_role: adm.role, adm_name: adm.name, adm_id: adm.id };
          who = { role: adm.role, name: adm.name };
          sb.from("ms_admins").update({ last_login: new Date().toISOString() }).eq("id", adm.id).then(() => {});
        }
      }
    } else if (safeEqual(String(password), master)) {
      // ── Mot de passe maître = super admin ──
      claims = { role: "authenticated", iss: "mysargal", ms_admin: "true", adm_role: "super", adm_name: "Super Admin" };
    }

    if (!claims) { await new Promise((r) => setTimeout(r, 900)); return json({ error: "Identifiants incorrects" }, 401); }

    const token = await mintJwt(jwtSecret, claims, 60 * 60 * 24);
    return json({ success: true, token, expires_in: 86400, role: who.role, name: who.name });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});
