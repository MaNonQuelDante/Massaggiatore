# CHANGELOG v2.5.68 — Attivazione mirror Funnel (Google Sheet creato + ID cablato)

Completa l'attivazione del Funnel Notify introdotto in v2.5.66/67: il foglio mirror esisteva
solo "in teoria" (ID vuoto). Ora è creato e collegato.

## Cosa è stato fatto (automatico, lato Drive/repo)
- **Creato** il Google Sheet nativo **"Massaggiatore - Funnel Lead"** nel Drive
  (cartella `RIPARTIAMO DA QUI/000) SOFTWARE/02) MASSAGGIATORE/`).
  - ID: `1Mclh4ua8_7a9d6nmOTh1WXxOGW0rXw5cNkXVLennQDE`
- **Cablato lo stesso ID** in due punti (devono restare identici):
  - `js/config.js` → `FUNNEL_SHEET_ID`
  - `apps-script-funnel-notify/Config.gs` → `CONFIG.SHEET_ID`
- La tab `LEADS` e l'header (`leadKey | telefono | nome | codice | status | t0ISO | createdISO |
  updatedAt`) si creano **da soli** al primo load della sezione Lead (`js/funnel-sheet-sync.js`).

## Effetto
- Da ora, aprendo l'app loggati e visitando la sezione **Lead**, lo stato funnel viene
  rispecchiato sul foglio → l'Apps Script "Funnel Notify" può leggerlo a browser chiuso.
- Fail-safe invariato: prima di v2.5.68 `FUNNEL_SHEET_ID` era vuoto = mirror spento.

## Ancora manuale (non automatizzabile da qui)
- L'**Apps Script** va creato/incollato nel tuo account Google (i `.gs` sono in
  `apps-script-funnel-notify/`, già con `SHEET_ID` + `FUNNEL_CUTOFF_ISO`). Nessun canale
  programmatico dalla repo verso Apps Script.

## File
- **Modificati**: `js/config.js` (versione + `FUNNEL_SHEET_ID`), `index.html` (versione +
  cache-bust `config.js`), `apps-script-funnel-notify/Config.gs` (`SHEET_ID`).
