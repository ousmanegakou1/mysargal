// MySargal — verify-whatsapp-otp : vérifie le code OTP (client_otps) et émet la session JWT.
//
// v3 — CORRECTIF CRITIQUE : force brute.
// La v1 n'imposait aucune limite de tentatives sur un code à six chiffres :
// un million de combinaisons donnaient une session de trente jours sur le
// numéro de son choix, dont celui d'un commerçant.
// La v2 comptait les tentatives côté application — inefficace : sept requêtes
// simultanées lisaient toutes le compteur à zéro avant qu'aucune ne l'écrive.
// La vérification se fait donc dans une fonction SQL verrouillée
// (public.otp_verifier), où les appels concurrents font la queue.
//
// v4 — Le compte de démonstration Apple ne figure plus dans le code source.
// Le numéro et l'empreinte du code vivent dans public.ms_config, table sans
// aucune politique RLS : même avec la clé publique, elle est inaccessible.
// Le code en clair n'existe nulle part, seulement son empreinte SHA-256.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_TENTATIVES = 5;
// Même message dans tous les cas d'échec : ne rien apprendre à l'attaquant sur
// l'existence du numéro ni sur la validité du code.
const ECHEC = "Code incorrect ou expiré.";

function digits(p: unknown) { return String(p || "").replace(/[^0-9]/g, ""); }
function b64url(data: Uint8Array | string) { const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data; let bin = ""; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
async function mintJwt(secret: string, claims: Record<string, unknown>, ttl: number) { const now = Math.floor(Date.now() / 1000); const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })); const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttl })); const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(header + "." + payload))); return header + "." + payload + "." + b64url(sig); }
async function sha256hex(s: string) { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join(""); }

// Comparaison à durée constante : ne pas laisser fuir le code par le temps de réponse.
function memeChaine(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { phone, code } = await req.json();
    if (!phone || !code) return json({ error: "Numéro et code requis" }, 400);

    const dg = digits(phone);
    const plus = "+" + dg;
    const secret = Deno.env.get("MS_JWT_SECRET");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Compte de démonstration ──────────────────────────────────────────
    // Secret d'environnement en priorité, sinon la table verrouillée.
    let demoPhone = Deno.env.get("MS_DEMO_PHONE") || "";
    let demoHash = "";
    const demoCodeEnv = Deno.env.get("MS_DEMO_CODE") || "";
    if (!demoPhone || !demoCodeEnv) {
      const { data: cfg } = await sb.from("ms_config").select("cle,valeur,valeur_hash").in("cle", ["demo_phone", "demo_code"]);
      for (const l of cfg || []) {
        if (l.cle === "demo_phone" && !demoPhone) demoPhone = String(l.valeur || "");
        if (l.cle === "demo_code") demoHash = String(l.valeur_hash || "");
      }
    }
    if (demoPhone && plus === demoPhone) {
      const attendu = demoCodeEnv ? await sha256hex(demoCodeEnv) : demoHash;
      const fourni = await sha256hex(String(code).trim());
      if (!attendu || !memeChaine(fourni, attendu)) return json({ error: ECHEC }, 400);
      const t = secret ? await mintJwt(secret, { role: "authenticated", iss: "mysargal", phone: plus }, 2592000) : null;
      return json({ success: true, phone: plus, token: t });
    }

    const hash = await sha256hex(dg + ":" + String(code).trim());

    // Tout se joue ici : incrément du compteur et comparaison du code dans une
    // seule transaction verrouillée. Les tentatives parallèles font la queue.
    const { data, error } = await sb.rpc("otp_verifier", { p_phone: dg, p_hash: hash, p_max: MAX_TENTATIVES });
    if (error) {
      console.error("otp_verifier:", error.message);
      return json({ error: ECHEC }, 400);
    }

    const etat = (data as any)?.etat;
    if (etat === "bloque") return json({ error: "Trop de tentatives. Demande un nouveau code." }, 429);
    if (etat !== "ok") {
      const restant = (data as any)?.restant;
      return json(restant != null ? { error: ECHEC, tentatives_restantes: restant } : { error: ECHEC }, 400);
    }

    const t = secret ? await mintJwt(secret, { role: "authenticated", iss: "mysargal", phone: plus }, 2592000) : null;
    return json({ success: true, phone: plus, token: t });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});
