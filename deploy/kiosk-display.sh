#!/usr/bin/env bash
# Apre Chromium in kiosk mode sulla pagina /display, pensato per l'autostart
# della sessione grafica del Raspberry Pi collegato alla TV.
#
# Uso manuale (per provarlo prima di installarlo in autostart):
#   ./deploy/kiosk-display.sh
#
# Variabili opzionali:
#   ANIME_VTT_URL   URL della pagina display (default: http://localhost:3000/display)
#   ANIME_VTT_WAIT  secondi massimi di attesa che il server risponda (default: 30)

set -uo pipefail

URL="${ANIME_VTT_URL:-http://localhost:3000/display}"
WAIT_MAX="${ANIME_VTT_WAIT:-30}"

# Il server potrebbe non essere ancora su alla prima apertura della sessione
# grafica al boot (parte come servizio systemd in parallelo) -- aspettalo
# invece di mostrare l'errore di connessione di Chromium.
echo "Aspetto che $URL risponda (max ${WAIT_MAX}s)..."
waited=0
while ! curl -sf -o /dev/null "$URL"; do
  sleep 1
  waited=$((waited + 1))
  if [ "$waited" -ge "$WAIT_MAX" ]; then
    echo "Il server non ha risposto entro ${WAIT_MAX}s, apro Chromium comunque." >&2
    break
  fi
done

# Niente spegnimento schermo / screensaver mentre la TV deve restare accesa.
# Funziona sotto X11 (Bullseye e Bookworm con Xwayland); se il tuo desktop è
# Wayland puro (labwc) e lo schermo si spegne comunque, disabilita il
# blanking da raspi-config: Display Options > Screen Blanking > No.
if command -v xset >/dev/null 2>&1; then
  xset s off -dpms s noblank 2>/dev/null || true
fi

# Nasconde il cursore del mouse quando fermo, se disponibile (facoltativo).
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0.5 -root &
fi

CHROMIUM_BIN=""
for candidate in chromium-browser chromium; do
  if command -v "$candidate" >/dev/null 2>&1; then
    CHROMIUM_BIN="$candidate"
    break
  fi
done
if [ -z "$CHROMIUM_BIN" ]; then
  echo "Chromium non trovato (provato chromium-browser e chromium). Installalo con:" >&2
  echo "  sudo apt install chromium-browser   # oppure: chromium" >&2
  exit 1
fi

# Profilo dedicato: evita il popup "Ripristina pagine" se Chromium era stato
# chiuso male, e non sporca il profilo utente normale.
PROFILE_DIR="$HOME/.config/anime-vtt-kiosk-chromium"
mkdir -p "$PROFILE_DIR"

# Se Chromium crasha o viene chiuso, lo si vuole vedere ripartire da solo
# sulla TV senza dover intervenire a mano.
while true; do
  "$CHROMIUM_BIN" \
    --kiosk \
    --app="$URL" \
    --user-data-dir="$PROFILE_DIR" \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 \
    --overscroll-history-navigation=0 \
    --disable-pinch
  echo "Chromium si è chiuso, lo riavvio tra 3s..."
  sleep 3
done
