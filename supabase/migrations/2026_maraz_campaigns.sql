-- ============================================================
-- MySargal / MARAZ Summit Club — Historique des campagnes email
-- Idempotent : peut etre execute plusieurs fois sans erreur.
-- Depend de : public.merchants(id).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sargal_email_campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  subject           text,
  segment           text,
  lang              text,
  sent_count        int NOT NULL DEFAULT 0,
  failed_count      int NOT NULL DEFAULT 0,
  dry_run           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  payload_snapshot  jsonb
);

CREATE INDEX IF NOT EXISTS idx_sargal_email_campaigns_merchant
  ON public.sargal_email_campaigns(merchant_id, created_at DESC);

-- RLS -------------------------------------------------------
ALTER TABLE public.sargal_email_campaigns ENABLE ROW LEVEL SECURITY;

-- Lecture par la session marchande : merchant_id lie a la session
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='sargal_email_campaigns'
       AND policyname='sargal_email_campaigns_read_own'
  ) THEN
    CREATE POLICY sargal_email_campaigns_read_own
      ON public.sargal_email_campaigns
      FOR SELECT
      TO anon, authenticated
      USING (
        merchant_id IN (
          SELECT id FROM public.merchants
           WHERE user_id = auth.uid()
              OR id      = auth.uid()
        )
      );
  END IF;
END
$do$;

-- Ecriture reservee au service_role (edge function send-launch-email)
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='sargal_email_campaigns'
       AND policyname='sargal_email_campaigns_write_svc'
  ) THEN
    CREATE POLICY sargal_email_campaigns_write_svc
      ON public.sargal_email_campaigns
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$do$;

-- Grants
GRANT SELECT ON public.sargal_email_campaigns TO anon, authenticated;
GRANT ALL    ON public.sargal_email_campaigns TO service_role;

-- ============================================================
-- ROLLBACK
-- ------------------------------------------------------------
-- DROP POLICY IF EXISTS sargal_email_campaigns_read_own ON public.sargal_email_campaigns;
-- DROP POLICY IF EXISTS sargal_email_campaigns_write_svc ON public.sargal_email_campaigns;
-- DROP INDEX IF EXISTS public.idx_sargal_email_campaigns_merchant;
-- DROP TABLE IF EXISTS public.sargal_email_campaigns;
-- ============================================================
