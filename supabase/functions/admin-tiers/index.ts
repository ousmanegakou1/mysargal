// MySargal — admin-tiers : configuration du programme à statuts (Summit Club) par boutique.
// Réservé aux admins (JWT ms_admin vérifié). CRUD paliers + récompenses + config points.
// Actions : merchants | get {merchant_id} | save_config | save_tier | delete_tier
//           | save_reward | delete_reward | assign_member_numbers
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

const FAMILIES = ["cadeaux_exclusifs", "evenements_exclusifs", "experiences_uniques", "services_personnalises", "points_echangeables"];
const clampInt = (v: unknown, def = 0) => { const n = parseInt(String(v)); return Number.isFinite(n) ? n : def; };
const str = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwtSecret = Deno.env.get("MS_JWT_SECRET")!;
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const claims = await verifyJwt(tok, jwtSecret);
    if (!claims || claims.ms_admin !== "true") return json({ error: "Non autorisé" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json().catch(() => ({}));
    const action = String(b.action || "");

    // ---- liste des boutiques (pour le sélecteur) ----
    if (action === "merchants") {
      const { data } = await sb.from("merchants").select("id,name").order("name");
      return json({ merchants: data || [] });
    }

    // ---- lecture config + paliers + récompenses d'une boutique ----
    if (action === "get") {
      const mid = str(b.merchant_id, 60);
      if (!mid) return json({ error: "merchant_id requis" }, 400);
      const [{ data: merchant }, { data: tiers }, { data: rewards }, { data: cardCount }] = await Promise.all([
        sb.from("merchants").select("id,name,reward_config").eq("id", mid).single(),
        sb.from("sargal_tiers").select("*").eq("merchant_id", mid).order("priority"),
        sb.from("sargal_rewards").select("*").eq("merchant_id", mid).order("family").order("sort_order"),
        sb.from("loyalty_cards").select("id,member_number", { count: "exact", head: false }).eq("merchant_id", mid),
      ]);
      const cfg = (merchant?.reward_config || {}) as Record<string, any>;
      const withNum = (cardCount || []).filter((c: any) => c.member_number).length;
      return json({
        merchant: { id: merchant?.id, name: merchant?.name },
        config: {
          enabled: cfg.maraz_summit_club === true || (tiers || []).length > 0,
          point_ratio_fcfa: cfg.point_ratio_fcfa || null,
          point_rounding: cfg.point_rounding || "none",
          annual_reset: cfg.annual_reset === true,
        },
        tiers: tiers || [],
        rewards: rewards || [],
        cards_total: (cardCount || []).length,
        cards_with_member_number: withNum,
      });
    }

    // ---- config points de la boutique ----
    if (action === "save_config") {
      const mid = str(b.merchant_id, 60);
      if (!mid) return json({ error: "merchant_id requis" }, 400);
      const { data: m } = await sb.from("merchants").select("reward_config").eq("id", mid).single();
      const cfg = (m?.reward_config || {}) as Record<string, any>;
      cfg.maraz_summit_club = b.enabled === true;
      const ratio = clampInt(b.point_ratio_fcfa, 0);
      if (ratio > 0) cfg.point_ratio_fcfa = ratio; else delete cfg.point_ratio_fcfa;
      cfg.point_rounding = b.point_rounding === "floor_10k" ? "floor_10k" : "none";
      cfg.annual_reset = b.annual_reset === true;
      // Le mode "points selon le montant" côté caisse suit le même ratio.
      const patch: Record<string, any> = { reward_config: cfg };
      if (ratio > 0) { patch.pts_amount_mode = true; patch.pts_fcfa_per_point = ratio; }
      const { error } = await sb.from("merchants").update(patch).eq("id", mid);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ---- upsert palier ----
    if (action === "save_tier") {
      const mid = str(b.merchant_id, 60);
      const t = b.tier || {};
      const row: Record<string, any> = {
        name: str(t.name, 40) || "Palier",
        min_points: clampInt(t.min_points, 0),
        max_points: (t.max_points === null || t.max_points === "" || t.max_points === undefined) ? null : clampInt(t.max_points),
        min_spend_year: clampInt(t.min_spend_year, 0),
        color_hex: str(t.color_hex, 9) || null,
      };
      if (Array.isArray(t.benefits_json)) row.benefits_json = t.benefits_json;
      if (t.id) {
        const { data, error } = await sb.from("sargal_tiers").update(row).eq("id", str(t.id, 60)).select().single();
        if (error) return json({ error: error.message }, 400);
        return json({ success: true, tier: data });
      }
      if (!mid) return json({ error: "merchant_id requis" }, 400);
      // priorité auto = max + 1
      const { data: mx } = await sb.from("sargal_tiers").select("priority").eq("merchant_id", mid).order("priority", { ascending: false }).limit(1);
      row.merchant_id = mid;
      row.priority = (mx && mx[0] ? Number(mx[0].priority) : 0) + 1;
      const { data, error } = await sb.from("sargal_tiers").insert(row).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ success: true, tier: data });
    }

    if (action === "delete_tier") {
      const id = str(b.id, 60);
      if (!id) return json({ error: "id requis" }, 400);
      const { error } = await sb.from("sargal_tiers").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ---- upsert récompense ----
    if (action === "save_reward") {
      const mid = str(b.merchant_id, 60);
      const r = b.reward || {};
      const family = FAMILIES.includes(String(r.family)) ? String(r.family) : "points_echangeables";
      const row: Record<string, any> = {
        family,
        name: str(r.name, 120) || "Récompense",
        description: str(r.description, 400) || null,
        points_cost: clampInt(r.points_cost, 0),
        tier_required_id: r.tier_required_id ? str(r.tier_required_id, 60) : null,
        active: r.active !== false,
        sort_order: clampInt(r.sort_order, 10),
      };
      if (r.id) {
        const { data, error } = await sb.from("sargal_rewards").update(row).eq("id", str(r.id, 60)).select().single();
        if (error) return json({ error: error.message }, 400);
        return json({ success: true, reward: data });
      }
      if (!mid) return json({ error: "merchant_id requis" }, 400);
      row.merchant_id = mid;
      const { data, error } = await sb.from("sargal_rewards").insert(row).select().single();
      if (error) return json({ error: error.message }, 400);
      return json({ success: true, reward: data });
    }

    if (action === "delete_reward") {
      const id = str(b.id, 60);
      if (!id) return json({ error: "id requis" }, 400);
      const { error } = await sb.from("sargal_rewards").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ---- attribution des numéros de membre aux cartes qui n'en ont pas ----
    if (action === "assign_member_numbers") {
      const mid = str(b.merchant_id, 60);
      const prefix = (str(b.prefix, 6) || "MB").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!mid) return json({ error: "merchant_id requis" }, 400);
      const { data: cards } = await sb.from("loyalty_cards").select("id,created_at,member_number").eq("merchant_id", mid).order("created_at");
      let seq = 0; let assigned = 0;
      for (const c of (cards || [])) {
        seq++;
        if (c.member_number) continue;
        const num = `${prefix}-${String(seq).padStart(5, "0")}`;
        const { error } = await sb.from("loyalty_cards").update({ member_number: num }).eq("id", c.id);
        if (!error) assigned++;
      }
      return json({ success: true, assigned });
    }

    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
