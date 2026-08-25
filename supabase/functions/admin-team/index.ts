// MySargal — admin-team : gestion de l'équipe admin. Réservé au SUPER admin (JWT vérifié).
// Actions : list | add {name, phone, password, role?} | toggle {id} | delete {id} | reset {id, password}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch (_) { return null; }
}
async function sha256hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const digits = (p: string) => String(p || "").replace(/\D/g, "");
const randomSalt = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwtSecret = Deno.env.get("MS_JWT_SECRET")!;
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const claims = await verifyJwt(tok, jwtSecret);
    if (!claims || claims.ms_admin !== "true") return json({ error: "Non autorisé" }, 401);
    const role = (claims.adm_role as string) || "super"; // legacy = super
    if (role !== "super") return json({ error: "Réservé au super admin" }, 403);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json();
    const action = String(b.action || "list");

    if (action === "list") {
      const { data } = await sb.from("ms_admins").select("id,name,phone,role,active,last_login,created_at").order("created_at");
      return json({ admins: data || [] });
    }

    if (action === "add") {
      const name = String(b.name || "").trim().slice(0, 60);
      const phone = digits(b.phone);
      const password = String(b.password || "");
      if (!name || phone.length < 8) return json({ error: "Nom et téléphone valides requis" }, 400);
      if (password.length < 8) return json({ error: "Mot de passe : 8 caractères minimum" }, 400);
      const salt = randomSalt();
      const password_hash = await sha256hex(salt + ":" + password);
      const { data, error } = await sb.from("ms_admins")
        .insert({ name, phone, salt, password_hash, role: b.role === "super" ? "super" : "admin" })
        .select("id,name,phone,role,active").single();
      if (error) return json({ error: error.message.includes("duplicate") ? "Ce numéro a déjà un compte admin" : error.message }, 400);
      return json({ success: true, admin: data });
    }

    if (action === "toggle") {
      const { data: cur } = await sb.from("ms_admins").select("active").eq("id", b.id).single();
      if (!cur) return json({ error: "Admin introuvable" }, 404);
      await sb.from("ms_admins").update({ active: !cur.active }).eq("id", b.id);
      return json({ success: true, active: !cur.active });
    }

    if (action === "delete") {
      await sb.from("ms_admins").delete().eq("id", b.id);
      return json({ success: true });
    }

    if (action === "reset") {
      const password = String(b.password || "");
      if (password.length < 8) return json({ error: "Mot de passe : 8 caractères minimum" }, 400);
      const salt = randomSalt();
      const password_hash = await sha256hex(salt + ":" + password);
      const { error } = await sb.from("ms_admins").update({ salt, password_hash }).eq("id", b.id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
