# CHANGELOG v2.5.76 — PERF sezione Lead: load paralleli + cache TTL 90s

## Contesto
Segnalazione: «su GitHub il sito va troppo lento nella sezione Lead». Idea dell'utente: caricare
solo i pending e comprimere/rimandare i vecchi (streaming "stile Spotify"). Volume reale: **2–4
lead al giorno** (qualche centinaio l'anno).

## Diagnosi (codice vero, niente tirare a indovinare)
- La parte "carica solo i pending" **era già fatta** in v2.5.75 (archivio lazy: le card di
  confermati/no si costruiscono solo alla 1ª apertura del `<details>`). Quindi il rendering NON
  era il collo di bottiglia.
- Lo **streaming stile Spotify / paginazione** è overengineering inutile con pochi lead/giorno:
  il problema non è la *quantità*, è l'**I/O seriale** verso Drive.
- Il vero collo di bottiglia è in `loadLeadSection` (la funzione async; **non** `renderLeadList`,
  che è quella sincrona — il prompt iniziale aveva il nome sbagliato): ad ogni apertura della
  sezione faceva **7 `DriveStorage.load` SEQUENZIALI** (cronologia, checklist, agganci, stato,
  orari, codici, counter), ognuno aspettava il precedente → ~7× la latenza di Drive, **ogni volta**
  che si entrava nella sezione (nessuna cache).

## Fix 1 — Load in PARALLELO [`js/main.js` → `loadLeadSection()`]
I 7 blocchi `try/catch` sequenziali sostituiti da **un solo `Promise.allSettled`** che lancia tutte
le load insieme. Da ~7× latenza a ~1×. Comportamento **identico** per ogni chiave:
- default a vuoto se la chiave manca (`leadChecklistState={}`, `leadBindings={}`, ecc.);
- **fallback localStorage** per la cronologia quando Drive è vuoto/assente (invariato);
- **logging del singolo errore** per chiave: lo status `rejected` di `allSettled` logga come i
  vecchi `catch` per-chiave;
- **migrazione una-tantum** `LEAD_CONFIRMED → LEAD_STATUS` eseguita **dopo** i load paralleli, e
  **solo se `LEAD_STATUS` è davvero ASSENTE** (load `fulfilled` ma vuota). Dettaglio preservato con
  cura: se la load di `LEAD_STATUS` **fallisce** (`rejected`) si logga l'errore e **non** si migra
  — esattamente come faceva il vecchio `catch` esterno (non scattava l'`else`/migrazione).

Le assegnazioni alle globali (`leadChecklistState`, `leadBindings`, `leadStatusState`,
`leadChecklistTimes`, `leadCodes`, `leadCodeCounter`, `window.leadCodes`, `window.leadCodeCounter`)
restano identiche.

## Fix 2 — Cache TTL 90s in memoria [`js/main.js`]
Nuovi simboli a livello di modulo: `LEAD_DATA_TTL_MS = 90000`, `leadDataCacheAt` (timestamp ultimo
load completo riuscito), `invalidateLeadDataCache()`.
- **Cache-hit**: all'inizio di `loadLeadSection`, se ci sono già lead in RAM **e**
  `Date.now() - leadDataCacheAt < 90s`, si salta TUTTO il fetch da Drive e si va dritti a
  `renderLeadList()` sincrono (riusa i dati già in memoria). Niente nemmeno il flash "Caricamento…".
- **Set**: `leadDataCacheAt = Date.now()` solo a load completo riuscito (subito dopo
  `leadSectionLeads = leads`).
- **Invalidazione**: `invalidateLeadDataCache()` (mette il timestamp a 0) dopo OGNI salvataggio su
  Drive di dati lead, così la prossima apertura rilegge fresco:
  - `saveToCronologia` (CRONOLOGIA);
  - `toggleLeadChecklistStep` (LEAD_CHECKLIST + LEAD_CHECKLIST_TIMES);
  - `setLeadStatus` (LEAD_STATUS);
  - `saveLeadBindings` (LEAD_BINDINGS).
  - I save di backfill codici e della migrazione stanno **dentro** `loadLeadSection`, prima che il
    timestamp venga settato → non serve invalidarli.

Con l'invalidazione su ogni save, i 90s sono safe: la cache si butta da sola appena tocchi qualcosa.

## Cosa NON è stato toccato
- `renderLeadList()` sincrono, l'**archivio lazy** (v2.5.75), il merge lead-da-calendario, la
  `FunnelSheetSync`. Nessuna libreria introdotta. Nessuno scope OAuth toccato.

## Test eseguiti
- `node --check js/main.js` e `js/config.js`: OK.
- **Smoke test reale (Chrome headless)** su `index.html`: pagina caricata, `main.js` inizializzato
  fino in fondo, `#leadList` presente, **nessun** errore JS (SyntaxError/ReferenceError/Uncaught)
  dalle modifiche. (Il percorso "sezione Lead loggata" richiede OAuth Google → non esercitabile
  headless.)
- **Test logici mirati** della logica nuova:
  - parallelismo: 7 load concorrenti, ~33ms invece di ~210ms (≈1× invece di 7×) → PASS;
  - migrazione: parte su `LEAD_STATUS` null, **non** su `rejected` (come l'originale) → PASS;
  - cache TTL + invalidazione: hit dopo load, miss dopo invalidate → PASS.

## File toccati
- `js/main.js` — `loadLeadSection()` parallelizzata (Promise.allSettled) + cache TTL 90s +
  invalidazione in `saveToCronologia`/`toggleLeadChecklistStep`/`setLeadStatus`/`saveLeadBindings`.
- `js/config.js`, `index.html` — bump versione + cache-bust → v2.5.76.
