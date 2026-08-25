-- ============================================================
-- MySargal — Mode de points persistant sur le marchand
-- (par achat = 1 scan = 1 point  OU  par montant = 1 point / X FCFA)
-- À exécuter dans Supabase → SQL Editor. Idempotent.
-- ============================================================
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS pts_amount_mode    boolean DEFAULT false;  -- true = points selon le montant
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS pts_fcfa_per_point  int     DEFAULT 1000;   -- 1 point = X FCFA (mode montant)

-- Vérif :
-- SELECT id, name, pts_amount_mode, pts_fcfa_per_point FROM merchants LIMIT 5;
