-- ============================================================
-- MySargal - Seed MARAZ SUMMIT CLUB
-- Idempotent : upsert des 3 tiers + 20 recompenses reparties sur 5 familles.
-- Ne plante pas si le marchand MARAZ n'existe pas encore (RAISE NOTICE).
-- ============================================================

DO $$
DECLARE
  v_merchant_id uuid;
  v_membre_id uuid;
  v_ascension_id uuid;
  v_sommet_id uuid;
  v_has_slug boolean;
BEGIN
  -- Le champ slug n'existe pas forcement sur merchants dans toutes les instances
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='merchants' AND column_name='slug'
  ) INTO v_has_slug;

  IF v_has_slug THEN
    EXECUTE 'SELECT id FROM merchants WHERE slug=$1 OR name ILIKE $2 LIMIT 1'
      INTO v_merchant_id USING 'maraz', 'maraz%';
  ELSE
    SELECT id INTO v_merchant_id FROM merchants WHERE name ILIKE 'maraz%' LIMIT 1;
  END IF;

  IF v_merchant_id IS NULL THEN
    RAISE NOTICE 'Seed MARAZ : marchand introuvable (name ILIKE maraz%%). Etape ignoree - sans danger.';
    RETURN;
  END IF;

  -- 1) Reward config du marchand : active le club et fixe le ratio F CFA -> points
  UPDATE merchants
  SET reward_config = COALESCE(reward_config, '{}'::jsonb)
    || jsonb_build_object(
      'maraz_summit_club', true,
      'point_ratio_fcfa', 10000,
      'point_rounding', 'floor_10k',
      'annual_reset', true
    )
  WHERE id = v_merchant_id;

  -- 2) TIER : Membre (0-99 pts, <1M F CFA)
  INSERT INTO sargal_tiers (merchant_id, name, min_points, max_points, min_spend_year, benefits_json, color_hex, priority)
  VALUES (
    v_merchant_id, 'Membre', 0, 99, 0,
    jsonb_build_array(
      jsonb_build_object('family','cadeaux_exclusifs','label','Cadeaux exclusifs d entree'),
      jsonb_build_object('family','evenements_exclusifs','label','Ventes privees'),
      jsonb_build_object('family','services_personnalises','label','Personal shopper'),
      jsonb_build_object('family','points_echangeables','label','Bons d achat'),
      jsonb_build_object('family','experiences_uniques','label','Ateliers decouverte')
    ),
    '#1e3a5f', 1
  )
  ON CONFLICT (merchant_id, priority) DO UPDATE SET
    name = EXCLUDED.name,
    min_points = EXCLUDED.min_points,
    max_points = EXCLUDED.max_points,
    min_spend_year = EXCLUDED.min_spend_year,
    benefits_json = EXCLUDED.benefits_json,
    color_hex = EXCLUDED.color_hex
  RETURNING id INTO v_membre_id;

  -- 3) TIER : Ascension (100-199 pts, 1M-2M F CFA)
  INSERT INTO sargal_tiers (merchant_id, name, min_points, max_points, min_spend_year, benefits_json, color_hex, priority)
  VALUES (
    v_merchant_id, 'Ascension', 100, 199, 1000000,
    jsonb_build_array(
      jsonb_build_object('family','cadeaux_exclusifs','label','Foulards signature'),
      jsonb_build_object('family','evenements_exclusifs','label','Avant-premieres collections'),
      jsonb_build_object('family','services_personnalises','label','Retouche prioritaire'),
      jsonb_build_object('family','points_echangeables','label','Bons 20 000 F CFA'),
      jsonb_build_object('family','experiences_uniques','label','Diners de marque')
    ),
    '#c85a3e', 2
  )
  ON CONFLICT (merchant_id, priority) DO UPDATE SET
    name = EXCLUDED.name,
    min_points = EXCLUDED.min_points,
    max_points = EXCLUDED.max_points,
    min_spend_year = EXCLUDED.min_spend_year,
    benefits_json = EXCLUDED.benefits_json,
    color_hex = EXCLUDED.color_hex
  RETURNING id INTO v_ascension_id;

  -- 4) TIER : Sommet (200+ pts, 2M+ F CFA)
  INSERT INTO sargal_tiers (merchant_id, name, min_points, max_points, min_spend_year, benefits_json, color_hex, priority)
  VALUES (
    v_merchant_id, 'Sommet', 200, NULL, 2000000,
    jsonb_build_array(
      jsonb_build_object('family','cadeaux_exclusifs','label','Pieces uniques haute couture'),
      jsonb_build_object('family','evenements_exclusifs','label','Defiles VIP'),
      jsonb_build_object('family','services_personnalises','label','Conciergerie dediee'),
      jsonb_build_object('family','points_echangeables','label','Bons 100 000 F CFA'),
      jsonb_build_object('family','experiences_uniques','label','Voyages atelier artisan')
    ),
    '#f3ede0', 3
  )
  ON CONFLICT (merchant_id, priority) DO UPDATE SET
    name = EXCLUDED.name,
    min_points = EXCLUDED.min_points,
    max_points = EXCLUDED.max_points,
    min_spend_year = EXCLUDED.min_spend_year,
    benefits_json = EXCLUDED.benefits_json,
    color_hex = EXCLUDED.color_hex
  RETURNING id INTO v_sommet_id;

  -- 5) Catalogue MARAZ - 20 recompenses reparties sur les 5 familles et les 3 tiers.
  -- Idempotent : suppression par (merchant_id, name) puis re-insertion.
  DELETE FROM sargal_rewards WHERE merchant_id = v_merchant_id AND name IN (
    'Bon d achat 10 000 F CFA',
    'Bon d achat 25 000 F CFA',
    'Emballage cadeau signature',
    'Personal shopper 30 min',
    'Livre d art curatorial',
    'Soin spa partenaire 1h',
    'Diner restaurant partenaire 2 pers',
    'Entretien maroquinerie annuel',
    'Livraison offerte a vie',
    'Bon d achat 60 000 F CFA',
    'Vente privee saison',
    'Foulard soie edition limitee',
    'Voyage atelier artisan Marrakech',
    'Defile prive Fashion Week Dakar',
    'Conciergerie 24/7 12 mois',
    'Pret sac evenement',
    'Consultation stylisme 2h',
    'Piece accessoire signature',
    'Bon d achat 250 000 F CFA',
    'Cocktail privatise soiree Maraz',
    -- Anciens noms (nettoyage de la premiere vague de seed)
    'Foulard soie signature',
    'Vente privee',
    'Voyage atelier artisan',
    'Personal shopper',
    'Bon d achat 20 000 F'
  );

  -- Famille : points_echangeables --------------------------------------------
  INSERT INTO sargal_rewards
    (merchant_id, family, name, description, points_cost, tier_required_id, image_url, active, sort_order)
  VALUES
    (v_merchant_id, 'points_echangeables',
      'Bon d achat 10 000 F CFA',
      'Bon d achat de 10 000 F CFA utilisable en boutique MARAZ.',
      20, v_membre_id, '/membre/assets/rewards/bon-achat.svg', true, 10),
    (v_merchant_id, 'points_echangeables',
      'Bon d achat 25 000 F CFA',
      'Bon d achat de 25 000 F CFA utilisable en boutique MARAZ.',
      50, v_membre_id, '/membre/assets/rewards/bon-achat.svg', true, 20),
    (v_merchant_id, 'points_echangeables',
      'Bon d achat 60 000 F CFA',
      'Bon d achat de 60 000 F CFA reserve aux membres Ascension.',
      100, v_ascension_id, '/membre/assets/rewards/bon-achat.svg', true, 30),
    (v_merchant_id, 'points_echangeables',
      'Bon d achat 250 000 F CFA',
      'Bon d achat premium de 250 000 F CFA reserve aux membres Sommet.',
      500, v_sommet_id, '/membre/assets/rewards/bon-achat.svg', true, 40);

  -- Famille : services_personnalises -----------------------------------------
  INSERT INTO sargal_rewards
    (merchant_id, family, name, description, points_cost, tier_required_id, image_url, active, sort_order)
  VALUES
    (v_merchant_id, 'services_personnalises',
      'Emballage cadeau signature',
      'Emballage cadeau MARAZ, papier de soie et rubans signature.',
      10, v_membre_id, '/membre/assets/rewards/foulard.svg', true, 10),
    (v_merchant_id, 'services_personnalises',
      'Personal shopper 30 min',
      'Une session personal shopper de 30 minutes en boutique MARAZ.',
      30, v_membre_id, '/membre/assets/rewards/foulard.svg', true, 20),
    (v_merchant_id, 'services_personnalises',
      'Entretien maroquinerie annuel',
      'Entretien professionnel annuel de vos pieces en cuir MARAZ.',
      70, v_ascension_id, '/membre/assets/rewards/foulard.svg', true, 30),
    (v_merchant_id, 'services_personnalises',
      'Livraison offerte a vie',
      'Livraison offerte pour tous vos achats MARAZ, sans limite de duree.',
      40, v_ascension_id, '/membre/assets/rewards/foulard.svg', true, 40),
    (v_merchant_id, 'services_personnalises',
      'Pret sac evenement',
      'Pret d une piece maroquinerie MARAZ pour un evenement (48h).',
      150, v_sommet_id, '/membre/assets/rewards/foulard.svg', true, 50),
    (v_merchant_id, 'services_personnalises',
      'Consultation stylisme 2h',
      'Consultation stylisme personnalise de 2h avec un consultant MARAZ.',
      130, v_sommet_id, '/membre/assets/rewards/foulard.svg', true, 60),
    (v_merchant_id, 'services_personnalises',
      'Conciergerie 24/7 12 mois',
      'Acces conciergerie MARAZ 24/7 pendant 12 mois complets.',
      220, v_sommet_id, '/membre/assets/rewards/foulard.svg', true, 70);

  -- Famille : cadeaux_exclusifs ----------------------------------------------
  INSERT INTO sargal_rewards
    (merchant_id, family, name, description, points_cost, tier_required_id, image_url, active, sort_order)
  VALUES
    (v_merchant_id, 'cadeaux_exclusifs',
      'Livre d art curatorial',
      'Livre d art curate par l atelier MARAZ, tirage limite.',
      60, v_ascension_id, '/membre/assets/rewards/foulard.svg', true, 10),
    (v_merchant_id, 'cadeaux_exclusifs',
      'Foulard soie edition limitee',
      'Foulard soie MARAZ, edition limitee Sommet.',
      180, v_sommet_id, '/membre/assets/rewards/foulard.svg', true, 20),
    (v_merchant_id, 'cadeaux_exclusifs',
      'Piece accessoire signature',
      'Accessoire signature MARAZ (choix parmi une selection Sommet).',
      200, v_sommet_id, '/membre/assets/rewards/foulard.svg', true, 30);

  -- Famille : experiences_uniques --------------------------------------------
  INSERT INTO sargal_rewards
    (merchant_id, family, name, description, points_cost, tier_required_id, image_url, active, sort_order)
  VALUES
    (v_merchant_id, 'experiences_uniques',
      'Soin spa partenaire 1h',
      'Soin 1h dans l un des spas partenaires MARAZ selectionnes.',
      90, v_ascension_id, '/membre/assets/rewards/spa.svg', true, 10),
    (v_merchant_id, 'experiences_uniques',
      'Diner restaurant partenaire 2 pers',
      'Diner pour deux personnes dans un restaurant partenaire MARAZ.',
      120, v_ascension_id, '/membre/assets/rewards/spa.svg', true, 20),
    (v_merchant_id, 'experiences_uniques',
      'Voyage atelier artisan Marrakech',
      'Voyage atelier chez un artisan partenaire a Marrakech, sejour de 3 jours.',
      400, v_sommet_id, '/membre/assets/rewards/voyage.svg', true, 30);

  -- Famille : evenements_exclusifs -------------------------------------------
  INSERT INTO sargal_rewards
    (merchant_id, family, name, description, points_cost, tier_required_id, image_url, active, sort_order)
  VALUES
    (v_merchant_id, 'evenements_exclusifs',
      'Vente privee saison',
      'Acces vente privee saisonniere MARAZ, avant-premiere collection.',
      50, v_ascension_id, '/membre/assets/rewards/evenement.svg', true, 10),
    (v_merchant_id, 'evenements_exclusifs',
      'Defile prive Fashion Week Dakar',
      'Invitation VIP au defile prive MARAZ pendant la Fashion Week de Dakar.',
      250, v_sommet_id, '/membre/assets/rewards/evenement.svg', true, 20),
    (v_merchant_id, 'evenements_exclusifs',
      'Cocktail privatise soiree Maraz',
      'Cocktail privatise pour 15 personnes lors d une soiree MARAZ.',
      300, v_sommet_id, '/membre/assets/rewards/evenement.svg', true, 30);

  RAISE NOTICE 'Seed MARAZ : tiers et 20 recompenses inseres pour merchant %', v_merchant_id;
END $$;
