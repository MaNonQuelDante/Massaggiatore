# CHANGELOG v2.5.58 — Salvataggio automatico contatti + campo `created` Calendar

Data: 2026-06-16

Due task richiesti da Dante. Sotto: cosa è cambiato, dove, e il **report Task 2**.

---

## TASK 1 — Salvataggio automatico del contatto all'invio del messaggio

### Comportamento nuovo
- Quando invii un messaggio (Genera **o** WhatsApp), se il numero **NON** è già in
  rubrica, il contatto viene salvato **direttamente in Google Contacts**, senza più
  passare dalla lista "contatti da salvare".
- La dedup usa la cache `SAVED_CONTACTS` con la **stessa normalizzazione** di
  `getUnsavedContacts` (`normalizeForComparison`, agnostico al prefisso `+39`).
- `organizations.name` (la "Società" della rubrica Google) viene popolato con
  **"FE - Lead"** o **"SG - Lead"**: usa il valore Società del form se presente,
  altrimenti lo deriva dal Servizio (Finanza Efficace → `FE - Lead`, Stock Gain → `SG - Lead`).
- Se Google **non** è connesso: notifica morbida, nessun crash, contatto non perso
  (senza login nemmeno la cronologia si salva — lo storage è 100% cloud — quindi è
  coerente: rifai login e lo aggiungi dal form).

### 🐛 BUG TROVATO E CORRETTO
`checkAndSaveContact` (in `main.js`) passava a `saveContactToGoogle` le chiavi
**sbagliate** (`firstName/lastName/phone/company`) mentre la funzione attiva in
`rubrica.js` legge `nome/cognome/telefono/societa` e ritorna un **booleano** (non un
oggetto `{success, skipped}`). Risultato: il salvataggio automatico **non aveva mai
funzionato davvero** — il numero risultava "non valido" e finiva tutto nella lista
manuale. Ora le due funzioni sono allineate.

### ⚠️ Cambio di comportamento (segnalato)
Rimosso il gate `shouldSaveContact()` (v2.5.48), che salvava **solo** il primo
messaggio E solo se il lead veniva dal calendario. Ora il salvataggio è automatico ad
**ogni** invio quando il numero non è già in rubrica (è la dedup su `SAVED_CONTACTS` a
decidere). La funzione `shouldSaveContact()` è **mantenuta** ma marcata DEPRECATA.

### UI Rubrica
- **Rimossa** la lista "contatti da salvare" (con i ✓): non serve più.
- Nuovo **form "Aggiungi numero"**: Nome, Cognome, Numero, selettore **FE/SG**, Società
  (libera; se vuota usa il valore derivato da FE/SG). Validazione numero con
  `formatPhoneForGoogle` esistente.
- Nuovo box **"Verifica se un numero è in rubrica"** (usa `isPhoneInRubrica`).
- Rimosso il date-range picker (serviva solo alla vecchia scansione; le funzioni JS
  collegate restano e fanno no-op se il DOM non c'è).
- Il pannello `rubricaList` ora mostra solo lo **stato** (n. contatti + ultimo sync).

### File toccati (Task 1)
- `js/rubrica.js`: nuovo `isPhoneInRubrica()`, `societaFromTipoLead()`,
  `handleRubricaAddSubmit()`, `verifyNumberInRubrica()`; `initRubrica` aggancia form e
  verifica; `renderRubricaList` riscritta (pannello di verifica). Nuovi export.
- `js/main.js`: `checkAndSaveContact` riscritta (fix chiavi + dedup + org-name);
  i due punti d'invio chiamano sempre `checkAndSaveContact(...servizio)` senza gate.
- `index.html`: sezione Rubrica (form + verifica), date-picker rimosso.

---

## TASK 2 — REPORT: campo `created` di Google Calendar

**Domanda: il campo `created` viene letto? Viene salvato? Dove? C'era un bug?**

- **Letto?** ✅ SÌ. La chiamata `events.list` (in `syncCalendar`, `google-calendar.js`)
  **non** usa un `fields` mask, quindi l'API restituisce l'evento **completo**, incluso
  `created` (timestamp ISO 8601 di creazione = quando l'evento è stato creato nel
  calendario Google, ≈ ora di prenotazione lato Acuity, sync server-side). Quindi
  `event.created` era già disponibile sull'oggetto grezzo.
- **Salvato?** ❌ **NO — questo era il bug.** Nel `.map()` che costruiva `eventsData`
  prima di salvare in `localStorage` (`CALENDAR_EVENTS`), venivano copiati solo
  `id, summary, description, start, end, attendees, location, calendarName, calendarId`.
  **`created` veniva scartato** → perso ovunque a valle, incluso il
  `dataset.eventData` (JSON dell'evento) attaccato all'`<option>` del lead.
- **Dove era il bug:** `syncCalendar`, il `filteredEvents.map(...)` (intorno a riga 274).

### Correzione
- Aggiunti `created` e `updated` all'oggetto persistito in `CALENDAR_EVENTS` →
  ora `created` è disponibile dappertutto (cache + `eventData` del lead).
- Propagato `created` nel record del **lead contattato**: nuovo campo `eventCreated`
  in `markLeadAsContacted` (passato da `markLeadAsContactedFromCalendar` in `main.js`).
  Così l'ora di creazione resta legata al lead anche su Drive.
- Mostrato **"Creato: gg/mm/aaaa hh:mm"** nella card della vista Calendario
  (nuovo helper `formatEventCreated`).
- I flussi Meet che riscrivono l'evento in cache fanno un **merge** dei soli campi
  Meet, quindi **non** sovrascrivono `created`.

> Nota (concordata con Dante): per ora il `created` di Google basta — la latenza di
> sync Acuity→Google è server-side, max qualche secondo. Se in futuro servisse l'orario
> di prenotazione esatto al 100% si potrà agganciare `datetimeCreated` dell'API Acuity.

### File toccati (Task 2)
- `js/google-calendar.js`: `created`/`updated` in `eventsData`; `eventCreated` in
  `markLeadAsContacted`; helper `formatEventCreated`; "Creato:" nella card calendario.
- `js/main.js`: passa `eventData.created` a `markLeadAsContacted`.

---

## Test eseguiti
- `node --check` su `config.js`, `main.js`, `rubrica.js`, `google-calendar.js` → OK.
- Harness Node+`vm` che carica i **veri** `rubrica.js` e `google-calendar.js`:
  16/16 test verdi su `isPhoneInRubrica` (dedup con/senza `+39`, `00`, cache vuota),
  `societaFromTipoLead`, `normalizePhone/normalizeForComparison`, e `formatEventCreated`
  (ISO → "10/06/2026 16:23", null/invalid → ""). Asserzioni sorgente: la cache eventi
  persiste `created`, il record lead salva `eventCreated`.
- Smoke statico: server locale, `index.html` e i tre JS bumpati rispondono 200,
  versione `v2.5.58` visibile nell'HTML servito.
- I percorsi People/Calendar API non sono testabili senza login Google reale
  (verifica finale sul link live di GitHub Pages, come da prassi).
