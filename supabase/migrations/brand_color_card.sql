-- ════════════════════════════════════════════════════════════════
-- Couleur de marque sur la carte de fidélité client
-- ════════════════════════════════════════════════════════════════
-- À appliquer dans Supabase → SQL Editor (l'accès écriture via l'agent
-- était restreint lors de la création de ce fichier).
--
-- Effet : la page carte client (mysargal.com/c/) et l'app marchande
-- peuvent enregistrer/lire merchants.brand (couleurs du dégradé + accent),
-- et la page carte les applique automatiquement.
-- ════════════════════════════════════════════════════════════════

-- 1) S'assurer que la colonne brand existe (jsonb : {bg1, bg2, accent, text})
alter table public.merchants
  add column if not exists brand jsonb;

-- 2) RPC public additif : renvoie UNIQUEMENT la couleur de marque
--    associée à un code de carte de fidélité. SECURITY DEFINER pour
--    contourner la RLS (aucune autre donnée marchand n'est exposée).
create or replace function public.get_card_brand(p_code text)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(m.brand, '{}'::jsonb)
  from public.loyalty_cards lc
  join public.merchants m on m.id = lc.merchant_id
  where lc.code = p_code
  limit 1
$$;

grant execute on function public.get_card_brand(text) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────
-- (Optionnel) Si tu préfères tout faire passer par get_card_public au
-- lieu d'un second appel, ajoute "brand" à l'objet merchant qu'il
-- renvoie. La page carte sait déjà lire card.merchant.brand en priorité ;
-- get_card_brand n'est appelé qu'en repli. Les deux approches coexistent.
-- ────────────────────────────────────────────────────────────────
