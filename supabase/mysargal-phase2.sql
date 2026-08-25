-- ============================================================
-- MySargal — Migration Phase 2
-- À exécuter dans Supabase → SQL Editor.
-- Tout est idempotent (IF NOT EXISTS) : sans danger à relancer.
-- ============================================================

-- 1) RÉCOMPENSES AVANCÉES (bonus bienvenue / anniversaire / paliers)
--    Stocké en JSON sur le marchand. Exemple :
--    {"welcome":5,"birthday":10,"tiers":[{"at":5,"label":"Café offert"},{"at":10,"label":"Plat offert"}]}
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS reward_config jsonb DEFAULT '{}'::jsonb;

-- 2) ANTI-FRAUDE (enforcement côté serveur, optionnel mais recommandé)
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS scan_cooldown_min int DEFAULT 0;   -- minutes mini entre 2 scans d'une même carte
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS daily_points_cap int DEFAULT 0;     -- 0 = illimité

-- 3) ANNIVERSAIRE CLIENT (pour le bonus anniversaire)
ALTER TABLE loyalty_cards ADD COLUMN IF NOT EXISTS client_birthday date;

-- 4) CAISSIERS + PIN (responsabilité / journal "qui a donné les points")
CREATE TABLE IF NOT EXISTS cashiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  pin text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cashiers_merchant ON cashiers(merchant_id);

-- 5) JOURNAL DES POINTS (audit) — ajoute le caissier + la source sur tes transactions.
--    Détecte automatiquement le nom de ta table de transactions et l'ignore si introuvable
--    (donc ne plante jamais). Pour voir tes tables : décommente la requête tout en bas.
DO $$
DECLARE t text;
BEGIN
  SELECT table_name INTO t
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = ANY(ARRAY[
      'point_transactions','points_transactions','transactions','card_transactions',
      'loyalty_transactions','point_history','points_log','points_ledger','ledger','txs'
    ])
  LIMIT 1;

  IF t IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cashier_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS source text DEFAULT ''manual''', t);
    RAISE NOTICE 'Audit : colonnes cashier_id/source ajoutées à la table %', t;
  ELSE
    RAISE NOTICE 'Audit : aucune table de transactions reconnue — étape ignorée (sans danger).';
  END IF;
END $$;

-- 6) ANTI RE-SCAN au niveau serveur (optionnel) — table légère des derniers scans
CREATE TABLE IF NOT EXISTS scan_log (
  id bigserial PRIMARY KEY,
  merchant_id uuid,
  card_code text,
  pts int,
  at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scanlog_card ON scan_log(merchant_id, card_code, at DESC);

-- 7) DEMANDES DE SUPPRESSION DE COMPTE (requis Google Play) — au cas où elle n'existe pas
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text,
  reason text,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Permissions (le projet utilise l'accès anon)
GRANT ALL ON cashiers, scan_log, account_deletion_requests TO anon, authenticated;

-- ----- DÉCOUVERTE (optionnel) : lister tes tables pour trouver celle des transactions
-- Décommente la ligne suivante, exécute-la seule, et envoie-moi le résultat :
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;

-- ============================================================
-- NOTE — Awarding serveur :
-- La logique de récompenses (bonus, paliers) et l'anti-fraude DOIVENT idéalement
-- être appliqués dans ta Edge Function `add-points` (source de vérité des points).
-- Voir le bloc commenté dans supabase-edge-send-whatsapp.ts / le README pour le pattern.
-- ============================================================
