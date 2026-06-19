# CHANGELOG v2.5.67 — Funnel conferma a 3 stati + T0 = creazione evento + non retroattivo

Tre interventi collegati sul funnel dei lead "LEAD - Call". Risolve due problemi reali:
(1) il funnel calcolava gli stamp dall'orario **appuntamento** invece che dall'**ingresso** del
lead; (2) la conferma era un booleano e non distingueva "in attesa" da "scartato".

## 1) T0 = CREAZIONE dell'evento (ingresso reale), non l'orario appuntamento
- Gli stamp del funnel (T+2h / +4h / +6h) ora partono da **quando l'evento "LEAD - Call" è stato
  creato** in calendario (= ingresso del lead), **non** dall'orario di inizio della call.
- Front-end: già usava `event.created` per datare la riga "ingresso"; ora propaga il `createdISO`
  anche al mirror Sheet (`buildFunnelLeadRow`).
- Apps Script (`Scheduler.gs`): `processaEventoFunnel_` usa come T0, in ordine, **`createdISO` dal
  foglio → `ev.getDateCreated()` → `ev.getStartTime()`** (fallback). La finestra di scansione sui
  calendari "LEAD - Call" è stata **allargata al futuro** (`FUTURE_MS`, ~3 mesi): un lead che
  prenota una call avanti nel tempo riceve comunque il funnel calcolato dalla creazione.
- Email: la riga "Call originale (T0)" diventa **"Ingresso lead (creazione evento)"** + nuova riga
  **"Appuntamento (call)"** con l'orario di inizio.

## 2) Stato conferma a TRE valori (Confermato / Pending / No)
- Il booleano "Appuntamento confermato" è sostituito da un **controllo a 3 stati** nella card lead.
- **Solo "Pending" tiene il funnel attivo** (e fa partire le email). **"Confermato" e "No"
  congelano** il funnel (step disabilitati, niente mail).
- L'Apps Script invia l'alert a `dante.consulenze@gmail.com` **SOLO se lo stato è `pending`**.
- Filtro/contatori della sezione Lead aggiornati ai 3 stati (Tutti / Pending / Confermati / No).
- Persistenza: nuovo file Drive **`LEAD_STATUS`** (`{ "<leadKey>": "confermato"|"pending"|"no" }`).
  Mapping aggiunto in `DRIVE_FILES` (un mapping mancante = perdita dati silenziosa).
- **Migrazione**: i vecchi `LEAD_CONFIRMED:true` diventano `status:"confermato"` (una-tantum, al
  primo load loggato; il file legacy NON viene cancellato, per rollback).
- Sheet mirror: colonna `confirmed` (TRUE/FALSE) → **`status`** (confermato/pending/no), nuova
  colonna **`createdISO`**. Header: `leadKey | telefono | nome | codice | status | t0ISO |
  createdISO | updatedAt` (A:H). Lo script legge ancora il vecchio header con `confirmed` come
  fallback.

## 3) Funnel NON retroattivo (solo lead futuri)
- Il funnel/email valgono **solo per i lead creati da ora in poi**. I lead vecchi **non generano
  mai alert**.
- Nuova costante **`FUNNEL_CUTOFF_ISO`** (in `js/config.js` **e** in `Config.gs`, valore identico):
  fissata al momento del deploy = **`2026-06-19T11:52:00+02:00`**.
- Default di stato (per lead **senza** scelta manuale, calcolato al volo, **mai** persistito):
  - `createdISO` < cutoff (o assente) → **"no"** (funnel chiuso, niente mail) — i vecchi.
  - `createdISO` ≥ cutoff → **"pending"** — i nuovi.
  - una scelta manuale dell'utente **vince sempre** sul default.
- **Doppia barriera** lato Apps Script: se l'evento è stato **creato prima del cutoff** viene
  **saltato senza inviare**, anche se per errore lo stato risultasse "pending". Così un refuso nel
  foglio non può far partire una mail "indietro nel tempo".
  - Nota: se imposti **a mano** un lead pre-cutoff su "pending", la UI riattiva il funnel ma la
    **mail resta bloccata dal cutoff** (per scelta, per non spammare all'indietro).

## File
- **Modificati**: `js/config.js` (versione + `FUNNEL_CUTOFF_ISO`), `js/google-drive-storage.js`
  (`LEAD_STATUS`), `js/main.js` (modello a 3 stati, migrazione, freeze, filtro,
  `buildFunnelLeadRow` con `status`+`createdISO`, `setLeadStatus`), `js/funnel-sheet-sync.js`
  (schema A:H), `css/style.css` (controllo segmentato 3 stati), `index.html` (versione +
  cache-bust), `apps-script-funnel-notify/` (Config/FunnelStore/Notifiers/Scheduler/README).
- **NON toccati**: `apps-script-reminder/` (Twilio), scope OAuth, appDataFolder.

## Da fare a mano lato Google (3 righe)
1. **Foglio LEADS**: l'header viene **riscritto automaticamente** dal web app al primo load (vecchio
   schema `confirmed` → nuovo `status`+`createdISO`). Se vuoi, cancella le righe dati esistenti: si
   ripopolano da sole, già con `status`/`createdISO`.
2. **Apps Script**: incolla i `.gs` aggiornati e metti in `Config.gs` lo **stesso**
   `FUNNEL_CUTOFF_ISO` di `js/config.js`. Niente nuovo `setup()` se il trigger 5' è già attivo.
3. **Verifica**: lancia `test()` (dry-run) e controlla che i lead `confermato`/`no` e quelli creati
   prima del cutoff risultino **saltati**.
