-- ============================================================
-- MySargal — Validité des cartes de fidélité
--
-- Le commerçant définit une durée de validité (en mois) dans ses réglages.
-- Elle est appliquée automatiquement à chaque NOUVELLE carte créée :
-- merchant-create-card pose loyalty_cards.expires_at = now() + N mois.
--
-- À l'échéance, une tâche quotidienne remet les points ACTIFS à 0.
-- La carte reste active et le cumul à vie (lifetime_pts) est conservé :
-- le client garde son historique et son niveau, il repart juste de zéro
-- pour la récompense en cours.
-- ============================================================

-- 1. Réglage boutique : 0 = pas d'expiration
alter table public.merchants
  add column if not exists card_validity_months integer not null default 0;

comment on column public.merchants.card_validity_months is
  'Validite des cartes en mois (0 = pas d expiration). Appliquee aux nouvelles cartes.';

-- 2. Échéance portée par la carte
alter table public.loyalty_cards
  add column if not exists expires_at timestamptz;

comment on column public.loyalty_cards.expires_at is
  'Echeance de la carte. A l echeance les points actifs sont remis a 0, la carte reste active.';

create index if not exists idx_cards_expires_at
  on public.loyalty_cards (expires_at) where expires_at is not null;

-- 3. Purge : remet à 0 les points des cartes échues, avec trace en transactions.
create or replace function public.ms_purge_cartes_expirees()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare n integer := 0;
begin
  with cibles as (
    select id, merchant_id, coalesce(pts,0) as pts
      from loyalty_cards
     where expires_at is not null
       and expires_at <= now()
       and coalesce(pts,0) > 0
  ),
  maj as (
    update loyalty_cards c set pts = 0
      from cibles t
     where c.id = t.id
    returning c.id
  ),
  trace as (
    insert into transactions (card_id, merchant_id, pts, type, note, source)
    select t.id, t.merchant_id, -t.pts, 'expire', 'Carte expiree : points remis a zero', 'auto'
      from cibles t
    returning 1
  )
  select count(*) into n from maj;
  return n;
end
$fn$;

-- 4. Planification quotidienne (03h10 UTC)
do $$ begin perform cron.unschedule('ms-purge-cartes-expirees'); exception when others then null; end $$;
select cron.schedule('ms-purge-cartes-expirees', '10 3 * * *', $$select public.ms_purge_cartes_expirees();$$);
