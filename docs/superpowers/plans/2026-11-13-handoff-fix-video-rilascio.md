# Handoff — rilascio dei `<video>` su /display, /handout, /control, /party (13 nov 2026)

Da riprendere dopo il /clear. Branch di lavoro: **`fix-video-rilascio`** (creato da `main` 04dbfaf).

## Contesto
- 13 nov, ~19:56: crash del renderer di Chrome su kratosHard (tab di /editor, "Aw, Snap"). Il
  server era sano. Causa: si esaurisce la **BAR1** della RTX 3060 (256 MiB, Resizable BAR
  spento, 90-130 MiB già usati dal desktop). Chrome mappa lì i fotogrammi video e il kernel
  registra `NVRM ... Out of memory`.
- Causa nell'app, già corretta: le miniature `<video>` di `MediaPreview` restavano caricate
  dopo lo smontaggio. Fix `bd5ba1f`, merge `04dbfaf` su `main`, **pushato e in produzione**:
  raspymedia è su 04dbfaf, `anime-vtt.service` è stato riavviato il 13 nov alle 20:24 ed è
  attivo. La nota è in `CLAUDE.md` (sezione «Crash di /editor cambiando location in fretta»).
- Il deploy di `handout-default-location` (bb1cc03) era già in produzione.

## Domanda aperta di Alph
«Non è che mi succede con control, handout, display e party aperto?»

Un agente aveva iniziato a rispondere, ma si è fermato a metà. Ha lasciato in `fix-video-rilascio`
solo **3 test nuovi in `public/shared/media.test.js`**, che falliscono perché l'implementazione
non c'è (commit WIP sul branch). Non ci sono misure registrate: vanno rifatte.

## Cosa fare
1. **Implementare in `public/shared/media.js`** i test già scritti:
   - `releaseMedia(el)`: se `el.dataset.mapSrc` o `src` è valorizzato, `pause()` (solo per i
     video), poi `removeAttribute('src')` e `load()` (solo per i `<video>`, cioè se `el.load`
     esiste), e cancella `dataset.mapSrc`. Senza niente caricato non fa nessuna chiamata.
     Va esportata in `module.exports`.
   - `loadMapMedia`: oggi, nascondendo l'elemento inattivo (~righe 115-120), toglie solo
     `src`. Deve usare `releaseMedia`, così il `<video>` nascosto chiama anche `load()`.
   - Verifica: `node --test public/shared/media.test.js`.
2. **Usare `releaseMedia` dove si nascondono i media**: `clearMedia` in
   `public/handout/handout.js` e i punti analoghi in `public/display/display.js` (video della
   mappa, video handout, `stopHandoutVideo`). Controllare se le anteprime delle mappe video
   in /control e /party (`editor-app/src/control/map/*`, `src/party/*`) usano `loadMapMedia`
   o altri `<video>`. Se sì, applicare lo stesso rilascio e ricostruire con `npm run build:all`.
3. **Misurare** su un server di prova (porta 3100, copia di `data/` e `storage/` sotto
   `/tmp/claude-1000/`, senza `telegram.json`), con Playwright e
   `nvidia-smi --query-gpu=bar1.used --format=csv` campionato durante la prova:
   - /editor + /display + /handout + /control + /party aperti insieme;
   - cambi di location veloci e mostra/nascondi di video handout;
   - misure prima (su `main`) e dopo (sul branch).
   Mai aprire /display o /control sul server vero (`displayViewport` è globale). Fermare i
   processi solo per PID.
4. **Rischio per dispositivo** da riportare ad Alph:
   - kratosHard: BAR1;
   - Raspberry Pi 4: kiosk di /display, RAM limitata;
   - telefoni: /control e /party.
   Raccomandazione già emersa: attivare **Resizable BAR** nel BIOS di kratosHard.
5. **Chiudere il lavoro**:
   - test verdi (`npm run test:server`, `cd editor-app && npx vitest run`);
   - aggiornare la sezione del crash in `CLAUDE.md`;
   - chiedere ad Alph prima di merge, push e deploy, perché per questo branch non li ha
     ancora autorizzati.
   - Deploy, come per gli altri: `ssh raspymedia`, `cd ~/Projects/anime-vtt && git pull
     --ff-only`, poi `sudo -n systemctl restart anime-vtt.service`. Copia di
     `data/state.json` solo se cambia lo stato (qui non cambia).

## Da sapere
- Su raspymedia c'è `data/state.json.pre-handout-<data>`, la copia di sicurezza fatta prima
  della migrazione handout. Si può cancellare quando Alph conferma che è tutto a posto.
- Minori aperti dell'archivio handout: sono in `CLAUDE.md`, sezione «Pagina /handout».
