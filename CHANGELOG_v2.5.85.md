# v2.5.85 — Messaggio "Gruppo No Show": assistente dalla descrizione evento + PRE/POST-NOSHOW

**Ambito:** solo web app (vanilla JS, `js/main.js`). **Nessun Apps Script toccato, nessun redeploy.**

## Problema
Il messaggio "Gruppo No Show" mostrava come assistente **"Dante"** quando non lo
trovava, perché pescava da `#operatoreName` — che è l'elemento del **sottotitolo
header** (`"vX.Y.Z by Dante"`), non l'assistente del lead. L'assistente vero, invece,
è scritto nella **descrizione dell'evento** Calendar (riga `Setter:` / `Assistente:` /
`Operatore:`), esattamente come lo legge già l'Apps Script reminder lato server.

## Cosa cambia

### 1) Assistente dalla DESCRIZIONE dell'evento (mai più "Dante" di default)
- Nuovo helper `extractAssistenteFromDescription(description)` con la **stessa regex
  e la stessa pulizia** di `apps-script-reminder/Codice.gs > estraiSetter_`
  (coerenza web ↔ server): `/(?:setter|assistente|operatore)\s*[:\-]\s*(.+)/i`, poi
  taglio sulla prima riga / sul primo `<` (toglie l'HTML in coda al nome) e strip dei tag.
- Se l'assistente **non si trova → riga VUOTA** (Dante la inserisce a mano), **mai più
  un fallback "Dante"**.

### 2) Riga finale PRE-NOSHOW / POST-NOSHOW
- In coda al messaggio:
  - **PRE-NOSHOW** se l'istante d'invio è **antecedente** all'orario appuntamento (`t0`);
  - **POST-NOSHOW** se è uguale o **successivo**.
- Senza `t0` risolto la riga si **omette**.

### Struttura del messaggio (6 righe)
```
Nome Cognome
gg/mm hh:mm           (orario appuntamento)
+39 …                 (telefono lead)
<assistente>          (dalla descrizione evento, o riga vuota)
<Nome Google>         (primo nome di chi invia — il "Dante" giusto)
PRE-NOSHOW | POST-NOSHOW
```

### 3) Plumbing della `description`
La descrizione dell'evento ora arriva fino a `buildNoShowText` da **entrambi** i path:
- **Card lead:** `buildLeadCallIndex` aggiunge `candidate.description` →
  `findLeadT0Auto.pack` e `bestLeadSuggestion` la propagano →
  `resolveLeadT0` la ritorna in `resolution.description` per **tutti** i casi
  (`manual`/`bound`/`auto`/`suggest`/`none`) → `renderLeadChecklist` la passa a
  `buildNoShowWaHref`.
- **Form template:** `updatePreview` legge `evNoShow.description` dal
  `dataset.eventData` del lead selezionato in `#selectLead`.

Nuove firme: `buildNoShowText(lead, t0, description)` e
`buildNoShowWaHref(lead, t0, description)`.

## Non toccato
- `sendToWhatsApp` usa il testo già generato in `#anteprimaMessaggio` → nessuna modifica.
- I segnaposto **cosmetici** `{ASSISTENTE}`/`{GOOGLE_FIRST}` del template editor restano
  documentativi (non vengono risolti uno a uno).
- Nessun Apps Script, nessuno scope OAuth, nessun redeploy.

## Test
Harness Node + `vm` sul **sorgente reale** (`extractAssistenteFromDescription` +
`buildNoShowText` estratti da `js/main.js`), 5 scenari **tutti verdi**:
1. assistente nella descrizione → nome corretto;
2. assistente assente → **riga vuota**;
3. orario passato → **POST-NOSHOW**;
4. HTML in coda al nome → ripulito come server-side;
5. senza `t0` → **nessuna** riga PRE/POST.
