#!/bin/bash
# MySargal — expose l'Odoo local sur une URL publique (pour l'iPad / le client)
cd "$(dirname "$0")" || exit 1

echo "════════════════════════════════════════"
echo "  Tunnel public — démo sur iPad"
echo "════════════════════════════════════════"
echo ""

if ! curl -s -o /dev/null http://localhost:8069; then
  echo "❌ Odoo ne tourne pas."
  echo "→ Lance d'abord « 1-Demarrer-Odoo.command »."
  read -r -p "Appuie sur Entrée pour fermer..."
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "⏳ Installation de cloudflared..."
  if command -v brew >/dev/null 2>&1; then
    brew install cloudflared || { echo "❌ Échec de l'installation."; read -r -p "Entrée pour fermer..."; exit 1; }
  else
    echo "❌ Homebrew n'est pas installé."
    echo "→ Installe-le depuis https://brew.sh puis relance ce fichier."
    open "https://brew.sh"
    read -r -p "Appuie sur Entrée pour fermer..."
    exit 1
  fi
fi

echo "🌍 Création du tunnel..."
echo ""
echo "   Une adresse en https://xxxxx.trycloudflare.com va s'afficher ci-dessous."
echo "   Ouvre-la sur l'iPad pour faire la démo."
echo ""
echo "   ⚠️  Garde cette fenêtre OUVERTE pendant toute la démo."
echo "       (Ctrl+C pour arrêter le tunnel)"
echo ""
cloudflared tunnel --url http://localhost:8069
