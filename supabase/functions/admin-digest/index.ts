// MySargal — admin-digest : résumé quotidien envoyé à l'admin par WhatsApp (via WaSender).
// Déclenché par pg_cron chaque matin. Numéro lu dans settings.admin_digest_phone.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const q = async (t: string, sel: string, filt: (b: any) => any) => { const { count } = await filt(sb.from(t).select(sel, { count: "exact", head: true })); return count || 0; };
    const signups = await q("merchants", "id", (b) => b.gte("created_at", since));
    const scans = await q("transactions", "id", (b) => b.eq("type", "earn").gte("created_at", since));
    const otp = await q("whatsapp_logs", "id", (b) => b.eq("template", "otp").gte("created_at", since));
    const waFail = await q("whatsapp_logs", "id", (b) => b.eq("status", "failed").gte("created_at", since));
    const pendDel = await q("account_deletion_requests", "id", (b) => b.eq("status", "pending"));

    const { data: gc } = await sb.from("gift_cards").select("initial_amount").neq("status", "cancelled").gte("created_at", since);
    const gcCount = (gc || []).length;
    const gcValue = (gc || []).reduce((s: number, x: any) => s + (Number(x.initial_amount) || 0), 0);

    let msg = `☀️ *MySargal — Résumé du jour*\n\n`;
    msg += `🏪 Nouveaux commerçants : *${signups}*\n`;
    msg += `📱 Scans (24h) : *${fmt(scans)}*\n`;
    msg += `🎁 Gift cards vendues : *${gcCount}* (${fmt(gcValue)} FCFA)\n`;
    msg += `💬 OTP envoyés : *${otp}*` + (waFail > 0 ? `\n⚠️ Échecs WhatsApp : *${waFail}*` : "") + `\n`;
    if (pendDel > 0) msg += `🗑️ Suppressions en attente : *${pendDel}*\n`;
    msg += `\n📊 Panel : https://mysargal.com/admin`;

    const { data: ph } = await sb.from("settings").select("value").eq("key", "admin_digest_phone").single();
    const phone = ph?.value ? String(ph.value).replace(/[^0-9]/g, "") : "";
    let sent = false;
    const key = Deno.env.get("WASENDER_API_KEY");
    if (key && phone) {
      try {
        const r = await fetch(Deno.env.get("WASENDER_URL") || "https://wasenderapi.com/api/send-message", { method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: phone, text: msg }) });
        sent = r.ok;
      } catch (_) { sent = false; }
    }
    return new Response(JSON.stringify({ success: true, sent, preview: msg }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
