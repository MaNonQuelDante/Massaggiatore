# v2.5.55 — Funnel conferma lead: checklist a 5 step dentro ogni card Lead

## Cosa cambia
Dentro **ogni card della pagina "Lead"** compare un nuovo blocco **"Funnel conferma"**:
una checklist di **5 step** con checkbox, separata e sopra lo **Storico messaggi**
(che resta invariato). Serve a tracciare l'iter di conferma del lead.

Le righe (orari calcolati da **T0**, **NON** cumulativi):

| # | Azione | Orario |
|---|--------|--------|
| 0 | Ingresso lead | `T0` — **checkbox spuntata di default** |
| 1 | Scrivere al lead | `T0 + 2h` |
| 2 | Sollecitare il lead | `T0 + 4h` |
| 3 | Sollecitare via chiamata | `T0 + 6h` |
| 4 | Inviare a Gruppo NoShow | *(solo checkbox, nessun orario)* |

Orari in formato **hh:mm (24h)**.

## Fonte di T0 — eventi "LEAD - Call"
- **T0 = orario di INIZIO** dell'evento Google Calendar con titolo esatto
  **`LEAD - Call`** (case-insensitive) agganciato al lead.
- Gli eventi vengono letti dalla **sincronizzazione già esistente**
  (`syncCalendarEvents` → `localStorage['sgmess_calendar_events']`): **nessuna nuova
  lettura Calendar inventata**.
- **Match card-lead ↔ evento** riusando gli helper esistenti del progetto:
  `extractPhoneFromEvent` (telefono, confronto sulle ultime 9 cifre → robusto al
  prefisso +39) e, in fallback, `extractNameFromEvent` + `parseNameSurname` (nome).
- **Nessun orario inventato**: se per un lead non c'è un evento `LEAD - Call`
  agganciato (o è un evento all-day senza ora), gli orari mostrano `—` e compare il
  badge **`T0 n/d`**. La checkbox resta comunque usabile.

## Persistenza (cloud)
- Lo stato delle checkbox è persistito col **meccanismo già presente** per i dati lead:
  **Google Drive** via `window.DriveStorage`, nuova chiave **`LEAD_CHECKLIST`**
  (`{ "<leadKey>": { ingresso, scrivere, sollecitare, chiamata, noshow } }`).
  `leadKey` = la stessa chiave di raggruppamento del lead (`tel:…` o `nome:…`).
- **Riga 0 spuntata di default** finché l'utente non la cambia.
- **Loading vs vuoto** (pattern v2.5.54): `loadLeadSection()` **non scrive mai** in
  cloud durante il render; salva **solo** su azione utente (`toggleLeadChecklistStep`).

## Dettaglio tecnico
- `js/main.js`
  - `STORAGE_KEYS.LEAD_CHECKLIST` aggiunta.
  - Nuovi: `LEAD_CHECKLIST_STEPS`, `leadChecklistState`, `leadPhone9`, `leadNameKey`,
    `buildLeadCallIndex`, `findLeadT0`, `leadStepTime`, `renderLeadChecklist`,
    `toggleLeadChecklistStep` (esposta su `window`).
  - `loadLeadSection()`: carica `LEAD_CHECKLIST` da Drive, costruisce l'indice degli
    eventi `LEAD - Call`, salva `_key` su ogni lead, inietta il blocco checklist nella
    card e aggancia i listener `change` (event delegation) dopo l'`innerHTML`.
- `css/style.css`: nuovi stili `.lead-checklist*`, `.lead-check-row` (+ stato `.done`),
  `.lc-label`, `.lc-time`, `.lead-checklist-hint`.
- `index.html` / `js/config.js`: bump versione **2.5.55** + cache-bust `main.js`,
  `config.js`, `style.css`.

## NON toccato
- **Storico messaggi** della pagina Lead (`cronologia` / raggruppamento per lead):
  invariato, resta sotto la checklist.
- Logica Calendar (`syncCalendarEvents`, `extractPhoneFromEvent`,
  `extractNameFromEvent`, `parseNameSurname`): **riusata**, non modificata.
- Scope OAuth, Client ID, redirect URI: invariati.

## Da sapere / setup
- Perché un lead mostri gli orari, deve esistere un evento intitolato **esattamente
  `LEAD - Call`** in un calendario già sincronizzato dall'app (pattern `SG -` / `Lead`),
  con il **telefono del lead nella descrizione/location** (così il match per telefono
  funziona) o un attendee/nome coerente. Altrimenti: `T0 n/d` + orari `—`.
