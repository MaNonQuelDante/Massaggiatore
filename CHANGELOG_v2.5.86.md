# CHANGELOG v2.5.86 — Funnel: colore spunte manuali vs automatiche

**Data:** 2026-06-22
**Ambito:** SOLO web app (vanilla JS). File toccati: `js/main.js`, `css/style.css`, `js/config.js`, `index.html`.
**Apps Script:** nessuno toccato, **nessun redeploy** server.

## Obiettivo (Punto 3)
Nel funnel del lead, distinguere **VISIVAMENTE** gli step spuntati **a mano dall'utente** da
quelli spuntati **in automatico dal programma** (`autoCheckFunnelStepOnSend`, all'invio messaggio).

## Cosa è cambiato

### 1. Storage parallelo `LEAD_CHECKLIST_BY`
- Nuova chiave `STORAGE_KEYS.LEAD_CHECKLIST_BY = 'LEAD_CHECKLIST_BY'`, gemella di
  `LEAD_CHECKLIST_TIMES`. Forma: `{ "<leadKey>": { "<step>": "auto" | "manual" } }`.
- Nuova variabile `leadChecklistBy`, caricata **ovunque** si carica `leadChecklistTimes`:
  - batch parallelo di `loadLeadSection` (aggiunta come **indice 7** in `KEYS` + parsing);
  - reset del batch (`leadChecklistBy = {}`);
  - rilettura difensiva in `autoCheckFunnelStepOnSend` **prima** dell'auto-spunta, così un
    save partito dalla Home (sezione Lead mai aperta) non azzera gli altri lead.

### 2. Origine **congelata** alla 1ª spunta
- `toggleLeadChecklistStep(leadKey, step, checked, source='manual')` — 4° parametro:
  `'manual'` (default, click utente) / `'auto'` (auto-spunta).
- L'origine si scrive **solo la prima volta** che lo step diventa `true` e **non si
  sovrascrive/cancella mai** — stessa identica disciplina del timestamp `firstCheckedAt`.
  Al ri-spunto, anche con `source` diversa, resta l'originale.
- Salvata su Drive **solo se cambiata** (`byChanged`), accanto ai times.

### 3. Render — classi `lc-auto` / `lc-manual` + legenda
- `renderLeadChecklist` legge `leadChecklistBy[leadKey][step]` e aggiunge alla riga
  `.lead-check-row`:
  - `lc-auto` se origine `"auto"`;
  - `lc-manual` se origine `"manual"` **oppure assente** (spunta legacy pre-feature →
    **fallback manuale**, così i vecchi spunti non cambiano aspetto a sorpresa).
- La classe convive con `.done` e `.lead-funnel-frozen` (read-only intatto).
- Mini-legenda sotto il titolo "Funnel conferma" (🟣 viola = automatico, 🔵 blu = manuale).
- Il change handler dei click utente passa `'manual'`; `autoCheckFunnelStepOnSend` passa `'auto'`.

### 4. CSS (`css/style.css`)
- `.lead-check-row.done.lc-auto` e `.lead-check-row.done.lc-manual`: `accent-color` della
  checkbox + **bordo-sinistra** colorati e distinti (auto = viola/indaco `#7c3aed`,
  manual = blu `#2563eb`).
- Stile `.lead-check-legend` (pallini colorati).
- **NON** toccati lo sfondo verde `.done` né lo stato congelato `.lead-funnel-frozen`.

## Retrocompatibilità
I lead spuntati **prima** di questa feature non hanno entry in `leadChecklistBy` → trattati
come `manual` (blu), nessun cambio d'aspetto a sorpresa.

## Test
Harness **Node+vm sul sorgente reale** (`js/main.js`), 14 assert tutti verdi:
- **A** `toggleLeadChecklistStep`: freeze origine manual/auto, no-overwrite al ri-spunto,
  save gating (`byChanged`), default param `'manual'`, coerenza col timestamp.
- **B** `renderLeadChecklist`: classi `lc-auto`/`lc-manual`, fallback legacy → `lc-manual`,
  step non spuntato → nessuna classe origine, `.done` preservato, mini-legenda presente.
