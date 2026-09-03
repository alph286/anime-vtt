#!/usr/bin/env bash
# Installa Anime VTT come servizio systemd che parte da solo all'avvio del
# Raspberry Pi (e si riavvia da solo se va in crash).
#
# Uso, dal Raspberry, dentro la cartella del repo:
#   sudo ./deploy/install-service.sh
#
# Rilancialo tranquillamente in futuro (es. dopo un git pull che tocca
# questo script) per aggiornare il servizio: è idempotente.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Serve sudo: sudo $0" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
WORKDIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -f "$WORKDIR/package.json" ] || [ ! -f "$WORKDIR/server/index.js" ]; then
  echo "Non trovo package.json/server/index.js in $WORKDIR — questo script va lanciato dal repo clonato." >&2
  exit 1
fi

if [ ! -d "$WORKDIR/node_modules" ]; then
  echo "node_modules mancante in $WORKDIR — lancia prima 'npm install' (come utente normale, non root)." >&2
  exit 1
fi

if [ ! -f "$WORKDIR/.env" ]; then
  echo "Attenzione: nessun .env in $WORKDIR (copialo da .env.example se ti serve configurare PORT/DATA_DIR/STORAGE_DIR). Continuo con i default." >&2
fi

# Utente non-root sotto cui far girare il servizio: chi ha lanciato sudo,
# altrimenti chiedi.
SERVICE_USER="${SUDO_USER:-}"
if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = "root" ]; then
  read -rp "Utente sotto cui far girare il servizio (es. pi): " SERVICE_USER
fi
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Utente '$SERVICE_USER' inesistente." >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "node non trovato nel PATH di root. Installa Node.js o esegui questo script con sudo -E dopo aver caricato nvm." >&2
  exit 1
fi

UNIT_SRC="$SCRIPT_DIR/anime-vtt.service.template"
UNIT_DST="/etc/systemd/system/anime-vtt.service"

sed \
  -e "s#{{SERVICE_USER}}#${SERVICE_USER}#g" \
  -e "s#{{WORKDIR}}#${WORKDIR}#g" \
  -e "s#{{NODE_BIN}}#${NODE_BIN}#g" \
  "$UNIT_SRC" > "$UNIT_DST"

echo "Scritto $UNIT_DST:"
echo "---"
cat "$UNIT_DST"
echo "---"

systemctl daemon-reload
systemctl enable anime-vtt.service
systemctl restart anime-vtt.service

sleep 1
systemctl --no-pager status anime-vtt.service || true

echo
echo "Fatto. Il server parte da solo a ogni avvio del Raspberry e si riavvia da solo se crasha."
echo
echo "Comandi utili:"
echo "  sudo systemctl status anime-vtt    # stato"
echo "  sudo journalctl -u anime-vtt -f    # log in tempo reale"
echo "  sudo systemctl restart anime-vtt   # riavvio manuale"
echo "  sudo systemctl stop anime-vtt      # ferma (es. per lanciare 'npm run dev' a mano)"
