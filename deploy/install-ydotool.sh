#!/usr/bin/env bash
# Installa ydotool e abilita il suo demone (ydotoold) come servizio di
# sistema. Serve a spostare il puntatore del mouse via iniezione di eventi
# a livello kernel (/dev/uinput) -- funziona identico sotto X11 o Wayland,
# a differenza di unclutter/xdotool che sono legati a X11.
#
# Va lanciato una tantum con sudo:
#   sudo ./deploy/install-ydotool.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Serve sudo: sudo $0" >&2
  exit 1
fi

apt-get update
apt-get install -y ydotool

# Il pacchetto Debian/Raspberry Pi OS di ydotool porta con sé l'unit
# systemd per ydotoold; se manca (versioni più vecchie del pacchetto) lo
# creiamo noi.
if systemctl list-unit-files | grep -q '^ydotoold\.service'; then
  systemctl enable --now ydotoold
else
  cat > /etc/systemd/system/ydotoold.service <<'EOF'
[Unit]
Description=ydotool input daemon

[Service]
ExecStart=/usr/bin/ydotoold --socket-path=/tmp/.ydotool_socket --socket-perm=0666
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now ydotoold
fi

sleep 1
systemctl --no-pager status ydotoold || true

echo
echo "Fatto. Prova subito (dalla sessione grafica, non serve sudo):"
echo "  YDOTOOL_SOCKET=/tmp/.ydotool_socket ydotool mousemove -- 99999 99999"
echo
echo "Se dà un errore di permessi sul socket, aggiungi il tuo utente al"
echo "gruppo che lo possiede (controlla con 'ls -l /tmp/.ydotool_socket')"
echo "e riavvia il Pi."
