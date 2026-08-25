# Odoo de démonstration — MySargal × MARAZ

Objectif : montrer au client, sur un vrai Odoo, qu'une commande confirmée
crédite automatiquement les points MySargal et envoie la carte par WhatsApp.

## 1. Lancer Odoo sur le Mac (10 minutes)

Prérequis : Docker Desktop (gratuit) — https://www.docker.com/products/docker-desktop

Dans le Terminal, depuis ce dossier :

    docker compose up -d

Puis ouvrir : http://localhost:8069

- Créer la base : nom `maraz`, mot de passe au choix, langue Français, pays Sénégal
- Cocher « Charger les données de démonstration » (pratique pour la démo)

## 2. Installer le module MySargal

1. Menu **Apps** → bouton ⋮ → **Mettre à jour la liste des applications**
2. Retirer le filtre « Apps » dans la barre de recherche
3. Chercher **MySargal** → **Installer**

## 3. Coller la clé API

**Paramètres** → activer le *mode développeur* (bas de page)
→ **Technique** → **Paramètres système** → **Créer**

| Clé | Valeur |
|---|---|
| `mysargal.api_key` | la clé MARAZ (panel MySargal → Site web / WordPress) |

## 4. Faire la démo

1. **Ventes** → **Commandes** → **Créer**
2. Client : en créer un avec un **numéro WhatsApp réel** (le tien pour la démo)
3. Ajouter un article à ~45 000 F
4. **Confirmer**
5. Dans le fil de discussion de la commande : « Points MySargal crédités : +45 »
6. Le téléphone reçoit la carte MARAZ → ajout à Apple/Google Wallet

## 5. Montrer depuis l'iPad (tunnel gratuit)

Docker ne tourne pas sur iPad : on expose l'Odoo du Mac sur une URL publique.

    brew install cloudflared
    cloudflared tunnel --url http://localhost:8069

La commande affiche une URL en `https://xxxx.trycloudflare.com` :
ouvre-la sur l'iPad — l'écran Odoo s'affiche, prêt pour la démo.

> Le Mac doit rester allumé et connecté pendant la démo.
> Pour une démo 100 % autonome sur iPad, l'alternative est Odoo.sh (payant, ~1 mois).

## 6. Arrêter

    docker compose down          # arrêt
    docker compose down -v       # arrêt + suppression des données
