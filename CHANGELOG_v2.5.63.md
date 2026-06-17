# CHANGELOG v2.5.63 — Sezione Lead: fix date funnel (ingresso = creazione evento, appuntamento accanto al nome)

Data: 2026-06-17

File toccati: `js/main.js`, `js/config.js`, `index.html`.

---

## Il problema

Nella card lead la riga **"📥 Ingresso lead"** del log usava `resolution.t0`, cioè
l'orario di **INIZIO** dell'evento "LEAD - Call" (= orario dell'**appuntamento**). Sbagliato:
l'ingresso del lead non è l'orario dell'appuntamento ma **quando l'appuntamento viene fissato**,
cioè lo **stamp di creazione** dell'evento (quando Google Calendar rileva il nuovo evento nel
calendario "LEAD - Call"). Da qui le incongruenze viste (es. "confermato il 16, entrato il 18":
il 18 era l'orario appuntamento, non l'ingresso).

## Cosa cambia

1. **"📥 Ingresso lead"** nel log ora mostra lo **stamp di creazione** dell'evento
   (`event.created`, persistito da v2.5.58 = quando Calendar ha rilevato il nuovo evento).
   Fallback al primo messaggio del lead se il `created` manca.
2. Il **giorno + ora dell'appuntamento** (t0) è stato spostato **accanto al nome** nell'header
   della card: `Nome Cognome · 📅 gg/mm hh:mm`. Se non c'è un t0, non viene mostrato nulla.

## Dettagli implementazione (`js/main.js`)

- **`buildLeadCallIndex()`** — i `candidates` ora portano anche `created` (da `event.created`,
  parsato a `Date`; `null` se assente o invalido).
- **`findLeadT0Auto()`** — prima tornava solo la `Date` di t0; ora restituisce
  `{ t0, created }` del candidato vincente (a parità vince ancora il T0 più recente).
  Unico chiamante: `resolveLeadT0`.
- **`bestLeadSuggestion()`** — il risultato include ora anche `created` (serve al caso `suggest`).
- **`resolveLeadT0()`** — ritorna in più il campo **`createdAt`**:
  - `bound` → `created` dell'evento agganciato;
  - `auto` → `created` del candidato del match automatico;
  - `suggest` → `created` del candidato proposto;
  - `manual` e `none` → `null`.
  Retrocompatibile: `t0` e `suggestion` restano invariati, nessun altro punto cambia.
- **Render card** — accanto a `<strong>${nomeCompleto}</strong>` un `<span>` piccolo/grigio con
  `📅 ${fmtLeadEventWhen(resolution.t0)}` (solo se t0 esiste).
- **Riga "ingresso" del log** — il fallback (quando non c'è un `firstCheckedAt` registrato) passa
  da `resolution.t0` a `resolution.createdAt`. Il resto della logica funnel è invariato.

## Nota

Nessuna migrazione dati: si legge un campo (`created`) già persistito negli eventi cache da
v2.5.58. Gli orari **congelati** delle spunte (firstCheckedAt) restano la fonte primaria quando
presenti; il `createdAt` è solo il nuovo fallback dell'ingresso di default.
