# MySargal — Passes Apple & Google en auto (Edge Functions)

Objectif : **plus de génération en lot ni de GitHub Pages**. La passe se génère et se
signe **à la volée** quand le client appuie « Ajouter au Wallet » → toujours à jour.

- `functions/get-google-pass/` → lien « Save to Google Wallet » signé à la volée (redirige vers Google).
- `functions/get-apple-pass/`  → `.pkpass` généré + signé à la volée (PKCS#7).

URL d'appel :
```
https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1/get-google-pass?code=LC-XXXX
https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1/get-apple-pass?code=LC-XXXX
```
(fonctionne aussi pour les `GC-XXXX`, détecté automatiquement)

---

## 1) Déploiement
```bash
supabase functions deploy get-google-pass --no-verify-jwt
supabase functions deploy get-apple-pass  --no-verify-jwt
```

## 2) Secrets

### Google
```bash
supabase secrets set GOOGLE_WALLET_ISSUER_ID=3388000000023131442
supabase secrets set GOOGLE_WALLET_CLASS_PREFIX=BCR2DN5TY2B552Z6
supabase secrets set GOOGLE_WALLET_SA_EMAIL="$(jq -r .client_email google-service-account.json)"
supabase secrets set GOOGLE_WALLET_SA_PRIVATE_KEY="$(jq -r .private_key google-service-account.json)"
```

### Apple (depuis tes fichiers existants à la racine du projet)
```bash
supabase secrets set APPLE_PASS_TYPE_ID=pass.com.mysargal.app
supabase secrets set APPLE_TEAM_ID=6779DNV7Y5
supabase secrets set APPLE_PASS_CERT="$(cat pass-cert-only.pem)"
supabase secrets set APPLE_PASS_KEY="$(cat mysargal-pass.key)"
supabase secrets set APPLE_WWDR="$(cat AppleWWDRCAG4.pem)"
# si ta clé est protégée par mot de passe :
# supabase secrets set APPLE_PASS_KEY_PASSWORD=...
```
(`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà fournis automatiquement.)

## 3) Test (À FAIRE avant de brancher l'app)
- Ouvre dans le navigateur :
  `https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1/get-google-pass?code=LC-UNCODEREEL`
  → doit rediriger vers `pay.google.com/gp/v/save/...`
- `https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1/get-apple-pass?code=LC-UNCODEREEL`
  → doit télécharger un `.pkpass` qui s'ouvre sur iPhone.
- ⚠️ **Apple est strict sur la signature.** Si le `.pkpass` ne s'ouvre pas, envoie-moi
  l'erreur (logs : `supabase functions logs get-apple-pass`) — on ajuste (souvent le
  digest sha256/sha1 ou l'ordre des certificats). Le code Google, lui, est standard.

## 4) Brancher l'app (APRÈS que les tests passent)
Remplace les liens Wallet par les Edge Functions. Cherche dans tes fichiers :

**`c/index.html`** (Ma carte) — fonction `initLCWallet` :
```js
// AVANT
var passUrl='https://ousmanegakou1.github.io/mysargal-passes/'+code+'.pkpass';
// APRÈS
var passUrl=SB_URL+'/functions/v1/get-apple-pass?code='+code;
// et le bouton Google (toujours visible) :
if(gb){ gb.style.display='flex'; gb.href=SB_URL+'/functions/v1/get-google-pass?code='+code; }
```

**`client-app/index.html`** (Mes cartes) et **`giftcard.html`** : pareil, pointe
`btn-apple-wallet` / le bouton Google vers ces deux URLs (avec le bon `code`).

Dis-moi quand tu veux que je fasse ces remplacements dans les fichiers — je ne les ai
PAS encore touchés pour ne pas casser tes liens actuels tant que les fonctions ne sont
pas déployées et testées.

---

## Ménage (optionnel, dans le dossier racine du projet)
Tu peux supprimer sans risque :
- `generate_passes_v2.py`, `generate_passes_v3.py`, `generate_passes_v4.py`,
  `generate_pass_mysargal_final.py` (stubs obsolètes, ils s'auto-désactivent déjà).
- le fichier-déchet `generate_passes_v5.python3 - << 'PYEOF'` (commande shell ratée).

Garde `generate_passes_v5.py` et `generate_google_passes.py` comme **filet de secours**
(génération en lot) au cas où tu veuilles régénérer en masse un jour.

## Pourquoi cette approche
- **Auto** : une nouvelle carte a sa passe immédiatement (rien à relancer).
- **À jour** : le solde/points sont lus au moment du tap.
- **Zéro GitHub Pages** : plus de dossier `passes/` à pousser.
- Limite : une fois ajoutée au Wallet, la mise à jour **temps réel** (push quand les
  points changent) nécessite en plus le web service PassKit (Apple) / un PATCH d'objet
  (Google). C'est une étape 2 si tu la veux.
