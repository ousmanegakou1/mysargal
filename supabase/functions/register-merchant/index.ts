// ============================================================
// MySargal — register-merchant : inscription/màj boutique APRES OTP.
// Nouveau compte = ESSAI complet (toutes features) pendant N jours
// (settings.landing_billing.trial_days, défaut 90), puis blocage si non payé.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const bad = (m: string, s = 400) => ok({ error: m }, s);

function jwtClaims(req: Request): Record<string, unknown> | null {
  try {
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    return JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch (_) { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const claims = jwtClaims(req);
    const phone = String(claims?.phone || "").trim();
    if (!phone || claims?.iss !== "mysargal") return bad("Session invalide — vérifie d'abord ton numéro par OTP", 401);

    const b = await req.json();
    const name = String(b.name || "").trim().slice(0, 60);
    if (!name) return bad("Nom de la boutique requis");
    const ALLOWED_TYPES = ["restaurant", "epicerie", "beaute", "service", "sante", "tech", "autre"];
    const type = ALLOWED_TYPES.includes(b.type) ? b.type : "autre";
    const threshold = Math.min(Math.max(parseInt(b.threshold) || 10, 2), 500);
    const reward_desc = String(b.reward_desc || "Récompense").slice(0, 120);
    const emoji = ({ restaurant: "☕", epicerie: "🛒", beaute: "💅", service: "🔧", sante: "💊", tech: "📱" } as Record<string, string>)[type] || "🏪";
    const pts_amount_mode = b.pts_amount_mode === true;
    const pts_fcfa_per_point = Math.min(Math.max(parseInt(b.pts_fcfa_per_point) || 1000, 100), 1000000);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Durée d'essai configurable depuis l'admin
    let trialDays = 90;
    try {
      const { data: bs } = await sb.from("settings").select("value").eq("key", "landing_billing").single();
      if (bs?.value?.trial_days) trialDays = Math.min(Math.max(parseInt(bs.value.trial_days), 7), 365);
    } catch (_) {}

    const { data: existing } = await sb.from("merchants")
      .select("*").eq("phone", phone).order("created_at", { ascending: false }).limit(1);

    const fields = { name, type, emoji, threshold, reward_desc, pts_amount_mode, pts_fcfa_per_point, active: true };
    let merchant = null;
    if (existing && existing.length) {
      // Compte existant : on ne touche PAS au plan ni à l'échéance
      const { data: upd, error } = await sb.from("merchants")
        .update(fields).eq("id", existing[0].id).select().single();
      if (error) return bad("Erreur: " + error.message, 500);
      merchant = upd;
    } else {
      const { data: ins, error } = await sb.from("merchants").insert({
        ...fields, phone,
        plan: "trial",
        plan_expires: new Date(Date.now() + trialDays * 86400000).toISOString(),
      }).select().single();
      if (error) return bad("Erreur: " + error.message, 500);
      merchant = ins;
    }

    return ok({ success: true, merchant, existing: !!(existing && existing.length), trial_days: trialDays });
  } catch (e) {
    return bad("Erreur: " + (e as Error).message, 500);
  }
});
