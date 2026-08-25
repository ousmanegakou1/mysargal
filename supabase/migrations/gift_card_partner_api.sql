-- ============================================================
-- MySargal — API Cartes Cadeaux PARTENAIRE (POS / e-commerce)
-- Couche SQL : journal des transactions + RPC atomiques
--
-- Exposées ensuite par les edge functions api-giftcard-* (x-api-key).
-- Tout est SECURITY DEFINER + atomique. Les edge functions tournent
-- avec la SERVICE_ROLE_KEY ; on garde quand même les contrôles ici
-- (montant, statut, solde) pour que la logique soit côté base.
--
-- HYPOTHÈSES À CONFIRMER au déploiement (Supabase reconnecté) :
--   (1) Table gift_cards : colonnes code(text), merchant_id(text),
--       balance(int), initial_amount(int), status(text),
--       recipient_phone(text), expires_at(date|timestamptz, nullable).
--   (2) Fonction generate_card_code() renvoie un code unique préfixé "GC-".
--       Si ce n'est pas le cas, voir gift_card_partner_activate ci-dessous.
-- ============================================================

-- ---------- Journal des transactions partenaires ----------
create table if not exists public.gift_card_partner_txns (
  id                 uuid primary key default gen_random_uuid(),
  merchant_id        text        not null,
  card_code          text        not null,
  type               text        not null check (type in ('redeem','void','activate','reload')),
  amount             integer     not null,
  authorization_code text,
  reference          text,
  idempotency_key    text,
  response           jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists gcpt_merchant_code_idx on public.gift_card_partner_txns (merchant_id, card_code);
create index if not exists gcpt_auth_idx           on public.gift_card_partner_txns (merchant_id, authorization_code);
-- idempotence : une seule transaction "redeem" par (marchand, clé)
create unique index if not exists gcpt_idem_uidx
  on public.gift_card_partner_txns (merchant_id, idempotency_key)
  where idempotency_key is not null and type = 'redeem';

alter table public.gift_card_partner_txns enable row level security;
-- pas de policy publique : accès uniquement via service_role / SECURITY DEFINER

-- ============================================================
-- BALANCE — lecture du solde côté partenaire (vérifie l'appartenance)
-- ============================================================
create or replace function public.gift_card_partner_balance(p_merchant text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.gift_cards%rowtype;
begin
  select * into c from public.gift_cards where code = p_code and merchant_id = p_merchant;
  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;
  return jsonb_build_object(
    'success', true,
    'code', c.code,
    'status', c.status,
    'balance', c.balance,
    'initial_amount', c.initial_amount,
    'currency', 'XOF',
    'expires_at', c.expires_at
  );
end $$;

-- ============================================================
-- REDEEM — débit atomique + idempotent
-- ============================================================
create or replace function public.gift_card_partner_redeem(
  p_merchant text, p_code text, p_amount integer,
  p_reference text default null, p_idem text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.gift_cards%rowtype; v_auth text; v_prev jsonb; v_bal int;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

  -- Idempotence : si la clé a déjà été traitée, renvoyer le même résultat
  if p_idem is not null then
    select response into v_prev from public.gift_card_partner_txns
      where merchant_id = p_merchant and idempotency_key = p_idem and type = 'redeem'
      limit 1;
    if v_prev is not null then return v_prev; end if;
  end if;

  -- Débit atomique : ne passe que si active ET solde suffisant
  update public.gift_cards
     set balance = balance - p_amount
   where code = p_code and merchant_id = p_merchant
     and status = 'active' and balance >= p_amount
   returning * into c;

  if not found then
    select balance into v_bal from public.gift_cards where code = p_code and merchant_id = p_merchant;
    if v_bal is null then
      return jsonb_build_object('success', false, 'error', 'not_found');
    elsif v_bal < p_amount then
      return jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', v_bal, 'requested', p_amount);
    else
      return jsonb_build_object('success', false, 'error', 'card_inactive');
    end if;
  end if;

  v_auth := 'AUTH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.gift_card_partner_txns
    (merchant_id, card_code, type, amount, authorization_code, reference, idempotency_key, response)
  values
    (p_merchant, p_code, 'redeem', p_amount, v_auth, p_reference, p_idem,
     jsonb_build_object('success', true, 'authorization_code', v_auth,
       'amount_charged', p_amount, 'balance_remaining', c.balance, 'reference', p_reference))
  on conflict (merchant_id, idempotency_key) where (idempotency_key is not null and type = 'redeem')
  do nothing;

  return jsonb_build_object('success', true, 'authorization_code', v_auth,
    'amount_charged', p_amount, 'balance_remaining', c.balance, 'reference', p_reference);
end $$;

-- ============================================================
-- VOID — annulation / remboursement d'un redeem (recrédite la carte)
-- ============================================================
create or replace function public.gift_card_partner_void(p_merchant text, p_auth text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.gift_card_partner_txns%rowtype; c public.gift_cards%rowtype;
begin
  select * into t from public.gift_card_partner_txns
    where merchant_id = p_merchant and authorization_code = p_auth and type = 'redeem'
    limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'auth_not_found');
  end if;

  -- déjà annulé ?
  if exists (select 1 from public.gift_card_partner_txns
             where merchant_id = p_merchant and type = 'void' and reference = p_auth) then
    select balance into c.balance from public.gift_cards where code = t.card_code and merchant_id = p_merchant;
    return jsonb_build_object('success', true, 'amount_reversed', 0,
      'balance_remaining', c.balance, 'note', 'already_voided');
  end if;

  update public.gift_cards
     set balance = balance + t.amount
   where code = t.card_code and merchant_id = p_merchant
   returning * into c;
  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  insert into public.gift_card_partner_txns (merchant_id, card_code, type, amount, reference)
  values (p_merchant, t.card_code, 'void', t.amount, p_auth);

  return jsonb_build_object('success', true, 'amount_reversed', t.amount, 'balance_remaining', c.balance);
end $$;

-- ============================================================
-- RELOAD — rechargement atomique
-- ============================================================
create or replace function public.gift_card_partner_reload(
  p_merchant text, p_code text, p_amount integer, p_reference text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.gift_cards%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

  update public.gift_cards
     set balance = balance + p_amount
   where code = p_code and merchant_id = p_merchant and status = 'active'
   returning * into c;
  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found_or_inactive');
  end if;

  insert into public.gift_card_partner_txns (merchant_id, card_code, type, amount, reference)
  values (p_merchant, p_code, 'reload', p_amount, p_reference);

  return jsonb_build_object('success', true, 'amount_added', p_amount, 'balance_remaining', c.balance);
end $$;

-- ============================================================
-- ACTIVATE — émission d'une nouvelle carte par le partenaire
-- Code au format GC- (même générateur que create-gift-card), unique.
-- ============================================================
create or replace function public.gift_card_partner_activate(
  p_merchant text, p_amount integer, p_phone text default null, p_reference text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text; i int;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

  -- Génère un code GC- unique (5 tentatives max)
  for i in 1..5 loop
    v_code := 'GC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.gift_cards where code = v_code);
  end loop;

  insert into public.gift_cards
    (code, merchant_id, balance, initial_amount, status, recipient_phone, expires_at, is_universal, created_at)
  values
    (v_code, p_merchant, p_amount, p_amount, 'active', p_phone, now() + interval '365 days', false, now());

  insert into public.gift_card_partner_txns (merchant_id, card_code, type, amount, reference)
  values (p_merchant, v_code, 'activate', p_amount, p_reference);

  return jsonb_build_object('success', true, 'code', v_code, 'balance', p_amount,
    'card_url', 'https://mysargal.com/giftcard.html?code=' || v_code);
end $$;

-- ---------- Droits : appelées par les edge functions (service_role) ----------
grant execute on function public.gift_card_partner_balance(text, text)            to service_role;
grant execute on function public.gift_card_partner_redeem(text, text, integer, text, text) to service_role;
grant execute on function public.gift_card_partner_void(text, text)               to service_role;
grant execute on function public.gift_card_partner_reload(text, text, integer, text)       to service_role;
grant execute on function public.gift_card_partner_activate(text, integer, text, text)     to service_role;
