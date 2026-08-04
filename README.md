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

## Ambienti separati

`node_modules/`, `.env` e i contenuti di `data/` e `storage/` sono esclusi da git. Ogni macchina (il tuo computer e poi il Raspberry) fa il proprio `npm install` e ha il proprio `.env`, così locale e Raspberry restano installazioni indipendenti pur condividendo lo stesso codice sorgente.
# anime-vtt
