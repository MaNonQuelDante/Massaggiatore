# CHANGELOG v2.5.80 — Meet automatico a "genera messaggio" + pulizia Acuity + Riavvia funnel

Data: 2026-06-20

Tre interventi, tutti verificati col grep prima di modificare e testati con harness Node+vm
sul **vero** `js/google-calendar.js` (nessun login Google reale necessario per la logica).

---

## FIX 1 — Bottone "🔄 Riavvia funnel" sulla card lead
**Problema reale:** lo stato lead (Confermato/Pending/No) è ancorato a `forCreatedISO =
event.created`. **Spostare** un evento esistente NON cambia `event.created` → `getLeadStatus`
resta sullo stato manuale e il funnel resta congelato. Caso reale: "Helmuth Valersi" spostato a
settimana prossima doveva tornare *pending*, invece restava *confermato* e spariva dalla vista
pending.

**Soluzione** (`js/main.js`):
- Nuova `resetLeadFunnel(leadKey)` = wrapper di `setLeadStatus(leadKey, 'pending')`: ricalcola
  `forCreatedISO` con `getLeadCreatedISO` sull'appuntamento corrente, salva su
  `STORAGE_KEYS.LEAD_STATUS`, re-render, sync foglio. **NON tocca** lo storico checklist
  (`leadChecklistState` / `leadChecklistTimes`, storage SEPARATO): si resetta SOLO lo stato
  conferma, i `firstCheckedAt` congelati restano intatti.
- Bottone "🔄 Riavvia funnel" in `buildLeadCardHtml`, visibile **solo** quando
  `leadStatus !== 'pending'`, accanto ai 3 bottoni di stato.
- Click agganciato nello stesso handler delegato dei bottoni di stato (attributo
  `data-lead-funnel-reset`, distinto da `data-lead-action` per non passare da `handleLeadAction`).
- CSS (`css/style.css`): `.lead-status-control` ora `flex-wrap: wrap`; `.lead-funnel-restart` va a
  capo su riga propria, neutro/tratteggiato, hover blu.

## FIX 2 — Creazione Meet automatica a "genera/invia messaggio" + rimozione bottoni Meet UI
**Obiettivo:** a "genera/invia messaggio", oltre a rename titolo + righe WhatsApp/📞 Chiama/📂 Scheda
lead, l'app crea **automaticamente** la conferenza Google Meet se non esiste già e include la riga
🎥 Google Meet.

**Soluzione** (`js/google-calendar.js` + `index.html`):
- Nuovo helper riusabile `ensureMeetOnEvent(eventId, calendarId)`: `events.patch` con
  `conferenceDataVersion: 1` e `conferenceData.createRequest` (`requestId` univoco,
  `conferenceSolutionKey.type: 'hangoutsMeet'`), ritorna il link Meet. Google genera il link in modo
  async → se al primo giro è vuoto fa **un solo** retry con `events.get` dopo un breve delay; se
  ancora vuoto ritorna `''` e il flusso prosegue **senza** bloccare titolo/WhatsApp/scheda.
- Usato in `addWhatsAppLinkToEvent`: se `extractMeetLink(event.result)` è vuoto → `ensureMeetOnEvent`,
  poi la riga 🎥 entra nel blocco. (Niente duplicazione: la creazione conferenza vive solo nell'helper.)
- **Rimossi i 3 bottoni Meet UI** sotto la tendina lead (Apri Google Meet / Copia link Meet /
  + Aggiungi Meet): tolto `#googleMeetContainer` da `index.html`, tolto il codice che lo popolava in
  `fillFormFromEvent`, rimossa la funzione orfana `addMeetToEventFromForm` + il suo export.
- **Intatti**: `extractMeetLink`, `copyMeetLink`, `prependMeetLinkToEvent`, `addMeetToEvent` e i
  bottoni Meet sulle card calendario (lista eventi Home).

## FIX 3 — Pulizia descrizione: rimozione blocco Acuity da "Change Appointment" in poi
Acuity Scheduling appende a fine descrizione:
`Change Appointment: <url> … Please use Acuity Scheduling … (created by Acuity Scheduling) AcuityID=…`

**Soluzione** (`js/google-calendar.js`, in `addWhatsAppLinkToEvent`):
- Appena letta la descrizione: `replace(/\s*Change Appointment:[\s\S]*$/i, '').trim()` → taglia tutto
  da "Change Appointment" (case-insensitive) a fine stringa, **prima** che la descrizione venga
  riusata nei rami. Idempotente per costruzione.
- Ramo extra `hadAcuityBlock`: se non c'è nessuna riga nuova da aggiungere ma c'era il blocco Acuity,
  ri-salvo comunque la descrizione ripulita → così sparisce anche dagli eventi **già completi** di
  righe (WhatsApp/scheda/Meet), che altrimenti non verrebbero mai ri-patchati.

---

## Test
- `node --check` su `main.js` e `google-calendar.js` → OK.
- Test regex Acuity (16 casi): esempio reale del prompt, idempotenza, no-acuity, solo-acuity,
  case-insensitive, vuoto/null, whitespace → 16/16.
- Harness Node+vm sul vero `google-calendar.js`, `addWhatsAppLinkToEvent` (15 assert):
  - **A** evento senza Meet + Acuity → Meet creato (createRequest, conferenceDataVersion 1, link dal
    retry async), tutte le righe presenti, Acuity rimosso, titolo Title Case.
  - **B** evento con Meet già presente → nessuna createRequest, riuso del Meet esistente.
  - **C** evento già completo + Acuity → nessuna creazione Meet, solo descrizione ri-salvata per
    togliere Acuity, nessun duplicato di riga.
- Grep finali: `googleMeetContainer` → 0 (solo commenti), `addMeetToEventFromForm` → 0,
  `addMeetBtnForm` → 0; `extractMeetLink`/`copyMeetLink` ancora referenziati.

## Nota operativa
La creazione Meet a "genera messaggio" avviene **sempre** se manca (come richiesto), a prescindere
dalla modalità "Tipo di call: WhatsApp/Link". Se in futuro si vuole gestire il Meet solo per le call
"Link", è un intervento separato.
