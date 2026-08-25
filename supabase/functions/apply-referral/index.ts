// ============================================================
// MySargal — apply-referral : crédite parrain ET filleul
// Appelé par l'app marchande après création d'une carte avec code parrain.
// Entrée : { merchant_id, referrer_code, referee_code }
// Bonus = merchants.reward_config.referral_bonus (points, les deux parties).
// Garde-fous : même marchand, parrain ≠ filleul, filleul parrainé 1 seule fois.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const bad = (m: string, s = 400) => ok({ error: m }, s);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { merchant_id, referrer_code, referee_code } = await req.json();
    if (!merchant_id || !referrer_code || !referee_code) return bad("merchant_id, referrer_code et referee_code requis");
    if (String(referrer_code).trim().toUpperCase() === String(referee_code).trim().toUpperCase()) return bad("Le parrain et le filleul doivent être différents");

    const { data: merchant } = await sb.from("merchants").select("id,name,reward_config").eq("id", merchant_id).single();
    if (!merchant) return bad("Commerçant introuvable", 404);
    const bonus = Number((merchant.reward_config || {}).referral_bonus || 0);
    if (bonus <= 0) return bad("Le parrainage n'est pas activé pour cette boutique (bonus = 0)");

    const norm = (c: string) => String(c).trim().toUpperCase();
    const { data: referrer } = await sb.from("loyalty_cards")
      .select("id,code,client_name,client_phone,pts,lifetime_pts,whatsapp_opt_in,active")
      .eq("code", norm(referrer_code)).eq("merchant_id", merchant_id).single();
    if (!referrer || referrer.active === false) return bad("Code parrain introuvable dans cette boutique", 404);

    const { data: referee } = await sb.from("loyalty_cards")
      .select("id,code,client_name,client_phone,pts,lifetime_pts")
      .eq("code", norm(referee_code)).eq("merchant_id", merchant_id).single();
    if (!referee) return bad("Carte du filleul introuvable", 404);

    // Un filleul ne peut être parrainé qu'une fois (contrainte unique en base)
    const { error: refErr } = await sb.from("referrals").insert({
      merchant_id, referrer_card_id: referrer.id, referee_card_id: referee.id, bonus_pts: bonus,
    });
    if (refErr) {
      if (String(refErr.message).includes("duplicate") || String(refErr.code) === "23505") return bad("Ce client a déjà été parrainé");
      return bad("Erreur: " + refErr.message, 500);
    }

    // Crédits + transactions (traçables : source=referral)
    await sb.from("loyalty_cards").update({ pts: (referrer.pts || 0) + bonus, lifetime_pts: (referrer.lifetime_pts || 0) + bonus }).eq("id", referrer.id);
    await sb.from("loyalty_cards").update({ pts: (referee.pts || 0) + bonus, lifetime_pts: (referee.lifetime_pts || 0) + bonus }).eq("id", referee.id);
    await sb.from("transactions").insert([
      { card_id: referrer.id, merchant_id, pts: bonus, type: "earn", note: `Parrainage de ${referee.client_name || "un ami"} 🤝`, source: "referral" },
      { card_id: referee.id, merchant_id, pts: bonus, type: "earn", note: `Bienvenue — parrainé par ${referrer.client_name || "un ami"} 🤝`, source: "referral" },
    ]);
    for (const code of [referrer.code, referee.code]) {
      try { fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-google-pass?code=${encodeURIComponent(code)}`, { method: "POST" }).catch(() => {}); } catch (_) {}
    }

    // Notifier le parrain par WhatsApp (best effort)
    const key = Deno.env.get("WASENDER_API_KEY");
    if (key && referrer.whatsapp_opt_in && referrer.client_phone) {
      try {
        const digits = String(referrer.client_phone).replace(/[^0-9]/g, "");
        const msg = `🤝 Merci ${String(referrer.client_name || "").split(" ")[0] || ""} !\n\nTon ami(e) ${referee.client_name || ""} a rejoint *${merchant.name}* grâce à toi.\n\n🎁 *+${bonus} points* pour vous deux !\n\nTa carte : https://mysargal.com/c/?code=${referrer.code}`;
        const r = await fetch(Deno.env.get("WASENDER_URL") || "https://wasenderapi.com/api/send-message", { method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: digits, text: msg }) });
        await sb.from("whatsapp_logs").insert({ merchant_id, card_id: referrer.id, to_phone: referrer.client_phone, template: "referral", message: msg, status: r.ok ? "sent" : "failed", provider: "wasender" });
      } catch (_) { /* best effort */ }
    }

    return ok({ success: true, bonus, referrer_code: referrer.code, referee_code: referee.code });
  } catch (e) {
    return bad("Erreur: " + (e as Error).message, 500);
  }
});
