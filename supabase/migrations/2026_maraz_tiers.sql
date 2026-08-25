-- ============================================================
-- MySargal - Migration 2026 MARAZ SUMMIT CLUB (tiers + rewards + rolling 24 months)
-- Idempotente. Ne casse aucun marchand existant.
-- A executer dans Supabase SQL Editor. Voir bloc ROLLBACK en bas.
-- ============================================================

-- 1) TABLE sargal_tiers (paliers par marchand)
CREATE TABLE IF NOT EXISTS sargal_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_points int NOT NULL DEFAULT 0,
  max_points int,
  min_spend_year bigint DEFAULT 0,
  benefits_json jsonb DEFAULT '[]'::jsonb,
  color_hex text,
  priority int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (merchant_id, priority)
);
CREATE INDEX IF NOT EXISTS idx_sargal_tiers_merchant ON sargal_tiers(merchant_id, priority);

-- 2) TABLE sargal_rewards (catalogue recompenses)
CREATE TABLE IF NOT EXISTS sargal_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  family text NOT NULL CHECK (family IN (
    'cadeaux_exclusifs',
    'evenements_exclusifs',
    'experiences_uniques',
    'services_personnalises',
    'points_echangeables'
  )),
  name text NOT NULL,
  description text,
  points_cost int DEFAULT 0,
  tier_required_id uuid REFERENCES sargal_tiers(id) ON DELETE SET NULL,
  image_url text,
  active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sargal_rewards_merchant ON sargal_rewards(merchant_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_sargal_rewards_family ON sargal_rewards(merchant_id, family, active);

-- 3) TABLE sargal_points (grand livre glissant 24 mois)
CREATE TABLE IF NOT EXISTS sargal_points (
  id bigserial PRIMARY KEY,
  merchant_id uuid,
  card_id uuid REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  delta int NOT NULL,
  reason text,
  source text DEFAULT 'scan',
  earned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz GENERATED ALWAYS AS (earned_at + interval '24 months') STORED
);
CREATE INDEX IF NOT EXISTS idx_sargal_points_card_earned ON sargal_points(card_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_sargal_points_merchant_earned ON sargal_points(merchant_id, earned_at DESC);

-- 4) Colonnes additionnelles sur loyalty_cards
ALTER TABLE loyalty_cards ADD COLUMN IF NOT EXISTS member_number text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'loyalty_cards_member_number_key'
  ) THEN
    BEGIN
      ALTER TABLE loyalty_cards ADD CONSTRAINT loyalty_cards_member_number_key UNIQUE (member_number);
    EXCEPTION WHEN duplicate_table THEN
      NULL;
    END;
  END IF;
END $$;
ALTER TABLE loyalty_cards ADD COLUMN IF NOT EXISTS tier_id uuid REFERENCES sargal_tiers(id) ON DELETE SET NULL;
ALTER TABLE loyalty_cards ADD COLUMN IF NOT EXISTS active_points int DEFAULT 0;
ALTER TABLE loyalty_cards ADD COLUMN IF NOT EXISTS tier_last_evaluated_at timestamptz;

-- 5) FUNCTION compute_active_points (somme delta sur 24 derniers mois)
CREATE OR REPLACE FUNCTION compute_active_points(p_card_id uuid)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(delta), 0)::int
  FROM sargal_points
  WHERE card_id = p_card_id
    AND earned_at > (now() - interval '24 months')
$$;

-- 6) FUNCTION reevaluate_tier (recalcul + notif si changement)
CREATE OR REPLACE FUNCTION reevaluate_tier(p_card_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_merchant_id uuid;
  v_active_pts int;
  v_new_tier_id uuid;
  v_old_tier_id uuid;
BEGIN
  SELECT merchant_id, tier_id INTO v_merchant_id, v_old_tier_id
  FROM loyalty_cards WHERE id = p_card_id;

  IF v_merchant_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_active_pts := compute_active_points(p_card_id);

  SELECT id INTO v_new_tier_id
  FROM sargal_tiers
  WHERE merchant_id = v_merchant_id
    AND min_points <= v_active_pts
  ORDER BY priority DESC, min_points DESC
  LIMIT 1;

  UPDATE loyalty_cards
  SET tier_id = v_new_tier_id,
      active_points = v_active_pts,
      tier_last_evaluated_at = now()
  WHERE id = p_card_id;

  IF v_new_tier_id IS DISTINCT FROM v_old_tier_id THEN
    BEGIN
      PERFORM pg_notify(
        'tier_changed',
        json_build_object(
          'card_id', p_card_id,
          'old_tier_id', v_old_tier_id,
          'new_tier_id', v_new_tier_id,
          'active_points', v_active_pts
        )::text
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN v_new_tier_id;
END;
$$;

-- 7) RLS
ALTER TABLE sargal_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sargal_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE sargal_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sargal_tiers_read ON sargal_tiers;
CREATE POLICY sargal_tiers_read ON sargal_tiers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS sargal_tiers_service_write ON sargal_tiers;
CREATE POLICY sargal_tiers_service_write ON sargal_tiers FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sargal_rewards_read ON sargal_rewards;
CREATE POLICY sargal_rewards_read ON sargal_rewards FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS sargal_rewards_service_write ON sargal_rewards;
CREATE POLICY sargal_rewards_service_write ON sargal_rewards FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sargal_points_service_only ON sargal_points;
CREATE POLICY sargal_points_service_only ON sargal_points FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8) Grants (aligne avec le pattern anon-first du projet)
GRANT SELECT ON sargal_tiers TO anon, authenticated;
GRANT SELECT ON sargal_rewards TO anon, authenticated;
GRANT SELECT ON sargal_points TO service_role;
GRANT EXECUTE ON FUNCTION compute_active_points(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION reevaluate_tier(uuid) TO service_role;

-- ============================================================
-- ROLLBACK (a decommenter en cas de retour arriere)
-- ============================================================
-- DROP FUNCTION IF EXISTS reevaluate_tier(uuid);
-- DROP FUNCTION IF EXISTS compute_active_points(uuid);
-- DROP TABLE IF EXISTS sargal_points;
-- DROP TABLE IF EXISTS sargal_rewards;
-- DROP TABLE IF EXISTS sargal_tiers;
-- ALTER TABLE loyalty_cards DROP COLUMN IF EXISTS member_number;
-- ALTER TABLE loyalty_cards DROP COLUMN IF EXISTS tier_id;
-- ALTER TABLE loyalty_cards DROP COLUMN IF EXISTS active_points;
-- ALTER TABLE loyalty_cards DROP COLUMN IF EXISTS tier_last_evaluated_at;
