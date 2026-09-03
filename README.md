# Anime VTT

Display locale di mappe e fog of war per la campagna D&D "Anime Salve", controllato da smartphone e mostrato su TV via Raspberry Pi.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Poi apri:
- `http://localhost:3000/display` — vista TV (fullscreen, indicatore wifi in basso a destra)
- `http://localhost:3000/control` — controllo da smartphone
- `http://localhost:3000/editor` — editor base (upload mappa/immagini, toggle rapido poligoni)

## Stato attuale (scaffolding)

- Server Express + socket.io, stato persistito in `data/state.json` (creato al primo avvio)
- File caricati salvati in `storage/maps/` e `storage/images/` (esclusi da git)
- Sincronizzazione in tempo reale tra le tre viste
- Location di esempio "Taverna" con due poligoni FoW precaricati, per testare subito il toggle

## Prossimi passi

- Editor avanzato: disegno e modifica dei poligoni FoW sulla mappa (libreria canvas, es. Konva.js, da servire in locale senza CDN)
- Calibrazione profili TV (scala/offset) dall'editor
- Gesture di pan/zoom touch sul controllo, invece dei soli pulsanti
- Multi-campagna

## Autorun sul Raspberry

Sul Raspberry (dopo `npm install` e la copia di `storage/`/`data/state.json`),
installa il servizio systemd che fa partire il server da solo a ogni avvio
e lo riavvia da solo se crasha:

```bash
sudo ./deploy/install-service.sh
```

Comandi utili dopo l'installazione: `sudo systemctl status anime-vtt`,
`sudo journalctl -u anime-vtt -f` (log), `sudo systemctl restart anime-vtt`,
`sudo systemctl stop anime-vtt` (per lanciare `npm run dev` a mano al suo
posto, es. durante debug).

### Chromium in kiosk sulla TV

Se il Raspberry ha Raspberry Pi OS con desktop e login automatico, questo
apre Chromium a schermo intero su `/display` a ogni avvio della sessione
grafica (e lo riapre da solo se si chiude):

```bash
./deploy/install-kiosk-autostart.sh
```

Va lanciato come l'utente della sessione grafica, **senza** `sudo` (a
differenza di `install-service.sh`). Per provare lo script senza
riavviare: `./deploy/kiosk-display.sh`. Per disattivarlo:
`rm ~/.config/autostart/anime-vtt-kiosk.desktop`.

Se al boot compare "Choose password for new keyring" (gnome-keyring che
chiede di creare un portachiavi, tipicamente per il password manager di
Chromium): `kiosk-display.sh` passa già `--password-store=basic` per
evitarlo, ma se capita comunque (es. causato da un'altra app) lancialo e
riavvia:

```bash
./deploy/disable-keyring-popup.sh
```

## Ambienti separati

`node_modules/`, `.env` e i contenuti di `data/` e `storage/` sono esclusi da git. Ogni macchina (il tuo computer e poi il Raspberry) fa il proprio `npm install` e ha il proprio `.env`, così locale e Raspberry restano installazioni indipendenti pur condividendo lo stesso codice sorgente.
# anime-vtt
