// MySargal — admin-marketplace : vue reversements marketplace (réservé admin JWT).
// Actions : summary | merchants | set_merchant {id, active, pct} | mark_paid {merchant_id}
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
    if (!claims || claims.ms_admin !== "true") return json({ error: "Non autorisé" }, 401);
    const isSuper = ((claims.adm_role as string) || "super") === "super";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "summary");

    if (action === "summary") {
      const { data, error } = await sb.rpc("marketplace_settlement_summary");
      if (error) return json({ error: error.message }, 500);
      const rows = data || [];
      const totals = (rows as any[]).reduce((a, r) => { a.commission += Number(r.commission_earned) || 0; a.due += Number(r.net_due) || 0; a.paid += Number(r.net_paid) || 0; a.cards += Number(r.cards_sold) || 0; return a; }, { commission: 0, due: 0, paid: 0, cards: 0 });
      return json({ rows, totals });
    }
    if (action === "merchants") {
      const { data } = await sb.from("merchants").select("id,name,marketplace_active,marketplace_commission_pct,active").order("name");
      return json({ merchants: data || [] });
    }
    if (action === "set_merchant") {
      if (!isSuper) return json({ error: "Réservé au super admin" }, 403);
      const id = String(b.id || ""); if (!id) return json({ error: "id requis" }, 400);
      const pct = Math.max(0, Math.min(Number(b.pct) || 0, 90));
      const { error } = await sb.from("merchants").update({ marketplace_active: b.active === true, marketplace_commission_pct: pct }).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }
    if (action === "mark_paid") {
      if (!isSuper) return json({ error: "Réservé au super admin" }, 403);
      const mid = String(b.merchant_id || ""); if (!mid) return json({ error: "merchant_id requis" }, 400);
      const { data, error } = await sb.from("giftcard_settlements").update({ payout_status: "paid", paid_at: new Date().toISOString() }).eq("merchant_id", mid).eq("payout_status", "due").select("id");
      if (error) return json({ error: error.message }, 400);
      return json({ success: true, marked: (data || []).length });
    }
    return json({ error: "Action inconnue" }, 400);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
