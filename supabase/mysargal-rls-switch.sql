-- ============================================================
-- MySargal — BASCULE FINALE SÉCURITÉ (à exécuter APRÈS :
--   1. secrets MS_JWT_SECRET + ADMIN_PASSWORD posés
--   2. fichiers MySargal-Cloudflare déployés)
-- Supprime les policies grandes ouvertes + active la RLS.
-- Les tables sc_* ne sont PAS touchées. Testé en simulation le 2026-06-05.
-- ============================================================

-- 1) Supprimer les anciennes policies ouvertes / obsolètes
drop policy if exists "Public read merchants" on public.merchants;
drop policy if exists "merchants_all" on public.merchants;
drop policy if exists "merchant_own_data" on public.merchants;
drop policy if exists "Public read loyalty_cards" on public.loyalty_cards;
drop policy if exists "public_card_read_by_code" on public.loyalty_cards;
drop policy if exists "public_read_cards" on public.loyalty_cards;
drop policy if exists "merchant_own_cards" on public.loyalty_cards;
drop policy if exists "merchant_own_txs" on public.transactions;
drop policy if exists "Public read gift_cards" on public.gift_cards;
drop policy if exists "gc_insert" on public.gift_cards;
drop policy if exists "gc_select" on public.gift_cards;
drop policy if exists "gc_update" on public.gift_cards;
drop policy if exists "Public read gift_card_transactions" on public.gift_card_transactions;
drop policy if exists "gct_insert" on public.gift_card_transactions;
drop policy if exists "gct_select" on public.gift_card_transactions;
drop policy if exists "public_rewards_read" on public.rewards;
drop policy if exists "merchant_own_rewards" on public.rewards;
drop policy if exists "Anon write settings" on public.settings;
drop policy if exists "Public read settings" on public.settings;
drop policy if exists "Service write settings" on public.settings;
drop policy if exists "Anon write designs" on public.designs;

-- 2) Activer la RLS (les nouvelles policies ms_* prennent le relais)
alter table public.merchants enable row level security;
alter table public.loyalty_cards enable row level security;
alter table public.transactions enable row level security;
alter table public.rewards enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_transactions enable row level security;
-- (api_partners : déjà fait. cashiers/scan_log/settings/designs : RLS déjà active.)
