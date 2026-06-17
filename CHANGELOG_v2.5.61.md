# CHANGELOG v2.5.61 — Sezione Lead (3 interventi collegati)

Data: 2026-06-17

Tre cose collegate sulla sezione **Lead** / funnel-conferma, da fare insieme. File toccati:
`js/main.js`, `js/google-drive-storage.js`, `css/style.css`, `js/config.js`, `index.html`.

---

## 1) Flag "Appuntamento confermato" — congela il funnel

Nuova checkbox **✅ Appuntamento confermato** nell'header di ogni card lead.

- **Default = non confermato** → tutto IDENTICO a prima (funnel attivo, orari operativi).
- **Confermato** → gli automatismi successivi diventano inutili, quindi il funnel viene
  **congelato** in `renderLeadChecklist`:
  - le righe `scrivere`, `sollecitare`, `chiamata`, `noshow` restano **visibili ma
    disabilitate** (classe `lead-funnel-frozen`: opacità ridotta, checkbox `disabled` →
    non emette più `change`, orario barrato). NON nascoste.
  - la riga `ingresso` resta normale.
  - il tag accanto a "Funnel conferma" diventa **✅ Appuntamento confermato** (verde),
    che sostituisce gli altri tag di stato (manuale/agganciato/T0 n/d) e il banner di proposta.
  - il bottone WhatsApp "Gruppo NoShow" è nascosto.
- **NON toccati**: memo del giorno / conferma lettura / riscontro / riconferma — sono
  messaggi del form, non fanno parte del funnel: restano identici (orari inclusi) anche a
  lead confermato.

Persistenza: nuova chiave `LEAD_CONFIRMED` in `STORAGE_KEYS` + mapping in `DRIVE_FILES`
→ `testmess_lead_confirmed.json` (appDataFolder). `leadConfirmedState = {}` keyed su `_key`,
caricato in `loadLeadSection`, salvato SOLO su azione utente (`toggleLeadConfirmed`), mai nel
render. Agganciato alla delega eventi esistente (`ensureLeadDelegation`).

## 2) Filtro + contatore in cima alla sezione Lead

Nuova barra (`#leadFilterBar`, popolata da `renderLeadFilterBar`) sopra la lista:

- conteggio live **🟡 X non confermati · ✅ Y confermati** (da `leadConfirmedState` sui lead correnti);
- tre filtri cliccabili **Tutti / Non confermati / Confermati**. Stato in memoria
  (`leadFilterMode`, default `Tutti`), applicato in `renderLeadList` filtrando
  `leadSectionLeads` PRIMA di generare l'HTML. **NON persistito** su Drive.

## 3) Le spunte del funnel popolano il log della card (timestamp congelato)

Prima il log della card (`.lead-azioni`) mostrava SOLO i messaggi del form (`lead.messaggi`).
Ora il log unisce **messaggi del form + spunte del funnel**, ordinati cronologicamente:

- ogni step funnel **spuntato** genera una riga-azione (stesso layout `.lead-azione`, badge
  dedicato viola `lead-badge-funnel` per distinguerla dai messaggi). Step decaselionato → la
  riga sparisce.
- **Timestamp CONGELATO**: registrato la PRIMA volta che lo step viene spuntato
  (`firstCheckedAt`) e mai più cambiato. Decaselio + ri-spunto → riusa l'originale, **mai
  `Date.now()`**. Il timestamp resta salvato anche quando lo step torna a `false`.
- La riga **"Ingresso lead"** (spuntata di default, senza `firstCheckedAt`) usa **T0**
  (orario dell'evento "LEAD - Call" agganciato); fallback al primo messaggio del lead.
- Spunte antecedenti a questa feature (true ma senza orario registrato): riga mostrata con
  marcatore onesto "orario non registrato" (niente timestamp inventato).

## Persistenza / migrazione (scelta: file affiancato, ZERO migrazione)

`leadChecklistState` **NON cambia forma** (resta `{ "<leadKey>": { "<step>": bool } }`):
tutto il codice read/write esistente resta intatto, nessun rischio di perdere le spunte già
salvate su Drive. I timestamp vivono in un **nuovo file affiancato** che parte vuoto:

- `LEAD_CHECKLIST_TIMES` → `testmess_lead_checklist_times.json`
  (`{ "<leadKey>": { "<step>": "ISO" } }`).

Entrambe le nuove chiavi (`LEAD_CONFIRMED`, `LEAD_CHECKLIST_TIMES`) sono state aggiunte a
`DRIVE_FILES`: senza mapping `save/load` fallirebbero in silenzio ("Key non valida") e il dato
andrebbe perso al reload — stesso bug già fixato in v2.5.59.
