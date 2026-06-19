# CHANGELOG v2.5.69 — Stato conferma ancorato all'appuntamento (tutti entrano "pending")

Affina la regola del funnel su decisione di Dante: **ogni lead/appuntamento che entra parte
SEMPRE da "pending"**, e un re-booking dello stesso lead fa ripartire un funnel fresco.

## Regola (nuova)
- **Default = "pending" per tutti.** Tolto il vecchio default "no" sui lead pre-cutoff
  (v2.5.67): creava il caso "muto" (funnel verde ma mail silenziose) ed era contro-intuitivo.
- **Stato manuale ancorato all'appuntamento.** Quando imposti a mano `confermato`/`no`, la scelta
  vale **solo per quell'appuntamento** (identificato dal `createdISO` dell'evento "LEAD - Call").
- **Re-booking = funnel fresco.** Se lo stesso lead (stesso numero) ri-fissa un nuovo appuntamento
  (nuovo evento → `createdISO` diverso), lo stato torna automaticamente a **"pending"**: riparte il
  funnel di conferma per quel nuovo appuntamento. Lead nuovi e "doppioni" sono trattati uguali.

## Non-retroattività: dove vive ora
- **Non più nel front-end.** Ora la garanzia "niente mail indietro nel tempo" è **solo** nel cutoff
  lato Apps Script: un evento "LEAD - Call" **creato prima di `FUNNEL_CUTOFF_ISO`** viene saltato,
  non manda mail — anche se il foglio lo segna "pending".
- Effetto pratico: i lead vecchi possono apparire "pending" nella UI (è voluto), ma **non generano
  email** perché i loro eventi sono pre-cutoff (e comunque fuori dalla finestra di scansione).

## Implementazione (solo front-end)
- `js/main.js`:
  - `leadStatusState[leadKey]` ora è `{ status, forCreatedISO }` (prima: stringa). Forma stringa
    legacy v2.5.67 ancora letta (non-scoped) per retrocompatibilità.
  - `getLeadStatus(lead)`: scelta manuale valida solo se `forCreatedISO` == createdISO corrente;
    appuntamento cambiato o assente → "pending"; nessuna scelta → "pending".
  - `setLeadStatus`: salva `{ status, forCreatedISO: <createdISO corrente> }`.
  - Rimossi `funnelCutoffMs()` e `defaultLeadStatus()` (il front-end non usa più il cutoff).
- `js/config.js`: `FUNNEL_CUTOFF_ISO` resta (per coerenza/diagnostica), ma documentato come
  **usato solo dall'Apps Script**. Versione + cache-bust.
- **Apps Script: INVARIATO** — i file in `apps-script-funnel-notify/` restano quelli da incollare
  (mandano mail solo se `status=="pending"` **e** evento creato dopo il cutoff).

## File
- **Modificati**: `js/main.js`, `js/config.js`, `index.html` (versione + cache-bust config/main).
- **NON toccati**: Apps Script, foglio, sheet schema, scope OAuth.
