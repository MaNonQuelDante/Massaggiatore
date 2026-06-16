# v2.5.57 — Funnel lead: se il match è incerto, il sito CHIEDE (+ aggancio/orario a mano)

## Perché
Prima, quando l'aggancio card-lead ↔ evento "LEAD - Call" era **incerto o ambiguo**
(nomi quasi uguali ma magari persone diverse), il sito sceglieva la via prudente e
mostrava `T0 n/d` senza dire nulla. Ora **te lo chiede** e puoi risolverlo in un tap.

## Cosa cambia

### 1. Proposta sui casi incerti
Quando l'automatico **non** aggancia ma c'è un candidato plausibile, nella card compare:

> ⚠️ **Forse è questo:** `Anna Verdi · 20/06 15:00` — [ È lei ✓ ] [ Non è lei ✗ ]

- **È lei** → aggancia il lead a quell'evento (salvato, vedi sotto).
- **Non è lei** → segna quella proposta come rifiutata (non te la ripropone) e apre il
  selettore per scegliere quello giusto.
- I match **certi** (telefono o nome identico) restano **automatici e silenziosi**.

### 2. Ricontrollo manuale su OGNI card
Anche sui lead agganciati in automatico c'è un link **"evento sbagliato? cambia"** che
apre il selettore. Così puoi correggere anche un aggancio automatico che non ti torna.

### 3. Selettore evento + orario a mano
Il pannello permette di:
- **scegliere da una lista** tutti gli eventi "LEAD - Call" disponibili (nome + data/ora);
- oppure, se quello giusto non c'è, **impostare il T0 a mano** (campo data+ora);
- **↺ ripristina automatico** per togliere un aggancio manuale e tornare al match auto.

### 4. Tutto ricordato (cloud)
Le scelte sono persistite su **Google Drive** (nuova chiave **`LEAD_BINDINGS`**), una
entry per lead: `{ eventId?, manualT0?, dismissed?: [...] }`. Chiesto **una volta sola**;
anche i "Non è lei" vengono ricordati. Priorità in `resolveLeadT0()`:
**orario a mano → evento agganciato → automatico → proposta → niente**. Un aggancio a un
evento poi cancellato su Calendar viene semplicemente ignorato (si ricade sull'automatico).

## Dettaglio tecnico
- `js/main.js`
  - `STORAGE_KEYS.LEAD_BINDINGS`; variabili di modulo `leadBindings`, `leadSectionLeads`,
    `leadSectionCandidates`.
  - `buildLeadCallIndex()`: i candidati ora portano anche `id` e `nameDisplay`.
  - `findLeadT0()` rinominata `findLeadT0Auto()`. Nuove: `bestLeadSuggestion()`,
    `resolveLeadT0()`, `fmtLeadEventWhen()`, `escLeadHtml()`, `renderLeadPicker()`,
    `saveLeadBindings()`, `handleLeadAction()`, `openPickerFor()`, `ensureLeadDelegation()`.
  - `loadLeadSection()` separata da **`renderLeadList()`**: il caricamento da Drive avviene
    una volta; le scelte utente ri-renderizzano **senza riscaricare**. La delega eventi è
    agganciata una sola volta al contenitore (sopravvive ai re-render). Il render **non
    scrive mai** in cloud: si salva solo su azione utente.
- `css/style.css`: stili `.lead-suggest*`, `.lead-btn*`, `.lead-change-link`,
  `.lead-checklist-tag`, `.lead-picker*`, `.lead-link-muted`.
- `index.html` / `js/config.js`: bump **2.5.57** + cache-bust `main.js`, `config.js`,
  `style.css`.

## NON toccato
- Storico messaggi, raggruppamento lead, logica Calendar (riuso di
  `extractPhoneFromEvent` / `extractNameFromEvent` / `parseNameSurname`): invariati.
- Funnel a 5 step, orari T0/+2/+4/+6, default checkbox, persistenza `LEAD_CHECKLIST`:
  invariati da v2.5.55/56.

## Test
Harness reale `vm` sull'autentico `js/main.js`: **14/14 verifiche passate** — candidati
con id+nome; auto per telefono; `manualT0` vince su tutto; aggancio `eventId`; aggancio
"stale" che ricade su auto; **ambiguità → proposta**; dismiss 1→propone l'altro; dismiss
tutti→none; near-miss su nome corto→proposta; sconosciuto→none; render del banner con
bottoni; link "cambia" + picker sempre presenti; tag "T0 n/d" e "📌 manuale".
