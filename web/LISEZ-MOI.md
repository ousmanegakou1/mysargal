# MySargal — Fichiers Cloudflare

Dépose **le contenu de ce dossier** à la racine de ton site Cloudflare, en gardant cette arborescence.

## Arborescence

```
/                         → racine du site (mysargal.com)
├── index.html            → page d'accueil (choix Commerçant / Client)
├── giftcard.html         → voir une gift card
├── buy-giftcard.html     → acheter une gift card
├── merchant/
│   └── index.html        → app Commerçant (panel boutique)
├── admin/
│   └── index.html        → panel Super Admin
├── client-app/
│   └── index.html        → app Client « Mes cartes » (login + portefeuille)
└── c/
    └── index.html        → vue « Ma carte » (ouverte via .../c/?code=XXXX)
```

## Correspondance avec tes anciens fichiers

| Nouveau chemin                | Ancien fichier que tu m'as envoyé      | Rôle                          |
|-------------------------------|----------------------------------------|-------------------------------|
| `index.html`                  | index-a690345f.html                    | Landing (choix de rôle)       |
| `merchant/index.html`         | index.html (Commerçant)                | App marchand                  |
| `admin/index.html`            | index-de61315f.html                    | Super Admin                   |
| `client-app/index.html`       | index-b0a27a11.html (« Mes cartes »)   | App client (portefeuille)     |
| `c/index.html`                | index-74b0e2d5.html (« Ma carte »)     | Vue d'une carte par code      |
| `giftcard.html`               | giftcard.html                          | Vue gift card                 |
| `buy-giftcard.html`           | buy-giftcard.html                      | Achat gift card               |

## ⚠️ À vérifier (chemins)
Les sous-dossiers `merchant/` et `admin/` sont confirmés (liens trouvés dans le code).
`client-app/`, `c/`, `giftcard.html` et `buy-giftcard.html` sont déduits des liens du code
(`/client-app/`, `/c/?code=`, `/buy-giftcard.html`). **Si ton organisation actuelle diffère,
garde TES chemins existants** et remplace juste le contenu des fichiers — c'est plus sûr.

## Non inclus (tu les as déjà, ne pas écraser)
`manifest.json`, `sw.js`, `delete-account.html`, le dossier `/assets/` (dont `mysargal-common.js`),
et tes images/icônes. Je n'y ai pas touché.

## Ce qui est commun à tous les fichiers
- Police sans-serif (Montserrat + Inter).
- Vrai logo MySargal (s'adapte au thème).
- Mode clair/sombre partagé (clé `localStorage` `ms-theme`) : changer le thème quelque part le change partout.

➡️ Le backend (Supabase) est dans le dossier voisin **MySargal-Supabase** — il ne va PAS sur Cloudflare.
