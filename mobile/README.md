# MySargal Caisse (mobile)

Application mobile native (React Native + Expo SDK 54, TypeScript) pour la caisse
marchande MySargal. Elle reproduit exactement les appels et la logique de l'app
marchande web (`Archive/MySargal-Cloudflare/merchant/index.html`) et des
fonctions Supabase Edge (`Archive/MySargal-Supabase/functions/`).

Scanner une carte, crediter un achat, remettre une recompense, encaisser une
carte cadeau, gerer le Club Privileges et les campagnes, le tout au comptoir,
en ligne ou hors ligne.

Animations en `Animated` natif de React Native uniquement (aucune dependance
reanimated / worklets / moti / @gorhom). Une seule famille d'icones (Feather).

---

## Prerequis

- Node 18 ou plus
- npm
- Expo CLI (fourni via `npx expo`, rien a installer globalement)
- Un telephone avec **Expo Go (SDK 54)**, ou un emulateur Android / simulateur iOS
- Camera reelle pour le scan (le scan ne fonctionne pas sur simulateur)

## Installation

```bash
cd mobile
rm -rf node_modules && npm install
```

En cas de doute sur l'etat des dependances, repartir d'une installation propre
(`rm -rf node_modules && npm install`) evite la plupart des problemes de cache.

## Lancement

```bash
npx expo start -c        # -c vide le cache Metro
```

Puis :

- scanner le QR code affiche avec **Expo Go (SDK 54)** sur un telephone reel
- ou appuyer sur `a` pour un emulateur/appareil Android
- ou appuyer sur `i` pour le simulateur iOS (macOS)

Verification des types :

```bash
npm run typecheck        # tsc --noEmit  -> doit rester a 0 erreur
```

Verification du bundle (export de production) :

```bash
npx expo export --platform ios --no-bytecode
```

## Build (APK / AAB / IPA)

Le projet est pret pour EAS Build.

```bash
npm install -g eas-cli   # une fois
eas login
eas build -p android --profile preview      # APK de test
eas build -p ios --profile production
```

Renseigner `expo.extra.eas.projectId` dans `app.json` (obtenu via `eas init`)
pour activer les notifications push Expo en build natif.

---

## Flux d'authentification (sans mot de passe)

1. `send-whatsapp-otp` `{ phone }` : envoie un code a 6 chiffres par WhatsApp
   (valable 5 minutes, 3 demandes par heure maximum).
2. `verify-whatsapp-otp` `{ phone, code }` : renvoie `{ success, phone, token }`.
   Le `token` est un JWT MySargal (claim `phone`, `iss: mysargal`), valable 30
   jours. Apres 5 tentatives, le code est bloque (HTTP 429).
3. Resolution du marchand : le token porte le telephone. Comme l'app web,
   l'app interroge PostgREST `merchants?phone=eq.<phone>` (apikey + Bearer) pour
   recuperer le `merchant_id` et la config de la boutique.
4. `refresh-session` (header `Authorization: Bearer <token>`) : au demarrage,
   s'il reste moins de 15 jours, l'app renouvelle silencieusement le token
   (session 30 jours glissante). Un marchand actif ne retape jamais son OTP.

Le token est stocke en zone securisee (`expo-secure-store`). Un code PIN local
optionnel (4 chiffres, hash SHA-256 sale en secure-store) permet de rouvrir vite
l'app entre vendeurs ; l'OTP reste requis pour l'activer.

---

## Ecrans et fonctionnalites

| Ecran | Role |
| --- | --- |
| Connexion OTP | Saisie numero, envoi code, saisie 6 chiffres, renvoi avec compte a rebours, gestion erreurs (code faux, expire, 429) |
| Verrou PIN | Reouverture rapide par code 4 chiffres |
| Accueil / Caisse | Resume du jour (points, tickets, delta vs hier), gros bouton Scanner, cartes de navigation, activite recente (skeleton au chargement, etat vide dedie) |
| Scan QR | Camera (expo-camera), vibration a la detection, anti double scan, lecture hors ligne via cache |
| Mode kiosque | Borne libre-service client (plein ecran, sans safe-area), protege par PIN |
| Clients | Liste, recherche (nom / code / telephone / numero de membre), **Nouveau client**, export CSV, import VIP (CSV), fiche detail |
| Fiche client | Points, tier, progression vers recompense, credit d'un achat (montant ou points, apercu live), remise de recompense, revelation du telephone (auditee), appel / WhatsApp / SMS, desactivation de la carte |
| Nouveau client | Creation d'une carte (nom, telephone, design), parrainage, partage WhatsApp |
| Recompenses | CRUD des recompenses (nom, emoji, cout en points, type), activation / desactivation |
| Cartes cadeaux | Creer (montant libre/predefini, design, carte universelle, partage WhatsApp), Lot entreprise, Liste (stats, recharge, annulation, partage), Encaisser (par numero + OTP client, ou consultation par code) |
| Tableau de bord | Statistiques, meilleurs clients, journal d'activite, usage WhatsApp |
| Notifications | Campagnes push (segments, image), relance clients presque recompenses (WhatsApp / SMS), email de lancement |
| Club Privileges (Summit) | Paliers / niveaux (couleur, seuils), recompenses par famille, membres (edition, historique), import et cartes membres |
| Journal | Operations serveur + locales + file en attente, badges "en attente" |
| Plus | Menu des fonctions avancees (Dashboard, Notifications, Club Privileges, Cartes cadeaux, Kiosque, Journal) |
| Reglages / Compte | Infos boutique (nom), couleurs de marque, conversion points, expiration des points, automations WhatsApp, caissiers, PIN, cle API partenaire, theme evenementiel + fond, synchro, deconnexion |

Toutes les listes disposent d'un **etat vide** (`EmptyState`) et d'un **etat de
chargement** (`Skeleton` / `Loading`). Les ecrans pousses ont un bouton retour.
Un `ErrorBoundary` racine capture les erreurs de rendu.

---

## Theme evenementiel et fond reglables

L'app expose un accent et un fond **dynamiques**, regles cote proprietaire depuis
l'ecran **Reglages / Compte**. Les surfaces (blanc, textes, bordures) restent
neutres : seuls l'**accent** et le **fond** changent, ce qui recolore toute
l'application sans toucher aux ecrans.

- **Themes** (`src/theme/events.ts`) : presets `default` (vert MySargal),
  `octobre_rose`, `novembre_bleu`, `noel`, `saint_valentin`. Chaque preset definit
  `accent`, `accentDark`, `accentSoftBg` et un fond doux `bg`.
- **Fond** (`src/theme/backgrounds.ts`) : `default` (teinte du theme), `palette`
  (fond uni sobre parmi une petite palette) ou `image` (photo importee, affichee
  discretement sous un voile blanc pour garder les cartes lisibles).
- **Fournisseur** (`src/theme/ThemeProvider.tsx`) : `useTheme()` expose
  `accent`, `accentDark`, `accentSoftBg`, `accentBorder`, `accentShadow`,
  `onAccent`, ainsi que le fond resolu. Le vert n'est conserve en dur que pour le
  **semantique** (« en ligne », « succes »).

**Stockage** :

- Theme : `merchant.reward_config.app_theme` (cle du preset, ex. `octobre_rose`).
- Fond : `merchant.reward_config.app_background` (objet
  `{ type: 'default' | 'palette' | 'image', ... }`).
- Un **cache local** (`AsyncStorage` : `ms_event_theme`, `ms_app_background`)
  permet un rendu instantane au demarrage avant le chargement du marchand.
- La persistance serveur se fait via `updateMerchant` (PATCH `merchants`). Si
  l'ecriture serveur echoue (RLS), le rendu local est applique et un avertissement
  invite a reessayer la synchro.

Le fond (`AppBackground`) enveloppe **tous les ecrans** via le composant `Screen`,
**sauf** les ecrans camera (Scan, Kiosk) volontairement en plein ecran.

---

## Creation de carte

- **Carte de fidelite** : creee directement via PostgREST (`createCard` ->
  insertion dans `loyalty_cards`, apikey + Bearer), comme l'app web. Le code de
  carte est genere cote serveur (`generate_card_code`) avec repli local. L'import
  VIP passe par des insertions en lot (`insertCardsBatch`).
- **Carte cadeau** : creee via la fonction Edge **`create-gift-card`**
  (`createGiftCard`), et en lot via la RPC `gift_card_bulk_create`.

Note : le mobile ne passe pas par une fonction dediee `merchant-create-card` ;
la creation de carte de fidelite est une insertion PostgREST directe (contrat
identique au web). Voir `resolveMerchantByPhone` / `createCard` dans
`src/api/endpoints.ts` si un endpoint dedie est ajoute plus tard.

---

## Fonctionnement hors ligne

- L'etat reseau est suivi par `@react-native-community/netinfo`.
- Les operations de **credit** et de **recompense** faites sans reseau sont
  mises dans une **file d'attente locale** persistee (`AsyncStorage`), avec mise
  a jour optimiste immediate de la fiche client (points additifs, aucun conflit).
- Un **badge "en attente"** apparait sur l'onglet Journal, dans le bandeau
  d'accueil et dans les Reglages.
- Au retour du reseau, la file est **rejouee automatiquement** dans l'ordre.
  Les echecs metier definitifs (400/404/402) sont abandonnes pour ne pas boucler ;
  les erreurs reseau sont conservees et reessayees.
- Un **cache des derniers clients scannes** (40 max) permet le lookup et
  l'affichage de la fiche hors ligne (scan ou recherche par code).

---

## Gestion des ecritures et des erreurs

Le client HTTP (`src/api/client.ts`) **leve une erreur** (`ApiError`) des qu'une
reponse n'est pas `ok` ou contient un champ `error` (edge, PostgREST GET/POST/
PATCH/DELETE, RPC). Chaque ecran **attend** (`await`) le resultat, affiche un toast
de **succes uniquement apres** une ecriture reussie, et un toast d'**erreur avec
le vrai message serveur** en cas d'echec (RLS/permission compris). Aucun faux
succes : un enregistrement bloque cote serveur remonte l'erreur reelle.

---

## Notifications push

- `expo-notifications` demande la permission au premier lancement connecte.
- Le token de l'appareil est enregistre via `register-device` (`app: "merchant"`).
- Le serveur dispose de `send-push` pour l'envoi (segments, image de campagne).
- **Le push natif necessite un build de developpement** (EAS dev build ou build
  natif) : il ne fonctionne pas dans Expo Go, et pas sur simulateur.

---

## Architecture

```
mobile/
  App.tsx                  Providers + polices + navigateur racine + ErrorBoundary
  index.ts                 Entree Expo
  app.json                 Config Expo (permissions, package, splash)
  src/
    config/                URL, cle anon publique, cles de stockage
    theme/                 Palette neutre, typographie, ombres, presets d'evenements,
                           fonds reglables, ThemeProvider (accent + fond dynamiques)
    api/                   client HTTP type (edge/rest/rpc, 401 -> refresh), types, endpoints
    auth/                  contexte session (secure store) + code PIN + merchant courant
    store/                 Zustand : cache clients + journal local
    offline/               file d'attente + provider NetInfo
    push/                  enregistrement notifications
    components/            Screen, AppBackground, Button, Card, Field, Icon (Feather),
                           StatusBadge, EmptyState, Toast, Skeleton, Loading, PinPad,
                           OfflineBanner, ErrorBoundary, animations Animated natives
    navigation/            stack racine + bottom tabs (FAB Scan central)
    screens/               Login, PinLock, Home, Scan, Kiosk, Clients, Client, NewClient,
                           Rewards, GiftCards, Dashboard, Push, Summit, History, More, Settings
    utils/                 format, telephone, devise, haptique, points/membre, csv, wa, sha256
```

---

## Limites connues

- **Push** : necessite un build de developpement (pas Expo Go, pas simulateur).
- **Scan** : necessite une camera reelle (pas de simulateur).
- **Reglages proprietaire/admin** : certains reglages (couleurs de marque, theme,
  fond, conversion, expiration, automations, caissiers, cle API) dependent des
  droits RLS Supabase et necessitent une **session proprietaire/admin** de la
  boutique. Sans ces droits, l'ecriture est refusee cote serveur et l'app affiche
  la vraie erreur (aucun faux succes).
- **Resolution du `merchant_id`** : pas d'endpoint dedie ; l'app reproduit le
  mecanisme du web (PostgREST `merchants?phone=eq.<phone>`). Remplacer
  `resolveMerchantByPhone` (`src/api/endpoints.ts`) si un endpoint dedie est cree.
- **`projectId` EAS** : a renseigner dans `app.json` (`extra.eas.projectId`) pour
  les notifications push en build natif.
