#!/usr/bin/env bash
# Registra deploy/kiosk-display.sh per l'avvio automatico alla sessione
# grafica del Raspberry Pi (autostart XDG, funziona sia su LXDE/Bullseye
# che su labwc/Bookworm). Va lanciato come l'utente col login automatico
# sulla TV, NON con sudo.
#
# Uso, dal Raspberry, dentro la cartella del repo:
#   ./deploy/install-kiosk-autostart.sh
#
# Rilancialo pure in futuro per aggiornarlo: è idempotente.

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Non lanciarlo con sudo: l'autostart va installato per l'utente della sessione grafica, non per root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
KIOSK_SCRIPT="$SCRIPT_DIR/kiosk-display.sh"

if [ ! -f "$KIOSK_SCRIPT" ]; then
  echo "Non trovo $KIOSK_SCRIPT" >&2
  exit 1
fi
chmod +x "$KIOSK_SCRIPT"

AUTOSTART_DIR="$HOME/.config/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/anime-vtt-kiosk.desktop"
mkdir -p "$AUTOSTART_DIR"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Anime VTT Kiosk
Comment=Apre Chromium in kiosk mode su /display all'avvio della sessione grafica
Exec=$KIOSK_SCRIPT
X-GNOME-Autostart-enabled=true
EOF

echo "Scritto $DESKTOP_FILE:"
echo "---"
cat "$DESKTOP_FILE"
echo "---"
echo
echo "Fatto. Al prossimo riavvio (o al prossimo login grafico) Chromium si apre"
echo "da solo in kiosk su /display."
echo
echo "Per provarlo subito senza riavviare:"
echo "  $KIOSK_SCRIPT"
echo
echo "Per disattivarlo:"
echo "  rm \"$DESKTOP_FILE\""
