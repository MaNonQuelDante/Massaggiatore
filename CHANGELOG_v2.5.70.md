# CHANGELOG v2.5.70 — FIX scope Apps Script (apertura foglio Funnel)

Fix di un solo scope OAuth lato Apps Script "Funnel Notify". **L'app web NON cambia
comportamento** (versione bumpata solo per coerenza del workflow di deploy).

## Problema
Al primo `test()` dell'Apps Script:
```
❌ FunnelStore: impossibile aprire il foglio: Specified permissions are not sufficient
   to call SpreadsheetApp.openById. Required permissions: .../auth/spreadsheets
```
`SpreadsheetApp.openById()` richiede lo scope **pieno** `https://www.googleapis.com/auth/spreadsheets`;
quello che avevo messo (`spreadsheets.readonly`) basta solo per la REST Sheets API, non per
`SpreadsheetApp`.

## Fix
- `apps-script-funnel-notify/appsscript.json`: scope
  `https://www.googleapis.com/auth/spreadsheets.readonly` → `https://www.googleapis.com/auth/spreadsheets`.
- Lo script continua solo a LEGGERE il foglio (nessuna scrittura), ma `SpreadsheetApp` non ha una
  modalità readonly: serve lo scope pieno. Cambiare scope forza un **re-consenso** Google una tantum.

## Verifica positiva (dal log di test())
Il cutoff non-retroattivo funziona: i 4 eventi "LEAD - Call" esistenti (creati 10–18 giugno, prima
del cutoff) sono stati tutti **saltati** (`🛡️ Evento creato prima del cutoff → salto`), zero mail.

## File
- **Modificati**: `apps-script-funnel-notify/appsscript.json` (scope); `js/config.js` + `index.html`
  (solo bump versione + cache-bust config.js). Nessun cambiamento di comportamento del web.
