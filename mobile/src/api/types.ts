// ============================================================
// MySargal Caisse - Types des contrats API (source: Edge Functions + web)
// ============================================================

export interface Merchant {
  id: string;
  name: string;
  phone: string;
  threshold: number;
  reward_desc?: string | null;
  emoji?: string | null;
  brand?: string | null;
  logo_url?: string | null;
  plan?: string | null;
  plan_expires?: string | null;
  parent_id?: string | null;
  currency?: string | null;
  country_code?: string | null;
  language?: string | null;
  website?: string | null;
  whatsapp?: string | null;
  // Mode de points : montant -> points converti cote client.
  pts_amount_mode?: boolean | null;
  pts_fcfa_per_point?: number | null;
  reward_config?: Record<string, unknown> | null;
  user_id?: string | null;
  created_at?: string | null;
}

// Reponse verify-whatsapp-otp
export interface VerifyOtpResponse {
  success: boolean;
  phone: string;
  token: string;
  tentatives_restantes?: number;
}

// Reponse refresh-session
export interface RefreshSessionResponse {
  success: boolean;
  token: string;
  expires_in: number;
}

// Reponse get-points
export interface CardLookup {
  code: string;
  client_name: string | null;
  client_phone: string | null;
  pts: number;
  lifetime_pts: number;
  tier: string | null;
  progress_pct: number;
  reward_ready: boolean;
  remaining_pts: number;
  last_scan_at: string | null;
  merchant: {
    name?: string;
    emoji?: string | null;
    threshold?: number;
    reward_desc?: string | null;
    brand?: string | null;
  };
}

// Reponse add-points
export interface AddPointsResponse {
  success: boolean;
  card_code: string;
  pts_added: number;
  boost_x: number | null;
  birthday_bonus: number;
  pts_total: number;
  lifetime_pts: number;
  tier: string;
  reward_ready: boolean;
  just_unlocked: boolean;
  reward_desc?: string | null;
  tier_unlocked?: { name?: string; at?: number } | null;
  sargal_tier_changed?: { id?: string; name?: string } | null;
}

// Reponse redeem-reward
export interface RedeemRewardResponse {
  success: boolean;
  pts_used: number;
  pts_remaining: number;
  reward?: string | null;
}

// Recompense configurable (table rewards)
export interface Reward {
  id: string;
  merchant_id: string;
  name: string;
  pts_cost: number;
  active?: boolean;
  redemptions?: number;
  emoji?: string | null;
}

// Transaction (table transactions)
export interface Transaction {
  id?: string;
  card_id?: string | null;
  merchant_id: string;
  pts: number;
  type: 'earn' | 'reward' | string;
  note?: string | null;
  source?: string | null;
  created_at?: string | null;
}

// Reponse giftcard-find
export interface GiftFindResponse {
  found: boolean;
  otp_sent?: boolean;
  count?: number;
  total_balance?: number;
  name?: string | null;
  cards?: { masked: string; balance: number }[];
}

// Reponse giftcard-redeem-otp
export interface GiftRedeemResponse {
  ok: boolean;
  code: string;
  new_balance: number;
  status: string;
}

// Carte cadeau (table gift_cards) via lookup par code
export interface GiftCard {
  id: string;
  code: string;
  balance: number;
  status: string;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  merchant_id?: string | null;
  expires_at?: string | null;
}

// Carte de fidelite brute (table loyalty_cards) via recherche
export interface LoyaltyCardRow {
  id: string;
  code: string;
  merchant_id: string;
  client_name: string | null;
  pts: number;
  lifetime_pts: number;
  active?: boolean;
  created_at?: string | null;
  client_phone_mask?: string | null;
}

// Carte cadeau complete (table gift_cards) pour la liste marchande.
export interface GiftCardRow {
  id: string;
  code: string;
  merchant_id?: string | null;
  design?: string | null;
  design_url?: string | null;
  hide_overlay?: boolean | null;
  initial_amount: number;
  balance: number;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  message?: string | null;
  single_use?: boolean | null;
  status: string; // active | used | cancelled
  expires_at?: string | null;
  created_at?: string | null;
}

// Statistiques cartes cadeaux (RPC gift_card_merchant_stats)
export interface GiftStats {
  issued_value?: number;
  spent_value?: number;
  outstanding?: number;
  expiring_30d?: number;
}

// Ligne du journal d'activite (RPC journal_activite)
export interface JournalRow {
  qui?: string | null;
  categorie?: string | null; // points | récompense | numéro
  detail?: string | null;
  quand?: string | null;
}

// Ligne d'usage WhatsApp (RPC wa_usage)
export interface WaUsageRow {
  mois?: string | null;
  statut?: string | null;
  categorie?: string | null;
  n?: number;
}

// Reponse send-push (envoi ou comptage)
export interface SendPushResponse {
  success: boolean;
  sent?: number;
  failed?: number;
  total?: number;
  natifs?: number;
  web?: number;
  comptes?: Record<string, number>;
  note?: string;
  error?: string;
}

// Repartition de l'audience push (RPC push_audience_breakdown)
export interface PushAudience {
  total?: number;
  apple?: number;
  android?: number;
  autre?: number;
}

// Historique campagne push (RPC push_history)
export interface PushHistoryRow {
  title?: string | null;
  body?: string | null;
  created_at?: string | null;
  sent_count?: number;
  failed_count?: number;
}

// Caissier / equipe (table cashiers)
export interface Cashier {
  id: string;
  merchant_id?: string;
  name: string;
  pin?: string | null;
  active?: boolean;
}

// Niveau Summit Club (table sargal_tiers)
export interface SargalTier {
  id: string | number;
  merchant_id?: string;
  name: string;
  min_points: number;
  max_points?: number | null;
  min_spend_year?: number;
  earn_multiplier?: number;
  color_hex?: string | null;
  priority?: number;
  benefits_json?: string[] | null;
}

// Recompense Summit Club (table sargal_rewards)
export interface SargalReward {
  id: string | number;
  merchant_id?: string;
  family: string;
  name: string;
  description?: string | null;
  points_cost: number;
  tier_required_id?: string | number | null;
  image_url?: string | null;
  active?: boolean;
  sort_order?: number;
}

// Membre Summit Club (loyalty_cards, colonnes etendues)
export interface SummitMember {
  id: string;
  merchant_id?: string;
  member_number?: string | null;
  client_first?: string | null;
  client_last?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  client_birthday?: string | null;
  whatsapp_opt_in?: boolean | null;
  tier_id?: string | number | null;
  active_points?: number;
  lifetime_pts?: number;
  tier_last_evaluated_at?: string | null;
}

// Reponse create-gift-card
export interface CreateGiftCardResponse {
  success: boolean;
  card: GiftCardRow;
  statut?: string;
  currency?: string;
  sent_by?: string | null;
  message_client?: string | null;
}

// Reponse apply-referral
export interface ReferralResponse {
  success: boolean;
  bonus: number;
}

// Erreur API normalisee
export class ApiError extends Error {
  status: number;
  tentatives_restantes?: number;
  constructor(message: string, status: number, tentatives_restantes?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.tentatives_restantes = tentatives_restantes;
  }
}
