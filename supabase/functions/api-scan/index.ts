import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // 1. Vérifier la clé API partenaire
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) throw new Error("Clé API manquante");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: partner, error: pErr } = await supabase
      .from("api_partners")
      .select("id, name, merchant_id, active")
      .eq("api_key", apiKey)
      .single();

    if (pErr || !partner) throw new Error("Clé API invalide");
    if (!partner.active) throw new Error("Clé API désactivée");
    // Sans boutique rattachée, la clé pourrait créditer n'importe quelle carte.
    if (!partner.merchant_id) throw new Error("Clé API non rattachée à une boutique");

    // 2. Lire le body
    const { card_code, points, note, operator_ref, operator_name, operator_src } = await req.json();
    if (!card_code) throw new Error("card_code requis");
    if (!points || points <= 0) throw new Error("points doit être > 0");

    // Identité de l'opérateur, déclarée par la caisse du commerçant.
    // MySargal ne peut pas la vérifier : elle vient du système du client.
    // On la conserve telle quelle, bornée en longueur.
    const coupe = (v: unknown, n: number) => {
      const s = String(v ?? "").trim();
      return s ? s.slice(0, n) : null;
    };
    const opRef  = coupe(operator_ref, 80);
    const opName = coupe(operator_name, 80);
    const opSrc  = coupe(operator_src, 40);

    // 3. Trouver la carte
    // Cloisonnement : on ne crédite que les cartes de la boutique de la clé.
    const { data: card, error: cErr } = await supabase
      .from("loyalty_cards")
      .select("id, pts, lifetime_pts, merchant_id, client_name")
      .eq("code", card_code)
      .eq("active", true)
      .eq("merchant_id", partner.merchant_id)
      .maybeSingle();

    if (cErr || !card) throw new Error("Carte introuvable ou inactive");

    // 4. Mettre à jour les points
    const newPts = card.pts + points;
    const newLifetime = card.lifetime_pts + points;

    await supabase
      .from("loyalty_cards")
      .update({ pts: newPts, lifetime_pts: newLifetime })
      .eq("id", card.id);

    // 5. Enregistrer la transaction
    await supabase.from("transactions").insert({
      merchant_id: card.merchant_id,
      loyalty_card_id: card.id,
      pts: points,
      note: note || `Scan via partenaire ${partner.name}`,
      operator_ref: opRef,
      operator_name: opName,
      operator_src: opSrc || partner.name || null,
      created_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({
      success: true,
      card_code,
      client: card.client_name,
      points_added: points,
      total_points: newPts,
      lifetime_points: newLifetime,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});