# CHANGELOG v2.5.64 — Deep-link scheda lead da Google Calendar + codice ID lead (cloud)

**Versione:** v2.5.64 by Dante
**Data:** 2026-06-17

## Obiettivo
Mentre spulci Google Calendar e vedi un evento "LEAD - Call", oltre ai link
**📱 WhatsApp** e **📞 Chiama** ora c'è anche **📂 Scheda lead** — un URL che,
aperto da qualsiasi device, ti porta **dritto sulla scheda di quel lead**
nell'app (già loggata), evidenziandola. Così capisci al volo a che punto del
funnel sei con lui senza cercarlo a mano.

## Come funziona (architettura)
**Un solo identificatore: il codice.** Niente telefono negli URL.

1. **Codice ID lead** alfanumerico stabile `L0001, L0002…` (`formatLeadCode`).
   - Assegnato **alla nascita del lead** in `markLeadAsContacted` (primo contatto)
     e salvato in cloud, oppure in **backfill** al primo caricamento della sezione
     Lead per i lead già esistenti (ordine deterministico = primo messaggio
     crescente).
   - **Mai riusato/cambiato**: una volta che una `_key` ha un codice, resta quello.
2. **URL `?id=Lxxxx`** → all'avvio l'app legge il parametro, apre la sezione Lead,
   trova la card con quel codice, ci scrolla sopra e la evidenzia (glow 2.5s).
   Funziona **a prescindere dall'ordine/numero dei lead**.
3. **Auth-aware**: se apri il link da un device non loggato, atterri sul login e
   appena l'auth è pronta (evento `auth-ready`) il focus parte da solo. Il
   parametro `?id=` **non viene consumato finché il focus non riesce**, quindi
   dopo il login ti porta comunque alla scheda.

## File modificati
- **`js/google-drive-storage.js`** — `DRIVE_FILES`: aggiunte `LEAD_CODES`
  (`testmess_lead_codes.json`, mappa `_key→codice`) e `LEAD_CODE_COUNTER`
  (`testmess_lead_code_counter.json`, `{ next: <ultimo intero assegnato> }`).
  Obbligatorio mapparle qui, altrimenti save/load falliscono in silenzio
  ("Key non valida") — stesso bug noto di v2.5.59.
- **`js/main.js`**
  - `STORAGE_KEYS`: aggiunte `LEAD_CODES` / `LEAD_CODE_COUNTER`.
  - `leadIdentityKey(telefono, nome, cognome)` — **chiave identità lead
    centralizzata** (`tel:<cifre>` o `nome:<nome|cognome>`), esposta su `window`
    e usata SIA dalla sezione Lead SIA da Calendar. È la stessa logica storica del
    raggruppamento cronologia: garantisce che il codice creato lato Calendar si
    ritrovi sulla card.
  - `formatLeadCode(n)` su `window`.
  - `loadLeadSection`: carica `leadCodes`/`leadCodeCounter` da Drive + backfill
    deterministico dei lead storici senza codice (salva mappa+counter una volta sola
    se cambia qualcosa).
  - `renderLeadList`: ogni card espone `lead._code`, mostra un **badge** col codice
    accanto al nome e aggiunge `id="lead-card-…"` + `data-lead-code="Lxxxx"`.
  - `focusLeadCard(code)` + `showLeadToast(msg)` + **router deep-link** in
    `DOMContentLoaded` (legge `?id=`, attende `auth-ready` se serve, ritenta finché
    trova la card).
- **`js/google-auth.js`** — emette `window.isAuthReady = true` +
  `CustomEvent('auth-ready')` quando il token è valido e agganciato a gapi
  (in `handleAuthResponse` e in `useRestoredToken`, sia login fresco sia ripristino).
- **`js/google-calendar.js`**
  - `markLeadAsContacted`: assegna/recupera il codice ID alla nascita (cloud) e lo
    passa a `addWhatsAppLinkToEvent`.
  - `addWhatsAppLinkToEvent(…, leadCode)`: inietta la riga
    `📂 Scheda lead: <origin><pathname>?id=Lxxxx`. **Idempotente**: gli eventi vecchi
    (già con `wa.me/` ma senza `?id=`) ricevono comunque la riga scheda. Se il codice
    manca, **nessuna riga** (niente link rotti).
  - `ensureEventTitleCorrect`: stesso trattamento (riga scheda) usando la mappa
    codici **in memoria** (read-only, nessuna creazione qui).
- **`css/style.css`** — `.lead-code-badge`, `.lead-card-highlight` (+ `@keyframes
  leadCardGlow`), `.lead-toast`.
- **`index.html` / `js/config.js`** — bump **2.5.64** + cache-bust di
  `style.css`, `config.js`, `google-auth.js`, `google-drive-storage.js`,
  `google-calendar.js`, `main.js`.

## Note / limiti noti
- **Concorrenza counter**: l'assegnazione del codice è load→assegna→save, non
  atomica al 100%. Con più device che vedono lo *stesso* lead nuovo nello stesso
  istante potrebbero generarsi due numeri; con un solo operatore non capita quasi
  mai e i codici già assegnati non si rompono.
- **Origin reale**: il link usa `window.location.origin + pathname`, quindi
  funziona sul dominio reale (`manonqueldante.github.io/Massaggiatore/`) senza
  hardcodare nulla.
- Tutto lo stato resta in **cloud** (appDataFolder). Nessun nuovo `localStorage`.
