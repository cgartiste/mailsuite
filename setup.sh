#!/bin/bash
# MailSuite — Script d'installation automatique VPS
# Usage: bash setup.sh
# Testé sur Ubuntu 22.04 / Debian 12

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
fail() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "══════════════════════════════════════════"
echo "   MailSuite — Installation automatique"
echo "══════════════════════════════════════════"
echo ""

# ── 1. Mise à jour système ────────────────────────────────────────────────────
log "Mise à jour des paquets système..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Dépendances système ────────────────────────────────────────────────────
log "Installation des dépendances système..."
apt-get install -y -qq curl git python3 python3-pip python3-venv build-essential

# ── 3. Node.js 22 ────────────────────────────────────────────────────────────
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1 | tr -d 'v') -lt 18 ]]; then
  log "Installation de Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  log "Node.js $(node -v) déjà installé"
fi

# ── 4. PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &> /dev/null; then
  log "Installation de PM2..."
  npm install -g pm2
else
  log "PM2 $(pm2 -v) déjà installé"
fi

# ── 5. Dossier logs ───────────────────────────────────────────────────────────
log "Création du dossier logs..."
mkdir -p logs

# ── 6. MailSuite API — dépendances Node ──────────────────────────────────────
log "Installation des dépendances MailSuite API..."
cd MailSuite
npm install --production
cd ..

# ── 7. MailSuite Frontend — dépendances + build ───────────────────────────────
log "Installation des dépendances Next.js..."
cd MailSuite/frontend
npm install

log "Build du frontend Next.js (production)..."
npm run build
cd ../..

# ── 8. PipePass — environnement Python ───────────────────────────────────────
log "Configuration de l'environnement Python pour PipePass..."
cd PipePass
python3 -m venv .venv
.venv/bin/pip install --upgrade pip -q
.venv/bin/pip install flask requests pyotp selenium -q
cd ..

# Mettre à jour ecosystem.config.js pour utiliser le venv Python
sed -i "s|'python3'|'$(pwd)/PipePass/.venv/bin/python3'|g" ecosystem.config.js

# ── 9. Fichier .env ───────────────────────────────────────────────────────────
if [ ! -f MailSuite/.env ]; then
  warn "Fichier .env manquant — copie depuis .env.example"
  cp MailSuite/.env.example MailSuite/.env
  warn "⚠️  IMPORTANT: Editez MailSuite/.env avec vos vraies valeurs !"
  warn "   nano MailSuite/.env"
fi

# ── 10. Lancement avec PM2 ────────────────────────────────────────────────────
log "Démarrage des services avec PM2..."
pm2 start ecosystem.config.js

log "Configuration du démarrage automatique au boot..."
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || warn "Exécutez manuellement la commande 'pm2 startup' affichée ci-dessus"

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════"
echo -e "${GREEN}   Installation terminée !${NC}"
echo "══════════════════════════════════════════"
echo ""
IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo "  MailSuite API      →  http://${IP}:5050"
echo "  MailSuite Frontend →  http://${IP}:3000"
echo "  PipePass           →  http://${IP}:7070"
echo ""
echo "  Commandes utiles:"
echo "  pm2 status          — état des services"
echo "  pm2 logs            — voir les logs"
echo "  pm2 restart all     — redémarrer tout"
echo ""
warn "N'oubliez pas d'ouvrir les ports 3000, 5050, 7070 dans votre firewall !"
echo ""
