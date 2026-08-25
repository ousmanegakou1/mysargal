=== MySargal — Fidélité & Cartes cadeaux (WooCommerce) ===

Ce que fait le plugin :
1. Carte cadeau au checkout — le client saisit son code GC-XXXXXX, le solde est vérifié
   en direct, le montant est appliqué en remise, puis débité au paiement.
   En cas de remboursement/annulation, la carte est automatiquement recréditée.
2. Points de fidélité — chaque commande payée crédite des points au client
   (retrouvé/créé par son numéro), avec envoi de sa carte sur WhatsApp.

Installation :
1. Zippez le dossier "mysargal-loyalty" (ou utilisez le .zip fourni).
2. WordPress → Extensions → Ajouter → Téléverser une extension → activez.
3. WooCommerce → MySargal → collez votre Clé API (Espace développeurs MySargal).
4. C'est prêt. Testez une commande, puis une carte cadeau au checkout.

Notes :
- Aucune donnée sensible n'est stockée sur le site : tout passe par l'API MySargal
  (clé x-api-key) et le registre reste chez MySargal.
- Idempotent : une commande ne crédite les points qu'une seule fois, une carte cadeau
  n'est débitée qu'une fois (clé wc-<order_id>).
- Devise : FCFA (XOF).
