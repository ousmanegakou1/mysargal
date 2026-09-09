// MySargal — send-whatsapp-otp : OTP de connexion via WhatsApp OFFICIEL (code_otp) + repli WaSender.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const DEMO_PHONE = "+10000000000";
function digits(p) { return String(p || "").replace(/[^0-9]/g, ""); }
async function sha256hex(s) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function sendOfficial(dg, code) { const T = Deno.env.get("WA_TOKEN"), P = Deno.env.get("WA_PHONE_ID"); if (!T || !P) return false; try { const payload = { messaging_product: "whatsapp", to: dg, type: "template", template: { name: "code_otp", language: { code: "fr" }, components: [ { type: "body", parameters: [{ type: "text", text: code }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] } ] } }; const r = await fetch("https://graph.facebook.com/v21.0/" + P + "/messages", { method: "POST", headers: { Authorization: "Bearer " + T, "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (r.ok) return true; console.error("otp officiel:", r.status, await r.text()); return false; } catch (e) { console.error("otp officiel exc:", e.message); return false; } }
async function sendWa(dg, code) { const w = Deno.env.get("WASENDER_API_KEY"); if (!w) return false; try { const r = await fetch("https://wasenderapi.com/api/send-message", { method: "POST", headers: { Authorization: "Bearer " + w, "Content-Type": "application/json" }, body: JSON.stringify({ to: dg, text: code + " est ton code MySargal. Il expire dans 5 minutes. Ne le partage avec personne." }) }); return r.ok; } catch (_) { return false; } }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { phone } = await req.json();
    if (!phone) throw new Error("Numéro requis");
    const dg = digits(phone); const plus = "+" + dg;
    if (plus === DEMO_PHONE) return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    // Comptes de démo (revue Apple / Google Play) : ne JAMAIS tenter d'envoi,
    // renvoyer succès pour que le réviseur atteigne l'écran de saisie du code
    // (le code fixe est validé par verify-whatsapp-otp). Évite le 502 bloquant.
    let demoP = "";
    try { const { data: dcfg } = await sb.from("ms_config").select("valeur").eq("cle", "demo_phone").maybeSingle(); demoP = String(dcfg?.valeur || ""); } catch (_) {}
    if (!demoP) demoP = Deno.env.get("MS_DEMO_PHONE") || "";
    const demoSet = demoP.split(",").map((s) => s.trim()).filter(Boolean);
    if (demoSet.includes(plus)) return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    const since = new Date(Date.now() - 3600000).toISOString();
    const { count } = await sb.from("client_otps").select("id", { count: "exact", head: true }).eq("phone", dg).gte("created_at", since);
    if ((count || 0) >= 3) return new Response(JSON.stringify({ error: "Trop de demandes. Réessaie dans une heure." }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256hex(dg + ":" + code);
    const expires_at = new Date(Date.now() + 5 * 60000).toISOString();
    await sb.from("client_otps").insert({ phone: dg, code_hash, expires_at });
    let ok = await sendOfficial(dg, code); let provider = ok ? "wa-cloud" : "";
    if (!ok) { ok = await sendWa(dg, code); if (ok) provider = "wasender"; }
    try { await sb.from("whatsapp_logs").insert({ to_phone: plus, template: "otp", message: "OTP de connexion", status: ok ? "sent" : "failed", provider: provider || "none" }); } catch (_) {}
    if (!ok) return new Response(JSON.stringify({ error: "Impossible d'envoyer le code" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) { return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }
});
