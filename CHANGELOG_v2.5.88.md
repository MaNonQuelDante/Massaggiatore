# CHANGELOG v2.5.88 — Funnel checklist: click robusto + colori + mirror "ultima azione"

**Data:** 2026-06-22
**Ambito:** SOLO web app (vanilla JS). File: `js/main.js`, `js/funnel-sheet-sync.js`, `css/style.css`.
**Deploy:** push → GitHub Pages. **Nessun redeploy Apps Script** per questa parte.

## FIX 1 — Funnel checklist: click che a volte non spuntava + colori

### 1a) Toggle robusto (il bug)
- Il toggle era sul **`change`** del checkbox (in `ensureLeadDelegation`): su mobile/desktop a
  volte si perdeva (micro-drag sul checkbox o race col re-render) → **la spunta non partiva**.
- Ora il toggle è gestito sul **`click` della riga `.lead-check-row`**:
  - `e.preventDefault()` blocca il toggle **nativo** di checkbox/label e gestisco io lo stato →
    **un solo cambio per click**, che si clicchi checkbox, testo o orario (copre anche lo Spazio
    da tastiera, che emette un `click`);
  - `nuovoStato = !input.checked` letto **prima** (default bloccato);
  - il bottone WhatsApp NoShow (`.lead-noshow-wa`, `<a>` fuori dalla label) viene **lasciato
    passare** (apre il link, niente spunta);
  - le righe a funnel congelato (`.lead-funnel-frozen`) restano **read-only**;
  - chiama `toggleLeadChecklistStep(leadKey, step, nuovoStato, 'manual')` come prima.
- Il vecchio listener **`change` è stato RIMOSSO** per non sovrapporsi (niente doppio-toggle).

### 1b) Colori riga (solo CSS)
- Spunta **MANUALE** (click utente) → **VERDE** `#16a34a`.
- Spunta **AUTOMATICA** (da `autoCheckFunnelStepOnSend`) → **BLU** `#2563eb`.
- (Prima: manuale=blu, auto=viola.) Cambiati `accent-color` + bordo-sinistra di `.lc-manual` /
  `.lc-auto` e i pallini della legenda `.lc-leg-manual` / `.lc-leg-auto`. **Logica JS invariata.**

## FIX 2 — Mirror "ultima azione" sul foglio (prerequisito mail)
- Nuova colonna **`lastStep`** in coda allo schema del Google Sheet "Funnel Lead":
  `leadKey | telefono | nome | codice | status | t0ISO | createdISO | updatedAt | lastStep`
  (range `A:H` → `A:I`). Aggiunta **senza spostare** le colonne esistenti (l'Apps Script legge per
  nome header).
- Valore = label leggibile dell'**ultimo step funnel spuntato** (escluso `ingresso`), priorità
  `chiamata > sollecitare > scrivere > noshow`:
  - `scrivere` → "Scrivere al lead"
  - `sollecitare` → "Sollecitare il lead"
  - `chiamata` → "Sollecitare via chiamata"
  - `noshow` → "Inviato a Gruppo NoShow"
  - nessuno oltre `ingresso` → `""` (vuoto).
- `funnel-sheet-sync.js`: `HEADER` + `lastStep`, `_funnelRowArray` la accoda, e
  `_funnelEnsureTabAndHeader` **riscrive l'intestazione** (`A1:I1`) anche sui fogli vecchi a cui
  manca `lastStep`.
- `main.js`: nuova `computeLeadLastStep` + `buildFunnelLeadRow` la include; il foglio viene
  **ri-allineato subito dopo una spunta** (`upsertLead` in coda a `toggleLeadChecklistStep`,
  riusando il lead in sezione). Se il lead non è in sezione (es. auto-spunta dalla Home) si
  riconcilia al prossimo `syncAllLeads` all'apertura della sezione Lead.
- Lato Apps Script (la mail "Ultima azione verso il lead: X") **gestito a parte**.

## Test
Harness **Node+vm sul sorgente reale** (`main.js` + `funnel-sheet-sync.js`), **23 assert verdi**:
- `computeLeadLastStep`: priorità, label, casi vuoti.
- toggle click: **un solo toggle**, `nuovoStato` corretto (check/uncheck), `preventDefault`
  chiamato, riga congelata ignorata, `.lead-noshow-wa` esclusa (niente preventDefault), listener
  `change` rimosso.
- `_funnelRowArray`: `lastStep` in coda (index 8), `A:I`, colonne esistenti intatte, default `""`.
