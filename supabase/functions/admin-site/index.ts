// MySargal — admin-site : th[me de saison actif (reserve admin). Actions: get | set {active_theme, banner_text}
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function b64urlDecode(s: string): Uint8Array { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> { try { const [h, p, sig] = token.split("."); if (!h || !p || !sig) return null; const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`)); if (!ok) return null; const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p))); if (claims.exp && claims.exp * 1000 < Date.now()) return null; return claims; } catch (_) { return null; } }
const THEMES = ['oct_rose','noel','ramadan','tabaski','valentin','independance','nouvelan','magal'];
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwtSecret = Deno.env.get("MS_JWT_SECRET")!;
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const claims = await verifyJwt(tok, jwtSecret);
    if (!claims || claims.ms_admin !== "true") return json({ error: "Non autorise" }, 401);
    const isSuper = ((claims.adm_role as string) || "super") === "super";
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "get");
    if (action === "get") {
      const { data } = await db.from("site_config").select("active_theme,banner_text").eq("id", 1).maybeSingle();
      return json({ config: data || {} });
    }
    if (action === "set") {
      if (!isSuper) return json({ error: "Reserve au super admin" }, 403);
      let theme = b.active_theme ? String(b.active_theme) : null;
      if (theme && !THEMES.includes(theme)) theme = null;
      const banner = b.banner_text != null ? String(b.banner_text).slice(0, 160) : null;
      const { error } = await db.from("site_config").update({ active_theme: theme, banner_text: banner, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true, active_theme: theme });
    }
    return json({ error: "Action inconnue" }, 400);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
