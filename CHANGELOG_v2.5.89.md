# CHANGELOG v2.5.89 — Funnel Notify: 4 fix alla mail (telefono, firma, appuntamento, ultima azione)

**Data:** 2026-06-22
**Ambito:** SOLO `apps-script-funnel-notify/` (Google Apps Script, browser chiuso su trigger).
**La web app NON cambia** (bump versione + cache-bust di `config.js` a parte).
`apps-script-reminder/` (Twilio) **NON toccato.**

> ## ⚠️ REDEPLOY MANUALE OBBLIGATORIO
> Copia-incolla i `.gs` aggiornati (`Notifiers.gs`, `Scheduler.gs`, `FunnelStore.gs`) nell'editor
> di **script.google.com**. **Il push su GitHub NON aggiorna l'Apps Script in esecuzione.**
> - **Nessun nuovo trigger** → **NON serve** rilanciare `setup()`.
> - Gli scope di `appsscript.json` (calendar / spreadsheets / send_mail / scriptapp) sono **già
>   sufficienti**: nessun nuovo scope, nessuna nuova Advanced Service.

## FIX 1 — Telefono col prefisso `+39`
- La riga `📞 Telefono` della mail stampava il numero **grezzo** (es. `393926406102`),
  confondibile con un numero senza prefisso.
- Nuova helper `_formatTelFunnel_(raw)` in `Scheduler.gs` che **replica `formatLeadPhoneDisplay`**
  di `js/main.js`: normalizza a sole cifre, toglie `0039`/`39` iniziale **solo se è un prefisso**
  (numero > 10 cifre, così non "mangia" un mobile `39x` nazionale), raggruppa **3-3-resto**,
  antepone `"+39 "` → **`+39 392 640 6102`**.
- Usata in `Notifiers.gs` ovunque si stampi `lead.telefono`: **ramo normale E ramo `isCrm`**.

## FIX 2 — Via "TESTmess" dal corpo mail
- Firma `— TESTmess Funnel Notify` → **`— Funnel Notify`**:
  - mail dei notifier (`Notifiers.gs`);
  - digest giornaliero (`_composeDigestBody_` in `Scheduler.gs`).
- I commenti di **changelog** con "TESTmess" (banner/intestazioni) **restano**: sono storia di
  versione, non testo della mail.

## FIX 3 — Appuntamento "in lettere" abbreviato
- La riga `📅 Appuntamento` passa da `24/06/2026 17:00` a **`mar 24 giu 2026, 17:00`**.
- Nuova helper `FunnelNotify_fmtApptIt(d)` in `Scheduler.gs`:
  1. tentativo **nativo** `Utilities.formatDate(d, tz, 'EEE dd MMM yyyy, HH:mm')`, accettato
     **solo se il giorno esce in italiano** (primo token tra `dom..sab`);
  2. **fallback manuale** (Apps Script può girare con locale **EN** anche se la TZ è
     `Europe/Rome`) con array IT `giorni[dom..sab]` / `mesi[gen..dic]`, estraendo **tutti** i campi
     nella **TZ dello script** (giorno settimana via `'u' % 7`, poi `dd`/`MM`/`yyyy`/`HH:mm`),
     **mai** dall'ora UTC grezza. Zero-pad nativo di `formatDate`.
- Usata **solo** per la riga Appuntamento (**ramo normale E `isCrm`**). La riga `🕒 Ingresso lead`
  resta col formato numerico `FunnelNotify_fmtDataIt`.

## FIX 4 — "Ultima azione svolta" al posto di "È scaduto uno stamp"
Prerequisito già fatto lato frontend (v2.5.88): il foglio ha la colonna `lastStep`.
- **`FunnelStore.gs`**: legge la colonna `laststep` (tollerante all'ordine via `head.indexOf`) e la
  mette in `rec.lastStep`.
- **`Scheduler.gs`** (`buildLeadFromEvent_`): aggiunge `lead.lastStep`.
- **`Notifiers.gs`**, ramo **NON-ingresso e NON-crm**: la frase fissa
  `È scaduto uno stamp del funnel per questo lead.` diventa
  **`Ultima azione verso il lead: <lastStep>.`** quando `lastStep` è valorizzato; altrimenti
  **fallback** alla vecchia frase.
- Lo stamp `ingresso` resta `È entrato un nuovo lead (evento creato in calendario).` e il ramo
  `isCrm` resta invariato.

## File / versioni interne
- `Notifiers.gs` → **v1.5.0** (FIX 1/2/3/4 lato corpo mail).
- `Scheduler.gs` → **v1.4.0** (`_formatTelFunnel_`, `FunnelNotify_fmtApptIt`, `lead.lastStep`, firma digest).
- `FunnelStore.gs` → **v1.1.0** (lettura colonna `lastStep`).
- `README.md` aggiornato: schema foglio con `lastStep`.
- Web app: solo bump versione (`js/config.js`, `index.html` title/header) + cache-bust `config.js`.
