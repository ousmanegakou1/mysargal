#!/bin/bash
# MySargal — démarre l'Odoo de démonstration (double-cliquer ce fichier)
cd "$(dirname "$0")" || exit 1

echo "════════════════════════════════════════"
echo "  MySargal × Odoo — démarrage"
echo "════════════════════════════════════════"
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker n'est pas installé."
  echo ""
  echo "→ Installe Docker Desktop (gratuit) :"
  echo "  https://www.docker.com/products/docker-desktop"
  echo ""
  echo "Puis relance ce fichier."
  open "https://www.docker.com/products/docker-desktop"
  read -r -p "Appuie sur Entrée pour fermer..."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "⏳ Docker Desktop n'est pas démarré — je le lance..."
  open -a Docker 2>/dev/null
  printf "   Attente du démarrage de Docker "
  for _ in $(seq 1 60); do
    if docker info >/dev/null 2>&1; then echo " ✓"; break; fi
    printf "."
    sleep 2
  done
  if ! docker info >/dev/null 2>&1; then
    echo ""
    echo "❌ Docker ne répond toujours pas. Ouvre Docker Desktop à la main, puis relance ce fichier."
    read -r -p "Appuie sur Entrée pour fermer..."
    exit 1
  fi
fi

echo "🚀 Démarrage d'Odoo (le premier lancement télécharge ~1 Go, compte 3 à 5 minutes)..."
echo ""
docker compose up -d || { echo "❌ Échec du démarrage."; read -r -p "Entrée pour fermer..."; exit 1; }

printf "⏳ Odoo démarre "
for _ in $(seq 1 90); do
  if curl -s -o /dev/null http://localhost:8069; then echo " ✓"; break; fi
  printf "."
  sleep 2
done

echo ""
echo "✅ Odoo est prêt : http://localhost:8069"
echo ""
echo "   Étape suivante — créer la base de données :"
echo "   • Nom de la base : maraz"
echo "   • Mot de passe   : (choisis-en un et note-le)"
echo "   • Langue Français · Pays Sénégal"
echo "   • Coche « Charger les données de démonstration »"
echo ""
echo "   Ensuite : Apps → ⋮ → Mettre à jour la liste des applications"
echo "             puis chercher « MySargal » et installer."
echo ""
open "http://localhost:8069"
read -r -p "Appuie sur Entrée pour fermer cette fenêtre..."
