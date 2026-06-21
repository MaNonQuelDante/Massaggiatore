# CHANGELOG v2.5.84 — Fix salvataggio automatico rubrica (fallimenti non più silenziosi)

**Data:** 2026-06-21
**File toccato:** `js/main.js` (più versioning in `js/config.js` e `index.html`)
**Tipo:** bugfix / affidabilità — vanilla JS, nessuna dipendenza nuova

## Il caso
Romolo Cavallone (+39 328 926 1779) è stato contattato con "genera/invia messaggio"
ma **non** è finito nella rubrica Google, **senza alcun errore visibile**. Il
salvataggio automatico in rubrica esisteva già (`checkAndSaveContact`, chiamata da
`generateMessage` e `sendToWhatsApp`), ma poteva fallire in silenzio.

## Analisi reale (cosa era vero e cosa no)
Una prima analisi indicava 4 cause nel file `google-calendar.js`. Verificando il
codice **vero**, le funzioni stanno in `js/main.js`, e solo 1 delle 4 cause era reale:

| Ipotesi | Verdetto sul codice |
|---|---|
| Fire-and-forget (no `await`) | **VERO** — `checkAndSaveContact` chiamata senza `await` prima di `resetForm()`. |
| "Errori solo in console, utente non vede nulla" | **Falso** — `saveContactToGoogle` notifica già su 401/403/409/429/generico. Ma il toast è anonimo e sparisce in 3s. |
| "Normalizzazione diversa rompe la dedup" | **Falso** — `isPhoneInRubrica` usa `normalizeForComparison` (agnostico al +39) su **entrambi** i lati. |
| "Manca un retry" | **Ridondante** — `saveContactToGoogle` avvolge già la `createContact` in `retryWithBackoff` (3 tentativi, backoff esponenziale). |

L'**unica via davvero silenziosa** lato UI è lo skip per "già in rubrica" (dedup):
nessuna notifica. Se la cache `SAVED_CONTACTS` contenesse un match errato, il lead
verrebbe saltato senza un suono. Dal solo codice non è determinabile quale ramo abbia
colpito Romolo (dedup falso-positivo / token assente / errore API col toast da 3s perso
mentre si apriva WhatsApp): serviva la console di quella sessione.

## Cosa è cambiato
1. **`await` su `checkAndSaveContact`** in `generateMessage` e `sendToWhatsApp`.
   Prima il fallimento finiva in *unhandled promise rejection* (swallowed); ora è
   osservato e la notifica di esito esce **prima** di `resetForm()` (che sposta il focus).
2. **Notifica esplicita e persistente sul fallimento reale.** Se `saveContactToGoogle`
   ritorna `false` (o lancia — ora dentro `try/catch`), `checkAndSaveContact` mostra un
   toast **errore** col **nome del lead**:
   `⚠️ Nome Cognome NON salvato in rubrica — riprova dalla sezione Rubrica`, durata **8s**.
3. **`showNotification(text, type, duration=3000)`** ora accetta una durata e cancella
   il timer precedente (`clearTimeout(window.__notificaTimeout)`). Prima la notifica
   "Apertura WhatsApp..." (3s) avviava un timer che tagliava a metà **qualsiasi**
   notifica successiva.
4. **Log dedup arricchito**: lo skip per "già in rubrica" ora logga in console il match
   esatto della cache (`key` + `nome`), così un falso positivo che fa "sparire" un lead
   è diagnosticabile.

## Cosa NON è stato toccato (di proposito)
- La dedup (`normalizeForComparison`): già corretta e format-agnostica.
- `saveContactToGoogle`: già notifica sugli errori e già ritenta con `retryWithBackoff`.
  Nessun retry aggiunto (sarebbe doppio).
- `addWhatsAppLinkToEvent` (arricchimento evento dentro `saveToCronologia`): indipendente,
  lasciato intatto.

## Test
Harness Node + `vm` sul **sorgente reale** di `checkAndSaveContact` (estratto dal file,
non riscritto), 5 scenari, tutti verdi:
- no token → toast `info`;
- dedup presente → **nessuna** notifica (silenzioso, corretto: era già in rubrica);
- save fallisce → toast `error` 8s col nome "Romolo Cavallone";
- save lancia eccezione → idem, senza rompere il chiamante;
- save ok → nessuna notifica di fallimento.
