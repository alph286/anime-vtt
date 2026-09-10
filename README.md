# Anime VTT

Un "tavolo virtuale" per il gioco di ruolo: mostra mappe e immagini su una TV,
le nasconde a pezzi con la nebbia di guerra (fog of war), e tutto viene
comandato da uno smartphone mentre si gioca. Gira interamente sul tuo
computer o su un Raspberry Pi collegato alla TV, sulla tua rete di casa —
**non serve internet** una volta installato, e non c'è nessun account da
creare da nessuna parte.

> Questo programma è nato per una campagna di Dungeons & Dragons specifica
> ("Anime Salve"), pensato per un solo Dungeon Master (DM) che prepara le
> scene e le pilota durante la sessione. Non è un servizio online con più
> utenti o più tavoli contemporaneamente: è pensato per un DM, un tavolo,
> una TV. Il codice però non contiene nulla di specifico legato a quella
> campagna — chiunque può scaricarlo e usarlo per il proprio tavolo, seguendo
> questa guida.

## Cos'è, in pratica

Il programma ha **quattro pagine**, ognuna con un ruolo diverso:

- **`/editor`** — la usi prima della sessione, dal tuo PC: qui carichi le
  mappe, disegni le zone coperte dalla nebbia di guerra, carichi le immagini
  da mostrare ai giocatori, e prepari tutto con calma.
- **`/control`** — la usi durante la sessione, dal telefono: da qui scegli
  cosa mostrare sulla TV, sveli o nascondi pezzi di mappa, muovi la vista,
  mostri un'immagine ai giocatori.
- **`/display`** — è quella che resta aperta sulla TV, a schermo intero: i
  giocatori la guardano e basta, non la toccano mai.
- **`/opzioni`** — impostazioni generali: qui configuri l'URL di PicSender e
  il nome della campagna, senza dover toccare file a mano.

`/editor`, `/control` e `/display` restano sincronizzate in tempo reale:
quello che fai sul telefono in `/control` appare subito sulla TV in
`/display`, senza bisogno di premere "aggiorna" o ricaricare nulla.

## Cosa ti serve prima di iniziare

- **Un computer** (Windows, Mac o Linux) su cui installare ed eseguire il
  programma. Basta questo per provarlo.
- **(Facoltativo)** se vuoi uno schermo dedicato sempre acceso per il tavolo:
  un **Raspberry Pi** (modello 4 o più recente) collegato alla TV, più una
  scheda SD. Se non sai cos'è un Raspberry Pi: è un piccolo computer
  economico, grande quanto un mazzo di carte, pensato per restare acceso e
  collegato a uno schermo — più avanti in questa guida trovi la sezione
  dedicata a come metterlo in funzione. Non è obbligatorio: puoi tenere
  aperta la pagina `/display` anche su un normale PC o una smart TV con
  browser.
- **Una rete Wi-Fi o cavo di casa** — telefono, computer (e Raspberry Pi, se
  lo usi) devono essere collegati alla stessa rete. Non serve internet:
  serve solo che i dispositivi si "vedano" tra loro in casa.

## Installazione, passo per passo

Questa sezione presume che tu non abbia mai usato un terminale prima.
Ogni comando va copiato e incollato esattamente com'è scritto.

### 1. Installa Node.js

Node.js è il programma "motore" su cui gira Anime VTT — senza di lui, il
programma non parte. Vai su **[nodejs.org](https://nodejs.org)**, scarica la
versione consigliata per il tuo sistema (quella indicata come "LTS") e
installala come un programma qualsiasi (Avanti, Avanti, Fine).

Per controllare che sia andato tutto bene, apri un terminale (vedi punto
successivo per come aprirlo) e scrivi:

```bash
node -v
```

Se risponde con qualcosa tipo `v20.11.0`, ha funzionato.

### 2. Apri un terminale

Il "terminale" è una finestra dove si scrivono comandi invece di cliccare
sulle icone — è lo strumento che useremo per installare e avviare il
programma.

- **Windows:** cerca "PowerShell" o "Prompt dei comandi" nel menu Start e
  aprilo.
- **Mac:** cerca "Terminale" con Spotlight (`⌘ + Barra spaziatrice`, poi
  scrivi "Terminale").
- **Linux:** di solito `Ctrl + Alt + T`, oppure cerca "Terminale" nel menu
  applicazioni.

### 3. Scarica il programma

Se hai già `git` installato (un altro programma per scaricare e aggiornare
progetti come questo), nel terminale scrivi:

```bash
git clone https://github.com/alph286/anime-vtt.git
cd anime-vtt
```

Se non vuoi installare `git`, in alternativa vai sulla pagina del progetto
su GitHub, clicca sul pulsante verde **"Code"** e poi **"Download ZIP"**,
estrai lo ZIP scaricato in una cartella a tua scelta, poi nel terminale
spostati dentro quella cartella con il comando `cd` seguito dal percorso
(es. `cd Desktop/anime-vtt`).

### 4. Installa i "pezzi" di codice che servono

Sempre dentro la cartella del progetto, scrivi:

```bash
npm install
```

Questo comando scarica automaticamente alcuni pezzi di codice di cui il
programma ha bisogno per funzionare (non serve capire cosa siano: il
comando fa tutto da solo). Ci vuole di solito meno di un minuto, con una
connessione internet normale — è l'unico momento in cui questo programma ha
bisogno di internet: solo qui, in fase di installazione.

### 5. Crea il file di configurazione

Il programma legge le sue impostazioni da un file chiamato `.env`. Per
crearlo a partire da un modello già pronto:

```bash
cp .env.example .env
```

Non serve modificarlo per iniziare — funziona già con i valori di base.
Se in futuro vuoi capire cosa contiene, sono quattro righe:

- `PORT=3000` — su quale "canale" (porta) del computer gira il programma.
  Lascialo com'è a meno che tu non sappia già che la porta 3000 è occupata
  da qualcos'altro sul tuo computer.
- `DATA_DIR=./data` — dove viene salvato lo stato del gioco (locations,
  posizioni, ecc.).
- `STORAGE_DIR=./storage` — dove vengono salvate le mappe e le immagini che
  carichi.
- `PICSENDER_URL=` — riguarda una funzione facoltativa per inviare foto su
  Telegram tramite un altro programma esterno (PicSender). **Non serve più
  modificare questa riga:** l'URL di PicSender ora si imposta dalla pagina
  `/opzioni` una volta avviato il programma (vedi sotto). Questa riga in
  `.env` serve solo a chi aveva già configurato PicSender prima
  dell'introduzione di `/opzioni`: al primo avvio dopo l'aggiornamento, il
  valore viene letto una sola volta da qui e trasferito automaticamente
  nelle impostazioni salvate — dopo quel primo avvio, modificare `.env` non
  ha più nessun effetto. Se stai partendo da zero, lascia pure questa riga
  vuota e configura tutto da `/opzioni`.

### 6. Avvia il programma

```bash
npm run dev
```

Se tutto è andato bene, il terminale mostrerà un messaggio che dice che il
server è partito. **Lascia questa finestra di terminale aperta**: è lei che
tiene acceso il programma. Se la chiudi, il programma si spegne (più avanti,
nella sezione sul Raspberry Pi, trovi come farlo partire da solo senza
tenere aperto nulla).

### 7. Apri le pagine

Sullo stesso computer dove hai avviato il programma, apri un browser
(Chrome, Firefox, Safari, quello che usi di solito) e vai su:

- `http://localhost:3000/editor` — per preparare le mappe
- `http://localhost:3000/control` — per pilotare la sessione
- `http://localhost:3000/display` — quella che andrà sulla TV
- `http://localhost:3000/opzioni` — per configurare l'URL di PicSender e il
  nome della campagna

Per aprire `/control` dal telefono (che è il modo in cui verrà usata
davvero, durante la sessione), il telefono deve essere sulla stessa rete
Wi-Fi del computer, e al posto di `localhost` devi scrivere l'indirizzo di
rete locale del computer. Per trovarlo:

- **Windows:** apri il Prompt dei comandi e scrivi `ipconfig`, cerca la riga
  "Indirizzo IPv4" (qualcosa tipo `192.168.1.23`).
- **Mac:** Preferenze di Sistema → Rete → seleziona la connessione attiva,
  l'indirizzo IP è mostrato lì.
- **Linux:** apri un terminale e scrivi `hostname -I`.

Poi dal telefono vai su `http://192.168.1.23:3000/control` (sostituendo con
il tuo indirizzo reale). Stessa cosa per aprire `/display` su un'altra TV o
computer della rete.

## Come si usa, in breve

1. **Da `/editor`** (PC, prima della sessione): crea una "location" (una
   scena/stanza/luogo), carica un'immagine o un video come mappa, disegna
   le zone da coprire con la nebbia di guerra trascinando col mouse,
   carica eventuali immagini da mostrare ai giocatori (illustrazioni,
   ritratti di PNG, ecc.).
2. **Da `/control`** (telefono, durante la sessione): scegli quale location
   mostrare sulla TV, rivela o nascondi le zone coperte, sposta/zooma la
   vista, mostra un'immagine a schermo intero ai giocatori quando serve.
3. **`/display`** (TV): non richiede nessuna azione — mostra semplicemente
   quello che decidi da `/control`, aggiornandosi da solo in tempo reale.

Il resto delle funzioni (griglia per il combattimento, rosa dei venti,
esportazione/backup delle location, invio foto su Telegram) si scopre
esplorando i menu di `/editor` e `/control` — sono tutte pensate per essere
intuitive senza bisogno di documentazione aggiuntiva.

## Metterlo su un Raspberry Pi collegato alla TV (facoltativo)

Questa parte è per chi vuole uno schermo sempre pronto per il tavolo, che si
accende da solo insieme alla TV senza dover aprire terminali o browser a
mano ogni volta. Se ti basta usarlo dal computer come spiegato sopra, puoi
saltare questa sezione.

Prerequisiti: un Raspberry Pi con Raspberry Pi OS installato (con interfaccia
grafica), collegato alla TV via HDMI, con Node.js installato sopra (stessi
passi 1-6 della sezione di installazione, eseguiti direttamente sul
Raspberry invece che sul tuo PC).

Poi, dalla cartella del progetto sul Raspberry:

```bash
sudo ./deploy/install-service.sh
```

Questo comando fa partire Anime VTT automaticamente ogni volta che il
Raspberry si accende, e lo fa ripartire da solo se per qualche motivo si
blocca — non dovrai più aprire un terminale per farlo funzionare. Ogni
volta che riscarichi una versione più recente del codice, puoi rilanciare
questo stesso comando per aggiornare il servizio.

Poi, per far sì che la TV mostri automaticamente `/display` a schermo
intero appena il Raspberry si accende:

```bash
./deploy/install-kiosk-autostart.sh
```

(questo secondo comando va lanciato **senza** `sudo` davanti, a differenza
del primo). Dopo aver eseguito entrambi gli script, basta riavviare il
Raspberry Pi: la TV si accenderà da sola su `/display`, pronta per la
sessione.

## Domande frequenti

**Ho chiuso la finestra del terminale e `/control`/`/display` non
rispondono più.** È normale se hai avviato il programma con `npm run dev`:
quella finestra deve restare aperta. Per un uso permanente senza tenere
aperto nulla, guarda la sezione sul Raspberry Pi qui sopra.

**Ho paura di perdere mappe e immagini che ho caricato.** Tutto quello che
carichi vive in due cartelle dentro il progetto: `data/` (le informazioni
sulle location) e `storage/` (le mappe e immagini vere e proprie). Per fare
un backup, basta copiare queste due cartelle da qualche parte. Il programma
ha anche una funzione di esportazione integrata (menu in alto a destra in
`/editor`) per salvare una singola location o l'intera campagna come file
scaricabile, utile anche solo per spostare tutto su un altro computer.

**Posso usarlo per la mia campagna, con un altro nome?** Sì. Il nome
"Anime Salve" compare solo come testo nell'interfaccia — puoi cambiarlo
dalla pagina `/opzioni` (campo "Nome campagna"), oppure lasciarlo così, non
ha nessun effetto sul funzionamento.

## Ambienti separati

`node_modules/`, `.env` e i contenuti di `data/` e `storage/` sono esclusi
da git. Ogni macchina (il tuo computer, e poi eventualmente il Raspberry
Pi) fa il proprio `npm install` e ha il proprio `.env`, così le due
installazioni restano indipendenti pur condividendo lo stesso codice
sorgente — aggiornare il codice su una non tocca mai i dati salvati
sull'altra.
