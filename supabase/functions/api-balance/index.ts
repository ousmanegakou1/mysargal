// MySargal — api-balance : consulter une carte (fidélité ou gift card) depuis un POS/partenaire.
// v2 : ajoute reward_ready / threshold / rewards_available → l'écran de caisse sait
// immédiatement si le client a atteint sa récompense (puis api-redeem pour la déduire).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const apiKey = req.headers.get("x-api-key") || new URL(req.url).searchParams.get("key") || "";
    if (!apiKey) return json({ error: "Clé API manquante" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: partner } = await sb.from("api_partners").select("id, merchant_id, active").eq("api_key", apiKey).single();
    if (!partner) return json({ error: "Clé API invalide" }, 401);
    if (!partner.active) return json({ error: "Clé API désactivée" }, 401);
    // Une clé doit être rattachée à une boutique, sinon elle verrait tout le monde.
    if (!partner.merchant_id) return json({ error: "Clé API non rattachée à une boutique" }, 403);
    const boutique = String(partner.merchant_id);

    const url = new URL(req.url);
    let card_code = url.searchParams.get("card_code");
    if (!card_code && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      card_code = body.card_code;
    }
    if (!card_code) return json({ error: "card_code requis" }, 400);
    const code = String(card_code).trim().toUpperCase();

    // Cloisonnement : une clé ne voit que les cartes de sa propre boutique.
    const { data: card } = await sb.from("loyalty_cards")
      .select("code, client_name, pts, lifetime_pts, active, merchant_id")
      .eq("code", code).eq("merchant_id", boutique).maybeSingle();
    if (card) {
      const [{ data: merchant }, { data: rewards }] = await Promise.all([
        sb.from("merchants").select("threshold, reward_desc").eq("id", card.merchant_id).single(),
        sb.from("rewards").select("id, name, emoji, pts_cost").eq("merchant_id", card.merchant_id).eq("active", true).order("pts_cost"),
      ]);
      const threshold = merchant?.threshold || 10;
      const pts = card.pts || 0;
      return json({
        success: true, type: "loyalty_card", code: card.code,
        client: card.client_name, points: pts, lifetime_points: card.lifetime_pts, active: card.active,
        // ── pour l'écran de caisse ──
        threshold, reward_desc: merchant?.reward_desc || "Récompense",
        reward_ready: pts >= threshold,
        points_remaining: Math.max(0, threshold - pts),
        rewards_available: (rewards || []).filter((r: any) => pts >= r.pts_cost),
      });
    }
    const { data: gc } = await sb.from("gift_cards")
      .select("code, recipient_name, balance, initial_amount, status, expires_at")
      .eq("code", code).eq("merchant_id", boutique).maybeSingle();
    if (gc) return json({ success: true, type: "gift_card", code: gc.code, recipient: gc.recipient_name, balance: gc.balance, initial_amount: gc.initial_amount, status: gc.status, expires_at: gc.expires_at });
    return json({ error: "Carte introuvable" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
