# MySargal — Backend Supabase (NE PAS mettre sur Cloudflare)

⚠️ Projet **MySargal uniquement** — ne touche pas aux tables `sc_*` (ton autre plateforme).

## 1) Migration SQL
Supabase → **SQL Editor** → colle et exécute `mysargal-phase2.sql`.
- Idempotent (sans risque à relancer).
- Ajoute : `reward_config`, colonnes anti-fraude, `client_birthday`, table `cashiers`, `scan_log`,
  et les colonnes d'audit `cashier_id`/`source` sur ta table `transactions` (auto-détectée).
- ✅ Déjà passée chez toi si tu as suivi les étapes précédentes.

## 2) Edge Function `notify-whatsapp` (→ WaSender)
Remplace le code de ta fonction `notify-whatsapp` par `functions/notify-whatsapp/index.ts`
(passe de Twilio à WaSender, avec fallback Twilio automatique). Puis :
```bash
supabase functions deploy notify-whatsapp
supabase secrets set WASENDER_API_KEY=ta_cle_wasender
# optionnel si ton endpoint diffère :
supabase secrets set WASENDER_URL=https://wasenderapi.com/api/send-message
```
Vérifie les champs (`to` / `text`) attendus par TON compte WaSender dans le fichier.

## 3) Edge Function `add-points` (enforcement serveur)
Remplace le code de ta fonction `add-points` par `functions/add-points/index.ts`. Puis :
```bash
supabase functions deploy add-points
```
Même réponse qu'avant (l'app marche pareil). Enforcement actif **seulement si tu le configures**
sur le marchand : anti re-scan, plafond/jour, bonus anniversaire, audit `cashier_id`, paliers.

## Après déploiement
Fais **un scan test** sur ton propre numéro avant un vrai broadcast / une vraie mise en prod.
Si une erreur apparaît, envoie-la moi.

## Fonctions à NE PAS remplacer
Tes autres fonctions (`api-balance`, `api-redeem`, `api-scan`, `get-points`, `redeem-reward`,
`send-whatsapp-bulk`, `send-whatsapp-otp`, `verify-whatsapp-otp`) restent telles quelles.
