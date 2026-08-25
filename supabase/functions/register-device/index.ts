// MySargal — register-device : enregistre un token de notification push (APNs/FCM).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { token, platform, merchant_id, phone, app } = await req.json().catch(() => ({}));
    if (!token) return json({ error: "token requis" }, 400);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await sb.from("device_tokens").upsert({
      token,
      platform: platform || null,
      merchant_id: merchant_id || null,
      phone: phone || null,
      app: app || "merchant",
      updated_at: new Date().toISOString(),
    }, { onConflict: "token" });
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
