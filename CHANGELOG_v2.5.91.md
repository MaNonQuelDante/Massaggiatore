# CHANGELOG v2.5.91 — Nuovo servizio "Alessandro Lazzari" + default

**Data:** 2026-06-29
**Tipo:** solo web app (vanilla JS) · nessun Apps Script toccato · nessun redeploy
**File toccati:** `index.html`, `js/google-calendar.js`, `js/rubrica.js`, `js/main.js`, `js/config.js`

---

## Cosa cambia

### 1) Servizio "Alessandro Lazzari" (nuovo + DEFAULT)
- Aggiunta la terza opzione `Alessandro Lazzari` al selettore **Servizio** (`#servizio`) in `index.html`.
- È ora il **default** (prima opzione, `selected`). Prima il default era *Finanza Efficace*.
- Restano disponibili **Finanza Efficace** e **Stock Gain**.

### 2) Primo messaggio personalizzato "sono Dante di Alessandro Lazzari"
- Il template **Primo Messaggio** usa già il segnaposto `{SERVIZIO}`:
  `{BB} {NN}, sono {OPERATORE} di {SERVIZIO}. …`
- Quindi con servizio = *Alessandro Lazzari* il messaggio diventa **automaticamente**
  `…sono Dante di Alessandro Lazzari…`, personalizzato esattamente come Stock Gain / Finanza Efficace.
- **Nessun template modificato** (il `MASTER_MESSAGE` statico in `templates.js`, feature a parte, resta invariato).

### 3) Società "AL - Lead" per la rubrica (nuovo + DEFAULT)
- Nuova società **`AL - Lead`** per il salvataggio in rubrica.
- Default sia nel selettore **Società** del form messaggio (`#societaSelect`) sia nel selettore
  **Tipo lead** del form "Aggiungi numero" (`#rubricaAddTipo`, `value="AL"`).
- `societaFromTipoLead()` (`js/rubrica.js`) mappa ora *Alessandro Lazzari* / `AL` → **`AL - Lead`**:
  controllo **dopo** `ALTRO` (che contiene "AL") e **prima** di FE/SG; match su `ALESSANDRO`/`LAZZARI`
  o codice esatto `AL`. Il **fallback storico** passa da `SG - Lead` a **`AL - Lead`**.
- Allineato il fallback difensivo di `getSocietaValue()` (`js/main.js`) → `AL - Lead`.

### 4) Calendario: parsing servizio + default
- `extractServiceFromEvent()` (`js/google-calendar.js`, funzione condivisa usata anche da
  `rubrica.js` per i lead) riconosce ora **Alessandro Lazzari**:
  - dal pattern `SERVIZIO:` nella **description** (keyword `alessandro`/`lazzari` o codice esatto `al`);
  - dal **nome calendario** (`alessandro` / `lazzari` / `al -` / `al lead`).
- **Default** quando l'evento non specifica il servizio e il calendario non è riconosciuto:
  ora **Alessandro Lazzari / AL - Lead** (prima *Finanza Efficace / FE - Lead*).
- I rami **Stock Gain** e **Finanza Efficace** restano invariati.

---

## Cosa NON è stato toccato
- Scope/Client ID OAuth, redirect URI.
- Apps Script (funnel-notify, reminder) → nessun redeploy necessario.
- CSS, `MASTER_MESSAGE`, logica funnel/lead/Drive/Sheets.

---

## Cache-bust aggiornati in `index.html`
`config.js`, `google-calendar.js`, `rubrica.js`, `main.js` → `?v=2.5.91`.
