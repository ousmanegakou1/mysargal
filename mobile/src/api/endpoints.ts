// ============================================================
// MySargal Caisse - Endpoints metier
// Chaque fonction reproduit le contrat EXACT observe dans l'app web et les
// Edge Functions Supabase. Ne pas deviner : voir merchant/index.html.
// ============================================================

import { edge, edgePublic, restGet, restPost, restPatch, restDelete, rpc } from './client';
import { onlyDigits } from '../utils/format';
import {
  Merchant,
  VerifyOtpResponse,
  CardLookup,
  AddPointsResponse,
  RedeemRewardResponse,
  Reward,
  Transaction,
  GiftFindResponse,
  GiftRedeemResponse,
  GiftCard,
  GiftCardRow,
  GiftStats,
  LoyaltyCardRow,
  JournalRow,
  WaUsageRow,
  SendPushResponse,
  PushAudience,
  PushHistoryRow,
  Cashier,
  SargalTier,
  SargalReward,
  SummitMember,
  CreateGiftCardResponse,
  ReferralResponse,
} from './types';

// ---------- AUTH ----------

// send-whatsapp-otp  { phone } -> { success }
export async function sendOtp(phone: string): Promise<void> {
  await edgePublic('send-whatsapp-otp', { phone });
}

// verify-whatsapp-otp  { phone, code } -> { success, phone, token }
export async function verifyOtp(phone: string, code: string): Promise<VerifyOtpResponse> {
  return edgePublic<VerifyOtpResponse>('verify-whatsapp-otp', { phone, code });
}

// Resolution du merchant : le token porte le telephone. Le web interroge
// directement PostgREST : merchants?phone=eq.<phone>. Reproduit ici.
export async function resolveMerchantByPhone(fullPhone: string): Promise<Merchant | null> {
  const rows = await restGet<Merchant[]>(
    `/merchants?phone=eq.${encodeURIComponent(fullPhone)}&order=created_at.desc&limit=1`
  );
  return rows && rows.length ? rows[0] : null;
}

// Rafraichit le merchant par id (logo, plan, config a jour).
export async function fetchMerchantById(id: string): Promise<Merchant | null> {
  const rows = await restGet<Merchant[]>(`/merchants?id=eq.${id}&limit=1`);
  return rows && rows.length ? rows[0] : null;
}

// ---------- CLIENTS / POINTS ----------

// get-points?code=&merchant_id= -> fiche client
export async function getPoints(code: string, merchantId: string): Promise<CardLookup> {
  const c = encodeURIComponent(code);
  const m = encodeURIComponent(merchantId);
  return edge<CardLookup>(`get-points?code=${c}&merchant_id=${m}`, undefined, {
    method: 'GET',
    withApiKey: true,
  });
}

// Recherche brute d'une carte par code (PostgREST) pour le cache hors ligne.
export async function findCardByCode(code: string, merchantId: string): Promise<LoyaltyCardRow | null> {
  const fields =
    'id,code,merchant_id,client_name,pts,lifetime_pts,active,created_at,client_phone_mask';
  const rows = await restGet<LoyaltyCardRow[]>(
    `/loyalty_cards?select=${fields}&code=eq.${encodeURIComponent(code)}&merchant_id=eq.${merchantId}&limit=1`
  );
  return rows && rows.length ? rows[0] : null;
}

// Recherche par telephone (numero de membre ou telephone).
export async function findCardsByPhone(phone: string, merchantId: string): Promise<LoyaltyCardRow[]> {
  const d = onlyDigits(phone);
  const fields =
    'id,code,merchant_id,client_name,pts,lifetime_pts,active,created_at,client_phone_mask';
  // client_phone stocke avec ou sans +, on tente les deux formes.
  const rows = await restGet<LoyaltyCardRow[]>(
    `/loyalty_cards?select=${fields}&merchant_id=eq.${merchantId}` +
      `&or=(client_phone.eq.+${d},client_phone.eq.${d},member_number.eq.${encodeURIComponent(phone.trim())})` +
      `&limit=10`
  );
  return rows || [];
}

// add-points  { card_code, merchant_id, pts?, amount_fcfa?, note, source, cashier_id }
export interface AddPointsParams {
  card_code: string;
  merchant_id: string;
  pts?: number;
  amount_fcfa?: number;
  note?: string;
  source?: string;
  cashier_id?: string | null;
}
export async function addPoints(params: AddPointsParams): Promise<AddPointsResponse> {
  return edge<AddPointsResponse>('add-points', params);
}

// redeem-reward  { card_code, merchant_id, reward_id? }
export async function redeemReward(
  cardCode: string,
  merchantId: string,
  rewardId?: string | null
): Promise<RedeemRewardResponse> {
  return edge<RedeemRewardResponse>('redeem-reward', {
    card_code: cardCode,
    merchant_id: merchantId,
    reward_id: rewardId || null,
  });
}

// Liste des recompenses configurables.
export async function fetchRewards(merchantId: string): Promise<Reward[]> {
  const rows = await restGet<Reward[]>(`/rewards?merchant_id=eq.${merchantId}&order=pts_cost.asc`);
  return rows || [];
}

// Historique des operations d'une carte (fiche client).
export async function fetchCardTransactions(cardId: string, limit = 40): Promise<Transaction[]> {
  const rows = await restGet<Transaction[]>(
    `/transactions?card_id=eq.${cardId}&order=created_at.desc&limit=${limit}`
  );
  return rows || [];
}

// Transactions recentes (pour l'historique + resume du jour).
export async function fetchTransactions(merchantId: string, limit = 60): Promise<Transaction[]> {
  const rows = await restGet<Transaction[]>(
    `/transactions?merchant_id=eq.${merchantId}&order=created_at.desc&limit=${limit}`
  );
  return rows || [];
}

// ---------- CARTES CADEAUX ----------

// Lookup direct par code (merchant puis universelle).
export async function findGiftCardByCode(code: string, merchantId: string): Promise<GiftCard | null> {
  const c = encodeURIComponent(code);
  let rows = await restGet<GiftCard[]>(`/gift_cards?code=eq.${c}&merchant_id=eq.${merchantId}&limit=1`);
  if (!rows || !rows.length) {
    rows = await restGet<GiftCard[]>(`/gift_cards?code=eq.${c}&merchant_id=is.null&limit=1`);
  }
  return rows && rows.length ? rows[0] : null;
}

// giftcard-find  { merchant_id, phone } -> envoie OTP au client
export async function giftcardFind(merchantId: string, phone: string): Promise<GiftFindResponse> {
  return edge<GiftFindResponse>('giftcard-find', { merchant_id: merchantId, phone });
}

// giftcard-redeem-otp  { merchant_id, phone, code, amount, note }
export async function giftcardRedeemOtp(
  merchantId: string,
  phone: string,
  code: string,
  amount: number,
  note = 'Encaissement (numero)'
): Promise<GiftRedeemResponse> {
  return edge<GiftRedeemResponse>('giftcard-redeem-otp', {
    merchant_id: merchantId,
    phone,
    code,
    amount,
    note,
  });
}

// ---------- PUSH ----------

// register-device  { token, platform, merchant_id, phone, app }
export async function registerDevice(params: {
  token: string;
  platform: string;
  merchant_id?: string | null;
  phone?: string | null;
  app: string;
}): Promise<void> {
  await edge('register-device', params, { withApiKey: true });
}

// ---------- LOYALTY : LISTE / CREATION / ETAT ----------

const CARD_FIELDS =
  'id,code,merchant_id,client_name,pts,lifetime_pts,active,created_at,client_phone_mask';

// Liste complete des cartes de la boutique (onglet Clients).
export async function fetchCards(merchantId: string, limit = 1000): Promise<LoyaltyCardRow[]> {
  const rows = await restGet<LoyaltyCardRow[]>(
    `/loyalty_cards?select=${CARD_FIELDS}&merchant_id=eq.${merchantId}&order=created_at.desc&limit=${limit}`
  );
  return rows || [];
}

// generate_card_code : code serveur unique. Repli local si indisponible.
export async function generateCardCode(): Promise<string> {
  try {
    const v = await rpc<any>('generate_card_code', {});
    const s = typeof v === 'string' ? v : v && v.code ? v.code : '';
    const clean = String(s).replace(/['"]/g, '').trim();
    if (clean) return clean.toUpperCase();
  } catch {
    /* repli local */
  }
  return 'LC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export interface CreateCardParams {
  merchant_id: string;
  code: string;
  client_name: string;
  client_phone?: string | null;
  client_phone_raw?: string | null;
  client_email?: string | null;
  design_url?: string | null;
  design_name?: string | null;
}

// Creation d'une carte a la volee (loyalty_cards).
export async function createCard(params: CreateCardParams): Promise<LoyaltyCardRow> {
  const rows = await restPost<LoyaltyCardRow[]>('/loyalty_cards', {
    ...params,
    pts: 0,
    lifetime_pts: 0,
    tier: 'bronze',
  });
  return Array.isArray(rows) ? rows[0] : (rows as any);
}

// Insertion en lot (import VIP), par paquets.
export async function insertCardsBatch(rows: Record<string, unknown>[]): Promise<void> {
  await restPost('/loyalty_cards', rows);
}

// Desactiver une carte.
export async function deactivateCard(id: string): Promise<void> {
  await restPatch(`/loyalty_cards?id=eq.${id}`, { active: false }, { minimal: true });
}

// Reveler le telephone reel (audite cote serveur).
export async function revealPhone(
  cardId: string,
  motif: string,
  cashierId?: string | null
): Promise<string> {
  const v = await rpc<any>('reveler_telephone', {
    p_card: cardId,
    p_motif: motif,
    p_cashier: cashierId || null,
  });
  if (typeof v === 'string') return v.replace(/['"]/g, '');
  if (v && v.phone) return v.phone;
  if (v && v.telephone) return v.telephone;
  return String(v || '');
}

// Recherche client par telephone (RPC serveur, gere les numeros masques).
export async function clientByPhone(merchantId: string, tel: string): Promise<LoyaltyCardRow[]> {
  const rows = await rpc<LoyaltyCardRow[]>('client_par_telephone', {
    p_merchant: merchantId,
    p_tel: tel,
  });
  return rows || [];
}

// ---------- RECOMPENSES (CRUD) ----------

export interface RewardInput {
  name: string;
  description?: string;
  emoji?: string;
  pts_cost: number;
  type?: string;
  discount_type?: string;
  discount_value?: number;
  merchant_id: string;
}
export async function createReward(input: RewardInput): Promise<Reward> {
  const rows = await restPost<Reward[]>('/rewards', { ...input, active: true });
  return Array.isArray(rows) ? rows[0] : (rows as any);
}
export async function updateReward(id: string, patch: Partial<RewardInput> & { active?: boolean }): Promise<void> {
  await restPatch(`/rewards?id=eq.${id}`, patch, { minimal: true });
}
export async function deleteReward(id: string): Promise<void> {
  await restDelete(`/rewards?id=eq.${id}`);
}

// Historique des recompenses remises.
export async function fetchRewardHistory(merchantId: string): Promise<Transaction[]> {
  const rows = await restGet<Transaction[]>(
    `/transactions?merchant_id=eq.${merchantId}&type=eq.reward&order=created_at.desc&limit=200`
  );
  return rows || [];
}

// ---------- REGLAGES MARCHAND ----------

// PATCH generique des colonnes de la boutique.
export async function updateMerchant(id: string, patch: Record<string, unknown>): Promise<void> {
  await restPatch(`/merchants?id=eq.${id}`, patch, { minimal: true });
}

// ---------- BOUTIQUES / BRANCHES ----------

export async function fetchBranches(parentId: string): Promise<Merchant[]> {
  const rows = await restGet<Merchant[]>(
    `/merchants?or=(id.eq.${parentId},parent_id.eq.${parentId})&order=created_at.asc`
  );
  return rows || [];
}
export async function createBranch(input: Record<string, unknown>): Promise<Merchant> {
  const rows = await restPost<Merchant[]>('/merchants', input);
  return Array.isArray(rows) ? rows[0] : (rows as any);
}

// ---------- CAISSIERS / EQUIPE ----------

export async function fetchCashiers(merchantId: string): Promise<Cashier[]> {
  const rows = await restGet<Cashier[]>(
    `/cashiers?merchant_id=eq.${merchantId}&active=eq.true&select=id,name,pin&order=name`
  );
  return rows || [];
}
export async function addCashier(merchantId: string, name: string, pin: string): Promise<Cashier> {
  const rows = await restPost<Cashier[]>('/cashiers', {
    merchant_id: merchantId,
    name,
    pin,
    active: true,
  });
  return Array.isArray(rows) ? rows[0] : (rows as any);
}
export async function removeCashier(id: string): Promise<void> {
  await restPatch(`/cashiers?id=eq.${id}`, { active: false }, { minimal: true });
}

// ---------- INTEGRATIONS (cle API partenaire) ----------

export async function getOrCreatePartnerKey(): Promise<string> {
  const v = await rpc<any>('get_or_create_partner_key', {});
  return (v && (v.api_key || v.key)) || (typeof v === 'string' ? v.replace(/['"]/g, '') : '');
}
export async function regeneratePartnerKey(): Promise<string> {
  const v = await rpc<any>('regenerate_partner_key', {});
  return (v && (v.api_key || v.key)) || (typeof v === 'string' ? v.replace(/['"]/g, '') : '');
}

// Config facturation (landing_billing).
export async function getLandingSettings(): Promise<any[]> {
  try {
    const rows = await rpc<any[]>('get_landing_settings', {});
    return rows || [];
  } catch {
    return [];
  }
}

// ---------- TABLEAU DE BORD ----------

export async function fetchJournal(merchantId: string, jours = 30, limite = 200): Promise<JournalRow[]> {
  const rows = await rpc<JournalRow[]>('journal_activite', {
    p_merchant: merchantId,
    p_jours: jours,
    p_limite: limite,
  });
  return rows || [];
}
export async function fetchWaUsage(merchantId: string, months = 6): Promise<WaUsageRow[]> {
  const rows = await rpc<WaUsageRow[]>('wa_usage', { p_merchant: merchantId, p_months: months });
  return rows || [];
}

// ---------- CARTES CADEAUX (marchand) ----------

export async function fetchGiftCards(merchantId: string): Promise<GiftCardRow[]> {
  const rows = await restGet<GiftCardRow[]>(
    `/gift_cards?merchant_id=eq.${merchantId}&order=created_at.desc`
  );
  return rows || [];
}

export async function giftStats(merchantId: string): Promise<GiftStats> {
  try {
    const v = await rpc<GiftStats | GiftStats[]>('gift_card_merchant_stats', { p_merchant: merchantId });
    return Array.isArray(v) ? v[0] || {} : v || {};
  } catch {
    return {};
  }
}

// Creation directe d'une carte cadeau (via edge create-gift-card).
export interface CreateGiftInput {
  initial_amount: number;
  recipient_name: string;
  recipient_phone?: string | null;
  recipient_email?: string | null;
  message?: string | null;
  design?: string | null;
  merchant_id?: string | null;
  single_use?: boolean;
}
export async function createGiftCard(input: CreateGiftInput): Promise<CreateGiftCardResponse> {
  return edge<CreateGiftCardResponse>('create-gift-card', input, { withApiKey: true });
}

// Creation en lot (RPC gift_card_bulk_create).
export async function giftBulkCreate(
  merchantId: string,
  count: number,
  amount: number,
  design = 'violet'
): Promise<{ ok: boolean; created: number; codes: string[] }> {
  return rpc('gift_card_bulk_create', {
    p_merchant: merchantId,
    p_count: count,
    p_amount: amount,
    p_design: design,
  });
}

// Recharge d'une carte cadeau (RPC).
export async function reloadGiftCard(
  code: string,
  amount: number,
  merchantId: string,
  note = 'Recharge boutique'
): Promise<{ new_balance: number }> {
  return rpc('recharge_gift_card', {
    p_card_code: code,
    p_amount: amount,
    p_merchant_id: merchantId,
    p_note: note,
  });
}

// Encaissement direct par code (RPC redeem_gift_card).
export async function redeemGiftCardByCode(
  code: string,
  amount: number,
  note = 'Encaissement'
): Promise<{ ok: boolean; new_balance: number; status: string }> {
  return rpc('redeem_gift_card', { p_code: code, p_amount: amount, p_note: note });
}

// Annulation d'une carte cadeau.
export async function voidGiftCard(id: string): Promise<void> {
  await restPatch(`/gift_cards?id=eq.${id}`, { status: 'cancelled' }, { minimal: true });
}

// ---------- WALLET (sync apres scan / encaissement) ----------

export async function syncWallet(code: string): Promise<void> {
  const c = encodeURIComponent(code);
  // Fire and forget : on ne bloque jamais la caisse.
  edge(`sync-google-pass?code=${c}`, undefined, { method: 'POST', withApiKey: true }).catch(() => {});
  edge(`sync-apple-pass?code=${c}`, undefined, { method: 'POST', withApiKey: true }).catch(() => {});
}

// ---------- WHATSAPP (templates officiels) ----------

export async function waSend(params: {
  to: string;
  template: string;
  lang?: string;
  body_params?: string[];
  button_url_param?: string;
}): Promise<any> {
  return edge('wa-send', { lang: 'fr', ...params }, { withApiKey: true });
}

// ---------- PUSH / CAMPAGNES ----------

export async function pushCount(merchantId: string): Promise<number> {
  try {
    const v = await rpc<any>('push_subscriber_count', { p_merchant: merchantId });
    const n = typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]?.count ?? v[0]) : Number(v?.count ?? v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
export async function pushAudience(merchantId: string): Promise<PushAudience> {
  try {
    const v = await rpc<PushAudience | PushAudience[]>('push_audience_breakdown', { p_merchant: merchantId });
    return Array.isArray(v) ? v[0] || {} : v || {};
  } catch {
    return {};
  }
}
export async function pushHistory(merchantId: string): Promise<PushHistoryRow[]> {
  try {
    const rows = await rpc<PushHistoryRow[]>('push_history', { p_merchant: merchantId, p_limit: 20 });
    return rows || [];
  } catch {
    return [];
  }
}
// send-push : action:'compter' pour les comptes de segments.
export async function pushSegmentCounts(merchantId: string): Promise<SendPushResponse> {
  return edge<SendPushResponse>('send-push', { merchant_id: merchantId, action: 'compter' }, { withApiKey: true });
}
export async function sendPush(params: {
  merchant_id: string;
  title: string;
  body: string;
  url?: string;
  image?: string;
  segment?: string;
}): Promise<SendPushResponse> {
  return edge<SendPushResponse>('send-push', params, { withApiKey: true });
}
// Upload d'une image de campagne -> URL hebergee.
export async function pushImage(merchantId: string, imageBase64: string): Promise<string> {
  const r = await edge<{ success: boolean; url: string }>(
    'push-image',
    { merchant_id: merchantId, image_base64: imageBase64, type: 'image/jpeg' },
    { withApiKey: true }
  );
  return r.url;
}

// ---------- EMAIL DE LANCEMENT (Summit) ----------

export async function sendLaunchEmail(params: {
  merchant_slug: string;
  dry_run?: boolean;
  segment?: string;
  vip_list?: { phone?: string; first_name?: string; email?: string; lang?: string }[];
  lang_override?: string;
}): Promise<{ sent: number; failed: number; dry_run?: boolean; preview_html?: string; error?: string }> {
  return edge('send-launch-email', params, { withApiKey: true });
}

// ---------- EMAIL CARTE ----------

export async function sendCardEmail(params: {
  to: string;
  client_name?: string;
  merchant_name?: string;
  merchant_id?: string;
  card_url?: string;
  brand?: any;
  points?: number | null;
  kind?: string;
  lang?: string;
}): Promise<void> {
  await edge('send-card-email', params, { withApiKey: true });
}

// ---------- PARRAINAGE ----------

export async function applyReferral(
  merchantId: string,
  referrerCode: string,
  refereeCode: string
): Promise<ReferralResponse> {
  return edge<ReferralResponse>('apply-referral', {
    merchant_id: merchantId,
    referrer_code: referrerCode,
    referee_code: refereeCode,
  });
}

// ---------- SUMMIT CLUB ----------

export async function fetchTiers(merchantId: string): Promise<SargalTier[]> {
  const rows = await restGet<SargalTier[]>(
    `/sargal_tiers?merchant_id=eq.${merchantId}&order=priority.asc`
  );
  return rows || [];
}
export async function createTier(input: Record<string, unknown>): Promise<SargalTier> {
  const rows = await restPost<SargalTier[]>('/sargal_tiers', input);
  return Array.isArray(rows) ? rows[0] : (rows as any);
}
export async function updateTier(id: string | number, patch: Record<string, unknown>): Promise<void> {
  await restPatch(`/sargal_tiers?id=eq.${id}`, patch, { minimal: true });
}
export async function deleteTier(id: string | number): Promise<void> {
  await restDelete(`/sargal_tiers?id=eq.${id}`);
}

export async function fetchSargalRewards(merchantId: string): Promise<SargalReward[]> {
  const rows = await restGet<SargalReward[]>(
    `/sargal_rewards?merchant_id=eq.${merchantId}&order=sort_order.asc`
  );
  return rows || [];
}
export async function createSargalReward(input: Record<string, unknown>): Promise<SargalReward> {
  const rows = await restPost<SargalReward[]>('/sargal_rewards', input);
  return Array.isArray(rows) ? rows[0] : (rows as any);
}
export async function updateSargalReward(id: string | number, patch: Record<string, unknown>): Promise<void> {
  await restPatch(`/sargal_rewards?id=eq.${id}`, patch, { minimal: true });
}
export async function deleteSargalReward(id: string | number): Promise<void> {
  await restDelete(`/sargal_rewards?id=eq.${id}`);
}

const SUMMIT_FIELDS =
  'id,merchant_id,member_number,client_first,client_last,client_phone,client_email,client_birthday,whatsapp_opt_in,tier_id,active_points,lifetime_pts,tier_last_evaluated_at';

export async function fetchSummitMembers(merchantId: string): Promise<SummitMember[]> {
  const rows = await restGet<SummitMember[]>(
    `/loyalty_cards?merchant_id=eq.${merchantId}&select=${SUMMIT_FIELDS}&order=member_number.asc.nullslast`
  );
  return rows || [];
}
export async function updateMember(id: string, patch: Record<string, unknown>): Promise<void> {
  await restPatch(`/loyalty_cards?id=eq.${id}`, patch, { minimal: true });
}
export async function fetchMemberHistory(cardId: string): Promise<any[]> {
  const rows = await restGet<any[]>(
    `/sargal_points?card_id=eq.${cardId}&order=created_at.desc&limit=20`
  );
  return rows || [];
}
// Recherche carte membre par telephone (preparation cartes membres).
export async function findCardByPhoneExact(merchantId: string, phone: string): Promise<SummitMember | null> {
  const rows = await restGet<SummitMember[]>(
    `/loyalty_cards?merchant_id=eq.${merchantId}&client_phone=eq.${encodeURIComponent(phone)}&select=id,member_number,tier_id&limit=1`
  );
  return rows && rows.length ? rows[0] : null;
}
export async function fetchEmailCampaigns(merchantId: string): Promise<any[]> {
  try {
    const rows = await restGet<any[]>(
      `/sargal_email_campaigns?merchant_id=eq.${merchantId}&order=created_at.desc&limit=50`
    );
    return rows || [];
  } catch {
    return [];
  }
}
