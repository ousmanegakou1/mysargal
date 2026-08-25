// MySargal — create-gift-card : création carte cadeau (validée serveur)
// Envoi au bénéficiaire : WhatsApp en priorité, email en secours (optionnel,
// selon merchants.email_enabled). Marketplace : reversement si applicable.
//
// v2 — SÉCURITÉ FINANCIÈRE. La version précédente créait une carte au statut
// « active », donc immédiatement débitable en caisse, sans aucune authentification
// ni preuve de paiement, pour un montant allant jusqu'à 2 000 000 FCFA.
// N'importe qui disposant de la clé publique — présente dans le code de chaque
// page — pouvait donc fabriquer de l'argent à la charge du commerçant.
//
// Désormais :
//   • appel AUTHENTIFIÉ (clé partenaire ou session marchande) → carte active,
//     plafond inchangé. C'est le chemin du panneau marchand et des caisses.
//   • appel ANONYME (page d'achat publique) → carte créée « en attente »,
//     non débitable, et plafonnée. Elle doit être activée par le commerçant
//     une fois le paiement constaté.
// Le paiement Wave étant déclaré sur l'honneur côté navigateur, c'est la seule
// façon de ne pas créer de dette non payée.
//
// v3 — OUVERTURE INTERNATIONALE. Les montants suivent la monnaie de la boutique.
// Un plafond exprimé en FCFA n'a aucun sens pour une boutique de Nairobi : les
// bornes et le formatage sont donc déclinés par devise.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key" };
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const bad = (m: string, s = 400) => ok({ error: m }, s);
const digits = (p: unknown) => String(p || "").replace(/\D/g, "");
const isEmail = (e: unknown) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());

// Devise de la boutique : symbole et décimales suivent le pays.
const DEVISES: Record<string, { s: string; d: number; avant?: boolean }> = {
  XOF: { s: "FCFA", d: 0 }, XAF: { s: "FCFA", d: 0 },
  NGN: { s: "₦", d: 2, avant: true }, KES: { s: "KSh", d: 2, avant: true },
  TZS: { s: "TSh", d: 0, avant: true }, RWF: { s: "FRw", d: 0, avant: true },
  UGX: { s: "USh", d: 0, avant: true }, GHS: { s: "GH₵", d: 2, avant: true },
  ZAR: { s: "R", d: 2, avant: true }, MAD: { s: "DH", d: 2 },
  DZD: { s: "DA", d: 2 }, TND: { s: "DT", d: 3 }, EUR: { s: "€", d: 2 },
  USD: { s: "$", d: 2, avant: true }, GBP: { s: "£", d: 2, avant: true },
  CAD: { s: "$", d: 2, avant: true }, BRL: { s: "R$", d: 2, avant: true },
};
function fmtAmount(n: number, cur = "XOF"): string {
  const d = DEVISES[cur] || DEVISES.XOF;
  const v = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d.d, maximumFractionDigits: d.d }).format(n);
  return d.avant ? `${d.s} ${v}` : `${v} ${d.s}`;
}
function fmtDate(iso: string) { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; } catch { return iso; } }

const enc = new TextEncoder();
const JWT_SECRET = Deno.env.get("MS_JWT_SECRET") || "";

// Bornes exprimées dans la monnaie de la boutique. L'anonyme vaut environ
// 300 USD, l'authentifié environ 3 000 USD, arrondis à des montants ronds.
const PLAFONDS_ANONYMES: Record<string, number> = {
  XOF: 200_000, XAF: 200_000, NGN: 450_000, KES: 40_000, TZS: 800_000,
  RWF: 400_000, UGX: 1_100_000, GHS: 4_000, ZAR: 5_500, MAD: 3_000,
  DZD: 40_000, TND: 900, EUR: 300, USD: 300, GBP: 250, CAD: 400, BRL: 1_600,
};
const PLAFONDS_AUTH: Record<string, number> = {
  XOF: 2_000_000, XAF: 2_000_000, NGN: 4_500_000, KES: 400_000, TZS: 8_000_000,
  RWF: 4_000_000, UGX: 11_000_000, GHS: 40_000, ZAR: 55_000, MAD: 30_000,
  DZD: 400_000, TND: 9_000, EUR: 3_000, USD: 3_000, GBP: 2_500, CAD: 4_000, BRL: 16_000,
};
const MINIMUMS: Record<string, number> = {
  XOF: 100, XAF: 100, NGN: 200, KES: 20, TZS: 500, RWF: 200, UGX: 500,
  GHS: 2, ZAR: 3, MAD: 2, DZD: 20, TND: 1, EUR: 1, USD: 1, GBP: 1, CAD: 1, BRL: 1,
};

function b64urlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
async function verifySessionJwt(token: string): Promise<Record<string, any> | null> {
  if (!JWT_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const key = await crypto.subtle.importKey("raw", enc.encode(JWT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const okSig = await crypto.subtle.verify("HMAC", key, b64urlDecode(parts[2]), enc.encode(parts[0] + "." + parts[1]));
    if (!okSig) return null;
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (claims.exp && Number(claims.exp) < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch { return null; }
}

async function sendGiftCard(phone: string, name: string, brand: string, amount: number, code: string, expires: string, cur = "XOF", lang = "fr"): Promise<boolean> {
  if (phone.length < 8) return false;
  const TOKEN = Deno.env.get("WA_TOKEN"); const PHONE_ID = Deno.env.get("WA_PHONE_ID");
  if (TOKEN && PHONE_ID) {
    const bodyComp = { type: "body", parameters: [ { type: "text", text: name }, { type: "text", text: brand }, { type: "text", text: fmtAmount(amount, cur) }, { type: "text", text: code }, { type: "text", text: fmtDate(expires) } ] };
    const btnComp = { type: "button", sub_type: "url", index: "0", parameters: [ { type: "text", text: code } ] };
    const send = async (withBtn: boolean, langue: string) => {
      const components = withBtn ? [bodyComp, btnComp] : [bodyComp];
      const payload = { messaging_product: "whatsapp", to: phone, type: "template", template: { name: "carte_cadeau", language: { code: langue }, components } };
      const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      return { r, d };
    };
    try {
      let { r, d } = await send(true, lang);
      // Le bouton URL statique n'accepte pas de paramètre.
      if (!r.ok && (d as any)?.error?.code === 132018) { ({ r, d } = await send(false, lang)); }
      // Modèle non encore approuvé dans cette langue → repli sur le français.
      if (!r.ok && lang !== "fr" && (d as any)?.error?.code === 132001) { ({ r, d } = await send(true, "fr")); }
      if (r.ok) return true;
      console.error("carte_cadeau officiel échec:", r.status, JSON.stringify(d));
    } catch (e) { console.error("carte_cadeau exception:", (e as Error).message); }
  }
  const wa = Deno.env.get("WASENDER_API_KEY");
  if (wa) {
    try {
      await fetch("https://wasenderapi.com/api/send-message", { method: "POST", headers: { Authorization: `Bearer ${wa}`, "Content-Type": "application/json" }, body: JSON.stringify({ to: phone, text: `🎁 Votre carte cadeau *${brand}* de ${fmtAmount(amount, cur)}\n\nOuvrez-la ici : https://mysargal.com/giftcard.html?code=${code}\nValable jusqu'au ${fmtDate(expires)}.` }) });
      return true;
    } catch (_) {}
  }
  return false;
}

async function sendGiftByEmail(to: string, name: string, merchantName: string, merchantId: string | null, amount: number, code: string, brand: unknown): Promise<boolean> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-card-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to, client_name: name, merchant_name: merchantName,
        merchant_id: merchantId || undefined,
        card_url: `https://mysargal.com/giftcard.html?code=${code}`,
        brand, points: amount, kind: "gift",
      }),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok && d?.success === true;
  } catch (_) { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json();

    // ── Qui appelle ? ────────────────────────────────────────────────
    // Une carte n'est immédiatement débitable que si l'appelant est prouvé.
    let authentifie = false;
    let boutiqueAuth: string | null = null;

    const cle = req.headers.get("x-api-key") || (typeof b.api_key === "string" ? b.api_key : "");
    if (cle) {
      const { data: p } = await sb.from("api_partners").select("merchant_id,active").eq("api_key", String(cle).trim()).maybeSingle();
      if (p && p.active !== false && p.merchant_id) { authentifie = true; boutiqueAuth = String(p.merchant_id); }
    }
    if (!authentifie) {
      const auth = req.headers.get("Authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      const claims = token ? await verifySessionJwt(token) : null;
      const tel = digits(claims?.phone);
      if (tel) {
        const { data: mine } = await sb.from("merchants").select("id,phone");
        const trouve = (mine || []).find((m: any) => digits(m.phone) === tel);
        if (trouve) { authentifie = true; boutiqueAuth = String(trouve.id); }
      }
    }

    const amount = Number(b.initial_amount);
    if (!Number.isFinite(amount) || amount < 1) return bad("Montant invalide");

    const recipientName = String(b.recipient_name || "").slice(0, 80).trim();
    if (!recipientName) return bad("Nom du destinataire requis");
    const recipientPhone = b.recipient_phone ? String(b.recipient_phone).replace(/[^+0-9]/g, "").slice(0, 20) : null;
    const recipientEmail = isEmail(b.recipient_email) ? String(b.recipient_email).trim().toLowerCase().slice(0, 120) : null;
    const message = b.message ? String(b.message).slice(0, 300) : null;
    const design = b.design ? String(b.design).slice(0, 60) : null;

    let merchantId: string | null = null; let brand = "MySargal";
    let mpActive = false; let mpPct = 0; let emailEnabled = true; let brandColors: unknown = null;
    let devise = "XOF";
    if (b.merchant_id) {
      // Une clé authentifiée ne peut émettre que pour SA boutique.
      if (authentifie && boutiqueAuth && String(b.merchant_id) !== boutiqueAuth) return bad("Boutique non autorisée", 403);
      const { data: m } = await sb.from("merchants").select("id, name, active, brand, email_enabled, marketplace_active, marketplace_commission_pct, currency").eq("id", b.merchant_id).single();
      if (!m) return bad("Commerçant introuvable", 404);
      if (m.active === false) return bad("Commerçant inactif");
      merchantId = String(m.id); brand = m.name || brand;
      devise = (m as any).currency && DEVISES[(m as any).currency] ? String((m as any).currency) : "XOF";
      brandColors = m.brand ?? null;
      emailEnabled = m.email_enabled !== false;
      mpActive = m.marketplace_active === true;
      mpPct = Math.max(0, Math.min(Number(m.marketplace_commission_pct) || 0, 90));
    }

    // Le plafond dépend de la monnaie : 200 000 FCFA et 300 EUR ne sont pas comparables.
    const plafond = authentifie
      ? (PLAFONDS_AUTH[devise] ?? PLAFONDS_AUTH.XOF)
      : (PLAFONDS_ANONYMES[devise] ?? PLAFONDS_ANONYMES.XOF);
    const minimum = MINIMUMS[devise] ?? MINIMUMS.XOF;
    if (amount < minimum || amount > plafond) {
      return bad(`Montant invalide (${fmtAmount(minimum, devise)} à ${fmtAmount(plafond, devise)})`);
    }

    let code = "";
    for (let i = 0; i < 5; i++) { code = "GC-" + crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase(); const { data: dup } = await sb.from("gift_cards").select("id").eq("code", code).limit(1); if (!dup || dup.length === 0) break; }
    const expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    // Le point clé : sans authentification, la carte n'est pas débitable.
    const statut = authentifie ? "active" : "pending";

    const row = { merchant_id: merchantId, code, design, initial_amount: amount, balance: amount, recipient_name: recipientName, recipient_phone: recipientPhone, recipient_email: recipientEmail, message, single_use: !!b.single_use, expires_at, status: statut, created_at: new Date().toISOString(), is_universal: !merchantId };
    const { data: saved, error } = await sb.from("gift_cards").insert(row).select().single();
    if (error) return bad("Erreur création: " + error.message, 500);

    // Marketplace : le reversement n'est dû que sur une carte réellement active.
    let settlement: Record<string, unknown> | null = null;
    if (b.marketplace === true && merchantId && mpActive && statut === "active") {
      const commission = Math.round(amount * mpPct / 100);
      const net = amount - commission;
      const { data: st } = await sb.from("giftcard_settlements").insert({ gift_card_id: (saved as any).id, merchant_id: merchantId, code, face_amount: amount, commission_pct: mpPct, commission_amount: commission, net_payable: net, payout_status: "due" }).select().single();
      settlement = st || { face_amount: amount, commission_pct: mpPct, commission_amount: commission, net_payable: net };
    }

    // Envoi au bénéficiaire : uniquement quand la carte est utilisable.
    // Envoyer une carte en attente reviendrait à promettre un solde inexistant.
    let sentBy: string | null = null;
    if (statut === "active") {
      if (recipientPhone) {
        const okWa = await sendGiftCard(digits(recipientPhone), recipientName, brand, amount, code, expires_at, devise);
        if (okWa) sentBy = "whatsapp";
      }
      if (!sentBy && recipientEmail && emailEnabled) {
        const okMail = await sendGiftByEmail(recipientEmail, recipientName, brand, merchantId, amount, code, brandColors);
        if (okMail) sentBy = "email";
      }
    }

    return ok({
      success: true,
      card: saved,
      settlement,
      sent_by: sentBy,
      statut,
      currency: devise,
      message_client: statut === "pending"
        ? "Carte créée. Elle sera activée et envoyée dès que le paiement sera confirmé par la boutique."
        : null,
    });
  } catch (e) { return bad("Erreur: " + (e as Error).message, 500); }
});
