# MySargal

Plateforme de fidélité et cartes cadeaux (Sénégal / Afrique de l'Ouest).

## Structure

- `web/`               Front-end statique (site mysargal.com) — déployé sur Cloudflare Pages.
- `supabase/functions/` Edge Functions (Deno) — backend.
- `supabase/migrations/` Migrations SQL de la base Postgres.
- `wordpress-plugin/`   Plugin WooCommerce MySargal.
- `odoo-demo/`          Module Odoo POS de démonstration.

## Déploiement

### Front-end (le plus simple, via Git)
Cloudflare Pages connecté à ce dépôt GitHub :
- Build command : (aucune)
- Output directory : `web`
À chaque `git push` sur `main`, Cloudflare redéploie automatiquement.

### Backend (Supabase — pas via Git, en ligne de commande)
Les Edge Functions et migrations ne se déploient pas par un simple push.
Depuis la racine du repo, avec la CLI Supabase installée et connectée :

    supabase link --project-ref iiocxlvcuoqafzlisqwd
    supabase db push                          # applique les migrations
    supabase functions deploy <nom-fonction>  # déploie une fonction

Astuce : possibilité d'automatiser plus tard via une GitHub Action (supabase/setup-cli).

## Secrets
Aucun secret n'est versionné (voir .gitignore). Les clés (Apple/Google Wallet,
WhatsApp, Resend, JWT) vivent dans les variables d'environnement Supabase et
Cloudflare, jamais dans le code.
