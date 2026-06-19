# CHANGELOG v2.5.73 — FIX orario partenza funnel + vista pending/archivio

Data: 2026-06-19
File toccati: `js/main.js`, `css/style.css` (+ version bump in `js/config.js` e `index.html`).
Solo app web — Apps Script invariato.

---

## FIX 1 — Bug orario di partenza del funnel (CRITICO)

**Sintomo:** gli orari degli step del funnel mostrati in scheda (Scrivere +2h,
Sollecitare +4h, Chiamata +6h) erano sempre "tondi" (es. 19:00 → 21:00 → 23:00).

**Causa:** in `renderLeadChecklist` gli orari erano calcolati da `resolution.t0`,
cioè l'**orario dell'APPUNTAMENTO** (start dell'evento "LEAD - Call" su Calendar),
che è quasi sempre un orario tondo.

**Fix:** la base degli orari del funnel è ora lo **STAMP DI CREAZIONE dell'evento**
su Google Calendar (`resolution.createdAt` = `event.created`), cioè il momento reale
in cui il lead è entrato — che non è mai tondo.

- Nuova variabile `funnelBase = resolution.createdAt` in `renderLeadChecklist`,
  passata a `leadStepTime` al posto di `t0`.
- Lo step "Ingresso lead" (offset 0h) mostra l'ora di **creazione** dell'evento.
- Per i lead `manual`/`none` (nessun evento → `createdAt` null) gli orari step
  diventano `—`: corretto, senza evento non c'è un T0 reale da cui partire.
- `t0` (orario appuntamento) resta usato SOLO per il badge `· 📅` accanto al nome
  e per il messaggio WhatsApp "Gruppo NoShow" — lì è giusto così.
- Allineato anche il fallback di ordinamento del log (spunte legacy senza orario
  registrato) alla stessa base `createdAt`.
- Commenti aggiornati in `LEAD_CHECKLIST_STEPS` e `leadStepTime`.

> Nota: il fix v2.5.67 ("T0 = creazione evento") aveva toccato solo l'**export**
> `createdISO` verso l'Apps Script, non gli orari mostrati in scheda → da qui
> l'incoerenza (il log usava già `createdAt` per l'ingresso, la checklist no).

## FIX 2 — Vista di default = solo PENDING; confermati/no in archivio collassato

**Prima:** la sezione Lead partiva con filtro `all` → tutte le card mischiate.

**Ora:** la vista di default mostra **solo i lead pending** in chiaro. Confermati e
"no" finiscono in un blocco **`<details>` "Archivio"** collassato (chiuso) sotto la
lista dei pending.

- Default `leadFilterMode`: `'all'` → `'pending'`.
- I filtri espliciti della barra (Tutti / Pending / Confermati / No) restano
  funzionanti: solo `pending` mostra l'archivio collassabile; gli altri sono liste
  piatte come prima.
- HTML della singola card estratto in `buildLeadCardHtml(lead, leadStatus)`, riusato
  sia per i pending sia per l'archivio dentro `<details>` (niente duplicazione).
  Le label `LEAD_TIPO_LABELS`/`leadTipoLabel` e `LEAD_FUNNEL_LOG_LABELS` spostate a
  livello di modulo.
- Lo stato di apertura del `<details>` **non** è persistito (solo in memoria,
  default chiuso).
- CSS: nuovo blocco sobrio `.lead-archive` / `.lead-archive-summary` /
  `.lead-archive-body` in `css/style.css`, coerente con la palette grigia esistente.
