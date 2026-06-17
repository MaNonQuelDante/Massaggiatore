# CHANGELOG v2.5.65 — Rubrica: ricerca per nome, cache multi-dispositivo, casing, verifica lead

Lavoro sul **prompt rubrica**: la logica si era persa pezzi e disallineata. Sei interventi.

## 1) 🔎 Ricerca unificata stile Google People (per NOME o per NUMERO)
- Nuovo box **"Cerca in rubrica"**: scrivi un nome (es. `nicola`) e una **tendina** mostra
  tutti i match — esattamente come su Google People. La ricerca è **accent-insensitive**:
  `nicol` trova sia *Nicola* che *Nicolò*.
- Funziona anche **per numero** (con o senza prefisso +39).
- **Clic su un risultato → apre la scheda lead** (riusa il deep-link della sezione Lead:
  `showPage('lead')` + focus/evidenziazione della card per telefono). Se il contatto è in
  rubrica ma non è tra i lead contattati, mostra un avviso onesto invece di un link rotto.
- Funzioni: `searchRubricaContacts(query)`, `renderRubricaSearchResults()`,
  `openLeadFromRubrica()`. La verifica vecchia (solo numero) resta come fallback.

## 2) 🔄 Cache contatti SEMPRE fresca e multi-dispositivo
- **Falla risolta:** la cache `SAVED_CONTACTS` vive in `localStorage` e si popolava SOLO
  premendo "Sincronizza Ora". Da un **dispositivo nuovo** era vuota → la ricerca non
  trovava nessun numero.
- Ora `autoSyncRubricaIfStale()` fa un **auto-sync silenzioso** in background se la cache è
  **vuota o più vecchia di 1 ora**, al primo load e all'evento `auth-ready` (appena c'è il
  token). Nessun lag in uso normale, nessuna notifica: parte da solo.
- `syncSavedContactsFromGoogle({ silent })` per non spammare popup durante l'auto-sync.

## 3) ✍️ Write-back su Google People (la modifica non resta solo locale)
- `saveContactToGoogle` ora salva in cache anche **nome / società / resourceName** (prima
  li perdeva, quindi la ricerca per nome non vedeva il contatto fino al sync successivo).
- Nuova `updateContactInGoogle(resourceName, {nome, cognome, società})`: aggiorna il
  contatto **su Google People** (`people.updateContact` con `etag` fresco), poi allinea la
  cache. Così se modifichi un lead la modifica finisce su Google, non sparisce al sync.

## 4) 🏷️ Salvataggio: FE / SG - Lead + "Altro…"
- Il selettore "Tipo lead" ora ha le opzioni classiche **"FE - Lead"** e **"SG - Lead"**
  più **"Altro…"**, che mostra un **campo libero** dove scrivere quello che vuoi nel campo
  *Società* di Google People (FE, SG e "società" sono la stessa cosa = `organizations.name`).

## 5) 🔠 Casing: basta titoli in MAIUSCOLO
- Helper **Title Case UNICO** `toTitleCaseNome()` (in `google-calendar.js`, esposto su
  `window`), usato ovunque si componga/salvi un nome.
- La **rinomina degli eventi su Calendar avviene in scrittura già normalizzata**:
  `DANTE DAVIDE CIAVARELLA` → **`Dante Davide Ciavarella`**. Gestisce `De Luca`, `D'Angelo`,
  `Anna-Maria` e le accentate (`Nicolò`). Unificate le 2-3 capitalizzazioni divergenti
  (`capitalizeNome` in rubrica, `cleanLeadName` in calendar, i due `newTitle`).
- ⚠️ Conseguenza voluta: la **prima volta** che tocchi un vecchio evento MAIUSCOLO, viene
  **rinominato** su Calendar in Title Case.

## 6) 🧩 RICOLLEGATA la verifica "lead non in rubrica" (funzione persa)
- `getUnsavedContacts()` e `renderContactToUpdate()` esistevano ancora ma erano **orfane**
  (da v2.5.58 `renderRubricaList` mostra solo i contatori; nessun bottone le richiamava e
  mancava l'handler dei pulsanti). **Ricollegate, non riscritte** (come deciso).
- Nuovo bottone **"Verifica lead non in rubrica"**: scansiona eventi/cronologia e mostra i
  lead i cui numeri **non sono in rubrica** (così sai se si sono salvati tutti) + quelli con
  **società da correggere**. Azioni per card: **Salva** (in Google), **Aggiorna**
  (`updateContactInGoogle`), **Ignora**. Handler delegati su `#rubricaUnsavedList`.

## File toccati
- `js/google-calendar.js` — `toTitleCaseNome` + applicato a `newTitle` (×2) e `cleanLeadName`.
- `js/rubrica.js` — ricerca, auto-sync, write-back, `updateContactInGoogle`, opzioni FE/SG/Altro,
  verifica lead non in rubrica, handler, `capitalizeNome` unificata.
- `index.html` — box ricerca + tendina, opzioni FE/SG/Altro con campo condizionale, bottone
  "Verifica lead non in rubrica" + contenitore, bump versioni e cache-bust script.
- `js/config.js` — versione/lastUpdate.
