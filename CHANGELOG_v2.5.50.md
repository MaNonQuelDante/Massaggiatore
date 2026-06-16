# CHANGELOG v2.5.50 — Cronologia 100% cloud (log messaggi WhatsApp)

## Obiettivo
La sezione **Cronologia** non mostrava nulla. Ora registra e mostra il LOG di ogni
messaggio inviato, con **storage 100% su cloud** (Google Drive). In locale resta
**solo il token Google OAuth**.

## Scelta storage (Drive vs Sheets)
**Google Drive (file JSON via `DriveStorage`)**: il log è un array append-only che
l'app già sa gestire, riusa l'OAuth/gapi esistente e tiene tutti i dati in un solo
backend. Sheets avrebbe aggiunto un secondo sistema + il bootstrap dello spreadsheet
senza vantaggi per un log che si consulta dentro l'app.

## Causa reale del "non mostra nulla" (RISOLTA)
`google-drive-storage.js` salva nello spazio **`appDataFolder`**, ma gli scope OAuth
avevano solo `drive.file` e **mancava `drive.appdata`** → ogni read/write su Drive
falliva con 403 e la cronologia viveva di fatto solo in `localStorage` (cancellato
al logout). **Aggiunto lo scope `https://www.googleapis.com/auth/drive.appdata`**
in `js/google-auth.js`.
⚠️ Al primo login dopo l'aggiornamento Google chiederà di **ri-autorizzare** (nuovo
scope): è normale, basta accettare.

## Cosa è cambiato

### `js/google-auth.js`
- Aggiunto scope `drive.appdata` all'array `SCOPES`.

### `index.html`
- Card Cronologia: aggiunto **date picker** (`#cronologiaDate`, default = oggi) e
  pulsante **Oggi** (`#cronologiaTodayBtn`).
- Bump versione (title, header, cache-buster di `config.js`, `google-auth.js`,
  `main.js`, `style.css`).

### `js/main.js`
- **`saveToCronologia`** (write):
  - Ogni entry ora salva anche `numeroInternazionale` (`+39…`) e
    `waLink` (`https://wa.me/<numero_senza_+_e_spazi>`), oltre a
    timestamp ISO, nome, cognome, telefono, testo del messaggio.
  - **Solo cloud**: rimosso il backup/lettura su `localStorage` (e la chiamata rotta
    a `mostraNotifica`, funzione inesistente). Se non sei loggato, avvisa e NON salva.
  - **Append-only**: legge l'array da Drive, mette la nuova entry in testa
    (`unshift`) e riscrive l'intero array; le entry esistenti non vengono mai alterate.
- **`loadCronologia` / nuova `renderCronologia`** (read):
  - Carica la cronologia da Drive una volta in cache, poi filtra per la data scelta.
  - Entry della data selezionata **dalla più recente alla più vecchia**.
  - Ogni riga: **orario · nome**, **numero +39**, **link cliccabile alla chat
    WhatsApp** (`target="_blank" rel="noopener"`), più il testo del messaggio.
  - Data senza messaggi → **"Nessun messaggio inviato in questa data."**
  - Retro-compatibilità: le entry vecchie senza `waLink`/`numeroInternazionale`
    ricostruiscono numero e link al volo dal campo `telefono`.
- Nuova helper **`waDigitsFromPhone`**: normalizza il telefono in sole cifre formato
  internazionale (rimuove spazi/`+`/simboli; antepone `39` se IT a 10 cifre).

### `css/style.css`
- Stili (palette viola/grigia) per toolbar data, input data, pulsante Oggi, badge
  tipo messaggio, numero e link WhatsApp.

## Test
- `node --check` su `main.js`, `google-auth.js`, `config.js` → OK.
- Harness Node+vm che carica le **vere** funzioni da `main.js` (`waDigitsFromPhone`,
  `localDateKey`) + replica del filtro/ordinamento di `renderCronologia`:
  **13/13 pass** (numeri IT/esteri, `+39`, spazi/trattini, link wa.me, formato data,
  filtro per data, ordine dal più recente, scarto di timestamp non validi/null).
- ⚠️ Il salvataggio/lettura **live su Google Drive** è verificabile solo con login
  reale (non testabile da qui).

## Nota (da tenere a mente)
Finché l'invio passa da `wa.me` (WhatsApp si apre e l'invio è manuale), il LOG
registra **l'intenzione di invio**, non la conferma di consegna.

## Dati ancora in localStorage (flag, NON rimossi in questa versione)
Sono **cache di dati che vivono già in cloud** (Google Calendar/Contacts/Drive) o
preferenze UI; rimuoverli ora rischiava di rompere l'app, quindi sono solo segnalati:
- `google-calendar.js`: cache eventi/calendari, calendari selezionati, lead
  contattati → fonte di verità = Google Calendar + Drive.
- `rubrica.js`: cache scansione, contatti salvati, range date → fonte = Google
  Contacts.
- `google-sheets-assistenti.js`: cache assistenti (genere M/F) → fonte = Google Sheet.
- `google-auth.js`: token Google (consentito), `sgmess_operator_name/photo` (dal
  profilo Google a ogni login), `sgmess_debug_mode` (preferenza UI).
- `main.js` `loadTemplates`: i template stanno in `localStorage` ma vengono
  **azzerati e rigenerati dai default a ogni caricamento** → nessun dato utente
  persistente da perdere.
</content>
</invoke>
