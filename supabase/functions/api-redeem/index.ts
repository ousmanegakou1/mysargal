// ============================================================
// MySargal — api-redeem (POS / partenaires) : UTILISER une récompense.
// Déduit les points de la carte au moment de l'achat en caisse.
// Auth : header x-api-key (clé du marchand, table api_partners).
// Body : { card_code, reward_id? }
//   - sans reward_id : récompense par défaut du marchand (threshold → reward_desc)
//   - avec reward_id : récompense du catalogue (pts_cost)
// Répond 402 si le client n'a pas assez de points.
// (v2 — l'ancienne version ajoutait des points par erreur ; utiliser api-scan pour créditer.)
// ============================================================
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
    const { data: partner } = await sb.from("api_partners").select("id,name,merchant_id,active").eq("api_key", apiKey).single();
    if (!partner) return json({ error: "Clé API invalide" }, 401);
    if (!partner.active) return json({ error: "Clé API désactivée" }, 401);

    const { card_code, reward_id } = await req.json();
    if (!card_code) return json({ error: "card_code requis" }, 400);
    const code = String(card_code).trim().toUpperCase();

    const [{ data: card }, { data: merchant }] = await Promise.all([
      sb.from("loyalty_cards").select("id,pts,client_name").eq("code", code).eq("merchant_id", partner.merchant_id).single(),
      sb.from("merchants").select("name,threshold,reward_desc,plan,plan_expires").eq("id", partner.merchant_id).single(),
    ]);
    if (!card) return json({ error: "Carte introuvable" }, 404);
    if (!merchant) return json({ error: "Marchand introuvable" }, 404);
    if (merchant.plan_expires && new Date(merchant.plan_expires).getTime() < Date.now()) {
      return json({ error: "Abonnement MySargal expiré" }, 402);
    }

    let reward: any = null;
    if (reward_id) {
      const { data } = await sb.from("rewards").select("*").eq("id", reward_id).eq("merchant_id", partner.merchant_id).single();
      if (!data) return json({ error: "Récompense introuvable" }, 404);
      reward = data;
    }
    const ptsCost = reward?.pts_cost || merchant.threshold || 10;
    const label = reward?.name || merchant.reward_desc || "Récompense";

    if ((card.pts || 0) < ptsCost) {
      return json({ error: `Pas assez de points`, points_disponibles: card.pts || 0, points_requis: ptsCost, reward_ready: false }, 402);
    }

    const newPts = (card.pts || 0) - ptsCost;
    await sb.from("loyalty_cards").update({ pts: newPts }).eq("id", card.id);
    await sb.from("transactions").insert({
      card_id: card.id, merchant_id: partner.merchant_id, pts: -ptsCost, type: "reward",
      note: label + ` (via ${partner.name})`, source: "api",
    });
    // Summit Club : le débit réduit aussi les points actifs (cohérent avec l'espace membre)
    try {
      const { data: tx } = await sb.from("sargal_tiers").select("id").eq("merchant_id", partner.merchant_id).limit(1);
      if (tx && tx.length) {
        try { await sb.from("sargal_points").insert({ merchant_id: partner.merchant_id, card_id: card.id, delta: -ptsCost, reason: "Redeem: " + label, source: "redeem", earned_at: new Date().toISOString() }); } catch (_) {}
        try { await sb.rpc("reevaluate_tier", { p_card_id: card.id }); } catch (_) {}
      }
    } catch (_) {}
    if (reward_id) await sb.from("rewards").update({ redemptions: (reward.redemptions || 0) + 1 }).eq("id", reward_id);

    // Wallet à jour (fire-and-forget)
    try { fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-google-pass?code=${encodeURIComponent(code)}`, { method: "POST" }).catch(() => {}) } catch (_) {}
    try { fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-apple-pass?code=${encodeURIComponent(code)}`, { method: "POST" }).catch(() => {}) } catch (_) {}

    return json({
      success: true, card_code: code, client: card.client_name,
      reward: label, points_used: ptsCost, points_remaining: newPts,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
