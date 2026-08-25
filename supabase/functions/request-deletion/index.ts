// MySargal — request-deletion : demande publique de suppression de compte (page delete-account.html)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { phone, reason } = await req.json();
    const p = String(phone || "").replace(/[^+0-9]/g, "");
    if (!/^\+?[0-9]{8,15}$/.test(p)) return ok({ error: "Numéro de téléphone invalide" }, 400);
    const r = String(reason || "").slice(0, 500);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // anti-doublon : une seule demande en attente par numéro
    const { data: dup } = await sb.from("account_deletion_requests")
      .select("id").eq("phone", p).eq("status", "pending").limit(1);
    if (dup && dup.length) return ok({ success: true, message: "Une demande est déjà en cours pour ce numéro." });

    const { error } = await sb.from("account_deletion_requests")
      .insert({ phone: p, reason: r || null, status: "pending" });
    if (error) return ok({ error: "Erreur: " + error.message }, 500);

    return ok({ success: true, message: "Demande enregistrée. Suppression sous 30 jours." });
  } catch (e) {
    return ok({ error: (e as Error).message }, 400);
  }
});
