#!/usr/bin/env bash
# Installa i pacchetti di sistema che il kiosk usa se presenti (es.
# unclutter per nascondere il cursore del mouse). Va lanciato una tantum
# con sudo, prima o dopo aver installato l'autostart -- l'ordine non conta.
#
# Uso, dal Raspberry, dentro la cartella del repo:
#   sudo ./deploy/install-kiosk-dependencies.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Serve sudo: sudo $0" >&2
  exit 1
fi

apt-get update

# unclutter-xfixes è il fork moderno (niente bug del cursore che sparisce
# entrando/uscendo dalla finestra); su alcune versioni di Raspberry Pi OS
# non è ancora nei repo, in quel caso usa il classico unclutter.
if apt-get install -y unclutter-xfixes; then
  :
else
  echo "unclutter-xfixes non disponibile, provo unclutter classico..." >&2
  apt-get install -y unclutter
fi

echo
echo "Fatto. Il cursore del mouse verrà nascosto automaticamente al prossimo"
echo "avvio di deploy/kiosk-display.sh (o al prossimo riavvio, se l'autostart"
echo "è già installato)."
