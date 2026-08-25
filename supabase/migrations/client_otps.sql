-- ============================================================
-- MySargal — Table des codes OTP client (WhatsApp via WaSender)
-- À exécuter dans Supabase → SQL Editor
-- ============================================================
create table if not exists client_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_client_otps_phone on client_otps(phone, created_at desc);

-- Accès uniquement via service role (edge functions). RLS activée sans policy.
alter table client_otps enable row level security;
