// MySargal — admin-assistant : pilotage de l'assistant WhatsApp (reserve admin JWT).
// Actions : config | save_config | stats | recent | handoffs | resolve_handoff
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function b64urlDecode(s: string): Uint8Array { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> { try { const [h, p, sig] = token.split("."); if (!h || !p || !sig) return null; const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]); const ok = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${p}`)); if (!ok) return null; const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p))); if (claims.exp && claims.exp * 1000 < Date.now()) return null; return claims; } catch (_) { return null; } }

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
    const action = String(b.action || "config");

    if (action === "config") {
      const { data } = await db.from("wa_bot_config").select("*").eq("id", 1).maybeSingle();
      return json({ config: data || {}, llm_key_present: !!Deno.env.get("ANTHROPIC_API_KEY") });
    }
    if (action === "save_config") {
      if (!isSuper) return json({ error: "Reserve au super admin" }, 403);
      const c = b.config || {};
      const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["enabled", "greeting", "howto", "handoff_notice", "fallback", "team_phone", "llm_enabled"]) if (k in c) upd[k] = c[k];
      const { error } = await db.from("wa_bot_config").update(upd).eq("id", 1);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }
    if (action === "stats") {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data: rows } = await db.from("wa_bot_log").select("intent,created_at").gte("created_at", since).limit(5000);
      const list = rows || [];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const byIntent: Record<string, number> = {};
      let todayCount = 0;
      for (const r of list as any[]) { byIntent[r.intent || 'autre'] = (byIntent[r.intent || 'autre'] || 0) + 1; if (new Date(r.created_at) >= today) todayCount++; }
      const { count: openHand } = await db.from("wa_bot_handoff").select("id", { count: "exact", head: true }).eq("status", "open");
      return json({ total_30d: list.length, today: todayCount, by_intent: byIntent, open_handoffs: openHand || 0 });
    }
    if (action === "recent") {
      const { data } = await db.from("wa_bot_log").select("phone,msg_in,intent,reply_out,created_at").order("created_at", { ascending: false }).limit(40);
      return json({ rows: data || [] });
    }
    if (action === "handoffs") {
      const { data } = await db.from("wa_bot_handoff").select("id,phone,msg,status,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(50);
      return json({ rows: data || [] });
    }
    if (action === "resolve_handoff") {
      const id = String(b.id || ""); if (!id) return json({ error: "id requis" }, 400);
      await db.from("wa_bot_handoff").update({ status: "done", resolved_at: new Date().toISOString() }).eq("id", id);
      return json({ success: true });
    }
    return json({ error: "Action inconnue" }, 400);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
