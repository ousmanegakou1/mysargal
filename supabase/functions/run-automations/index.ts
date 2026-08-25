// ============================================================
// MySargal — run-automations : moteur d'automations WhatsApp
// 1. WIN-BACK  2. ANNIVERSAIRE  3. EXPIRATION carte cadeau (J-30)
// Envoi : template officiel d'abord (relance_client / anniversaire / expiration_carte_cadeau), repli WaSender.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const onlyDigits = (p: unknown) => String(p || "").replace(/\D/g, "");
const fmtFCFA = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";
const fmtDate = (iso: string) => { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; } catch { return iso; } };

const CARD_URL = "https://mysargal.com/c/?code=";
const MAX_PER_MERCHANT = 50;
const WA_TOKEN = Deno.env.get("WA_TOKEN");
const WA_PHONE_ID = Deno.env.get("WA_PHONE_ID");

async function sendTpl(digits: string, tpl: string, params: string[], code: string): Promise<boolean> {
  if (!WA_TOKEN || !WA_PHONE_ID || digits.length < 8) return false;
  const bodyComp = { type: "body", parameters: params.map((t) => ({ type: "text", text: String(t) })) };
  const btnComp = { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] };
  const post = async (withBtn: boolean) => {
    const components = withBtn ? [bodyComp, btnComp] : [bodyComp];
    const payload = { messaging_product: "whatsapp", to: digits, type: "template", template: { name: tpl, language: { code: "fr" }, components } };
    const r = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    return { okr: r.ok, d };
  };
  try {
    let { okr, d } = await post(true);
    if (!okr && (d as any)?.error?.code === 132018) { ({ okr } = await post(false)); }
    return okr;
  } catch (_) { return false; }
}

async function waSender(digits: string, text: string): Promise<boolean> {
  const key = Deno.env.get("WASENDER_API_KEY"); if (!key) return false;
  const url = Deno.env.get("WASENDER_URL") || "https://wasenderapi.com/api/send-message";
  try { const r = await fetch(url, { method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: digits, text }) }); return r.ok; } catch (_) { return false; }
}

async function sendWA(sb: any, phone: string, message: string, merchant_id: string, card_id: string, template: string, tpl?: string, params?: string[], code?: string): Promise<boolean> {
  const clean = String(phone).replace(/\s/g, "").replace(/^00/, "+");
  const waPhone = clean.startsWith("+") ? clean : "+221" + clean;
  const digits = waPhone.replace(/[^0-9]/g, "");
  let sent = false; let provider = "wasender";
  if (tpl) { const okk = await sendTpl(digits, tpl, params || [], code || ""); if (okk) { sent = true; provider = "official"; } }
  if (!sent) { sent = await waSender(digits, message); }
  await sb.from("whatsapp_logs").insert({ merchant_id, card_id, to_phone: waPhone, template, message, status: sent ? "sent" : "failed", provider });
  return sent;
}

function firstName(n: string | null): string { return String(n || "").trim().split(/\s+/)[0] || "toi"; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const stats = { winback_sent: 0, birthday_sent: 0, gc_expiry_sent: 0, errors: 0 };

    const { data: merchants } = await sb.from("merchants")
      .select("id,name,threshold,reward_desc,reward_config").eq("active", true);

    const todayMMDD = new Date().toISOString().slice(5, 10);
    const startOfDay = new Date().toISOString().slice(0, 10) + "T00:00:00Z";

    for (const m of merchants || []) {
      const cfg = (m.reward_config || {}) as Record<string, any>;
      let budget = MAX_PER_MERCHANT;

      const bdayBonus = Number(cfg.birthday || 0);
      const bdayGreet = cfg.birthday_greet !== false;
      if ((bdayBonus > 0 || cfg.birthday_greet === true)) {
        const { data: bdays } = await sb.from("loyalty_cards")
          .select("id,code,client_name,client_phone,pts,lifetime_pts,whatsapp_opt_in,client_birthday")
          .eq("merchant_id", m.id).eq("active", true).not("client_birthday", "is", null);
        for (const c of bdays || []) {
          if (budget <= 0) break;
          if (String(c.client_birthday).slice(5, 10) !== todayMMDD) continue;
          if (!c.whatsapp_opt_in || !c.client_phone) continue;
          const { data: dup } = await sb.from("whatsapp_logs").select("id").eq("card_id", c.id).eq("template", "birthday").gte("created_at", startOfDay).limit(1);
          if (dup && dup.length) continue;
          if (bdayBonus > 0) {
            const { data: already } = await sb.from("transactions").select("id").eq("card_id", c.id).eq("source", "birthday").gte("created_at", startOfDay).limit(1);
            if (!already || already.length === 0) {
              await sb.from("loyalty_cards").update({ pts: (c.pts || 0) + bdayBonus, lifetime_pts: (c.lifetime_pts || 0) + bdayBonus }).eq("id", c.id);
              await sb.from("transactions").insert({ card_id: c.id, merchant_id: m.id, pts: bdayBonus, type: "earn", note: "Bonus anniversaire 🎂", source: "birthday" });
              try { fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-google-pass?code=${encodeURIComponent(c.code)}`, { method: "POST" }).catch(() => {}); } catch (_) {}
            }
          }
          if (bdayGreet) {
            const bonusLine = bdayBonus > 0 ? `\n\n🎁 *${m.name}* t'offre *${bdayBonus} point${bdayBonus > 1 ? "s" : ""}* pour l'occasion !` : "";
            const msg = `Joyeux anniversaire ${firstName(c.client_name)} ! 🎂✨${bonusLine}\n\nTa carte fidélité : ${CARD_URL}${c.code}\n\nÀ très vite chez *${m.name}* !`;
            const sent = await sendWA(sb, c.client_phone, msg, m.id, c.id, "birthday", "anniversaire", [firstName(c.client_name), m.name], c.code);
            if (sent) stats.birthday_sent++; else stats.errors++;
            budget--; await sleep(400);
          }
        }
      }

      const wbDays = Number(cfg.winback_days || 0);
      if (cfg.winback_enabled === true && wbDays > 0) {
        const cutoff = new Date(Date.now() - wbDays * 86400000).toISOString();
        const recontact = new Date(Date.now() - Math.max(wbDays, 21) * 86400000).toISOString();
        const wbBonus = Number(cfg.winback_bonus || 0);
        const { data: inactive } = await sb.from("loyalty_cards")
          .select("id,code,client_name,client_phone,pts,lifetime_pts,whatsapp_opt_in,last_scan_at")
          .eq("merchant_id", m.id).eq("active", true)
          .lt("last_scan_at", cutoff).order("last_scan_at", { ascending: true }).limit(120);
        for (const c of inactive || []) {
          if (budget <= 0) break;
          if (!c.whatsapp_opt_in || !c.client_phone) continue;
          const { data: dup } = await sb.from("whatsapp_logs").select("id").eq("card_id", c.id).eq("template", "winback").gte("created_at", recontact).limit(1);
          if (dup && dup.length) continue;
          let bonusLine = "";
          if (wbBonus > 0) {
            await sb.from("loyalty_cards").update({ pts: (c.pts || 0) + wbBonus, lifetime_pts: (c.lifetime_pts || 0) + wbBonus }).eq("id", c.id);
            await sb.from("transactions").insert({ card_id: c.id, merchant_id: m.id, pts: wbBonus, type: "earn", note: "Cadeau de retour 🎁", source: "winback" });
            try { fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-google-pass?code=${encodeURIComponent(c.code)}`, { method: "POST" }).catch(() => {}); } catch (_) {}
            bonusLine = `\n\n🎁 On t'a offert *${wbBonus} point${wbBonus > 1 ? "s" : ""}* sur ta carte pour te revoir !`;
          }
          const msg = `Salut ${firstName(c.client_name)} ! 👋\n\nÇa fait un moment qu'on ne t'a pas vu chez *${m.name}*… tu nous manques !${bonusLine}\n\nTon solde t'attend ici : ${CARD_URL}${c.code}\n\nÀ bientôt 😊`;
          const sent = await sendWA(sb, c.client_phone, msg, m.id, c.id, "winback", "relance_client", [firstName(c.client_name), m.name], c.code);
          if (sent) stats.winback_sent++; else stats.errors++;
          budget--; await sleep(400);
        }
      }
    }

    // 3. EXPIRATION carte cadeau (J-30) — passe globale
    try {
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString();
      const nowIso = new Date().toISOString();
      const dedupSince = new Date(Date.now() - 40 * 86400000).toISOString();
      const { data: expiring } = await sb.from("gift_cards")
        .select("id,code,recipient_name,recipient_phone,balance,expires_at,merchant_id,status")
        .eq("status", "active").gt("balance", 0).not("recipient_phone", "is", null)
        .lte("expires_at", in30).gt("expires_at", nowIso).limit(200);
      for (const g of expiring || []) {
        const digits = onlyDigits(g.recipient_phone);
        if (digits.length < 8) continue;
        const { data: dup } = await sb.from("whatsapp_logs").select("id").eq("to_phone", "+" + digits).eq("template", "gc_expiry").gte("created_at", dedupSince).limit(1);
        if (dup && dup.length) continue;
        let brand = "MySargal";
        if (g.merchant_id) { const mm = (merchants || []).find((x: any) => String(x.id) === String(g.merchant_id)); if (mm) brand = mm.name || brand; }
        const exp = fmtDate(g.expires_at);
        let sent = await sendTpl(digits, "expiration_carte_cadeau", [firstName(g.recipient_name), brand, exp, fmtFCFA(g.balance)], g.code);
        if (!sent) { sent = await waSender(digits, `⏳ Ta carte cadeau ${brand} (solde ${fmtFCFA(g.balance)}) expire le ${exp}. Profites-en : https://mysargal.com/giftcard.html?code=${g.code}`); }
        await sb.from("whatsapp_logs").insert({ merchant_id: g.merchant_id || null, card_id: null, to_phone: "+" + digits, template: "gc_expiry", message: "expire " + exp, status: sent ? "sent" : "failed", provider: sent ? "auto" : "none" });
        if (sent) stats.gc_expiry_sent++; else stats.errors++;
        await sleep(400);
      }
    } catch (_) {}

    try {
      await sb.from("settings").upsert({ key: "last_automation_run", value: { at: new Date().toISOString(), ...stats } }, { onConflict: "key" });
    } catch (_) {}

    return ok({ success: true, ...stats });
  } catch (e) {
    return ok({ error: (e as Error).message }, 500);
  }
});
