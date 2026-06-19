# CHANGELOG v2.5.75 — FIX click "non clicco da nessuna parte" + Archivio lazy

## Contesto
Segnalazione: «sul massaggiatore non riesco a cliccare da nessuna parte… provo a cliccare i
flag o cose e non fa nulla» + richiesta di caricare in sezione Lead **solo i pending live**,
con confermati/no in un archivio collassato che si carica al bisogno.

## Diagnosi (test reale, niente tirare a indovinare)
Le 4 ipotesi CSS della sessione precedente (pseudo-elementi/overlay sopra `.lead-card`) sono
state **smentite** con un test headless vero (Chrome + `document.elementFromPoint` al centro di
ogni controllo: bottoni stato, checkbox funnel, WhatsApp, "cambia", summary archivio). Risultato:
**tutti raggiungibili** → quelle modifiche NON sono state applicate. La delega eventi
(`ensureLeadDelegation`), gli handler (`setLeadStatus`, `toggleLeadChecklistStep`) e tutti i
simboli referenziati sono risultati corretti.

Il difetto reale trovato è un **overlay fantasma**, non la card.

---

## TASK 1 — Click

### (1) FIX: il toast `.notification` mangiava i click [`css/style.css`]
`.notification` (l'elemento `#notifica` in `index.html`) è `position:fixed; z-index:3000` ed è
**sempre presente nel DOM** con `opacity:0` quando nascosto, **senza `pointer-events:none`**.
Restava quindi invisibile nell'angolo basso-destra e **intercettava i click di qualsiasi cosa
gli scorresse sotto** — coerente col sintomo "alcune volte non clicco".
→ Aggiunto `pointer-events: none` (un toast non si clicca mai). Il layout della card è stato
ri-testato dopo il fix: ancora tutto cliccabile.

### (2) Click Doctor — rete di sicurezza globale [`js/main.js` → `setupClickDoctor()`]
Nuova guardia agganciata in init (capture-phase su `pointerdown`). Se l'elemento più in alto nel
punto del click è un overlay `fixed/absolute` a **(quasi) tutto schermo MA invisibile**
(`opacity≈0` o `visibility:hidden`) che sta catturando i click:
- lo **neutralizza** (`pointer-events:none`);
- lo **nomina con un toast visibile** (`Sbloccato overlay fantasma: <selettore>`) — niente F12;
- lo **logga** in console (`🩺 [Click Doctor] …`).

Nessun controllo legittimo è grande + invisibile + cliccabile → **zero falsi positivi**
(verificato: un click normale non innesca il doctor). Così un eventuale overlay fantasma futuro
si auto-sblocca e si fa identificare al volo, invece di ricominciare la caccia a indovinare.

---

## TASK 2 — Archivio lazy (perf vista pending) [`js/main.js` → `renderLeadList()`]
Prima: nella vista `pending` le card dell'archivio (confermati + no) venivano **costruite subito**
con `buildLeadCardHtml` (`archiveCards` calcolato al render) → nessun risparmio.

Ora:
- al render della sezione si costruiscono **solo le card dei pending** (live);
- l'archivio nasce come `<details>` con summary + conteggi (✅ N · ✖️ N) e **body VUOTO**
  (placeholder "Apri per caricare l'archivio…"). `buildLeadCardHtml` **non** viene chiamata per
  gli archiviati a questo punto;
- alla **prima apertura** del `<details>` (listener `toggle`) si costruiscono le card archivio e
  si iniettano nel body. Flag `_archiveLoaded`: chiusure/riaperture successive **non** ricostruiscono;
- la delega click/change è su `#leadList` (che contiene il `<details>` e il suo body) → le card
  iniettate sono già coperte, **nessun nuovo bind**.

### Cosa è stato posticipato (e cosa no)
- **Posticipato**: la costruzione HTML pesante delle card archiviate (log messaggi + funnel,
  checklist, picker, risoluzione T0 per ognuna) → solo alla prima apertura dell'archivio.
- **NON posticipabile**: la *classificazione* pending/archivio (`getLeadStatus`, che per i lead
  con stato manuale chiama `resolveLeadT0`) gira su tutti i lead — è inevitabile per sapere chi è
  pending. È però leggera rispetto alla costruzione delle card.
- **Server**: nessun nuovo round-trip. I dati Drive si caricano comunque una sola volta in
  `loadLeadSection`; il lazy riguarda il *rendering*, non il fetch.

---

## Test eseguiti (headless, Chrome)
- **Layout card** (14 check): bottoni stato/checkbox/WhatsApp/cambia/summary tutti raggiungibili;
  checkbox funnel congelato correttamente bloccata; bottoni stato cliccabili anche a lead congelato. ✅
- **Click Doctor** (5 check): overlay fantasma rilevato → neutralizzato → target di nuovo
  cliccabile → toast mostrato → nessun falso positivo su click normale. ✅
- **Archivio lazy** (6 check): al render build solo pending; summary conta senza renderizzare;
  archivio inizialmente vuoto; 1ª apertura costruisce le card; nessun ri-build a riapertura. ✅
- `node --check js/main.js`: OK.

## File toccati
- `css/style.css` — `.notification { pointer-events: none }`
- `js/main.js` — `setupClickDoctor()` + chiamata in init; archivio lazy in `renderLeadList()`
- `js/config.js`, `index.html` — bump versione + cache-bust → v2.5.75
