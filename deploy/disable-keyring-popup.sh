#!/usr/bin/env bash
# Disattiva il popup "Choose password for new keyring" che gnome-keyring
# mostra alla sessione grafica quando un'app (Chromium, NetworkManager,
# ecc.) chiede per la prima volta di salvare un segreto e non esiste
# ancora un portachiavi di default. Su un Pi kiosk dedicato, senza
# tastiera/mouse comodi per rispondere al dialogo, è solo un ostacolo.
#
# Va lanciato come l'utente della sessione grafica (NON con sudo): le
# entry di autostart di sistema si disattivano per-utente con un override
# in ~/.config/autostart, senza toccare file di sistema.
#
# Uso, via SSH sul Raspberry:
#   ./deploy/disable-keyring-popup.sh
# Poi riavvia il Pi perché la sessione grafica riparta senza gnome-keyring.

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "Non lanciarlo con sudo: va disattivato per l'utente della sessione grafica, non per root." >&2
  exit 1
fi

AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"

# secrets = il componente che mostra "Choose password for new keyring"
# (Secret Service / libsecret, es. Chromium password manager).
# pkcs11  = certificati/smartcard, non ci serve.
# ssh     = integrazione ssh-agent col portachiavi; disattivandolo, se una
#           chiave SSH ha passphrase te la chiede il terminale normale
#           invece di un popup grafico -- meglio su un kiosk senza tastiera.
for component in secrets pkcs11 ssh; do
  cat > "$AUTOSTART_DIR/gnome-keyring-${component}.desktop" <<'EOF'
[Desktop Entry]
Hidden=true
EOF
done

echo "Disattivati gnome-keyring-secrets/pkcs11/ssh per l'utente $(whoami)."
echo "Riavvia il Raspberry perché il cambiamento abbia effetto: sudo reboot"
