# CHANGELOG v2.5.87 — Funnel Notify: quiet hours + digest giornaliero + reminder CRM

**Data:** 2026-06-22
**Ambito:** SOLO `apps-script-funnel-notify/` (Google Apps Script, browser chiuso su trigger).
**La web app NON cambia.** `apps-script-reminder/` (Twilio) **NON toccato.**

> ## ⚠️ REDEPLOY MANUALE OBBLIGATORIO
> 1. Copia-incolla i `.gs` aggiornati (`Config.gs`, `Scheduler.gs`, `Notifiers.gs`) nell'editor
>    di **script.google.com**.
> 2. **Rilancia `setup()` una volta**: registra il **nuovo trigger giornaliero** `dailyLeadDigest`
>    (@08:00). Senza questo passaggio il digest NON parte.
> - Gli scope di `appsscript.json` (calendar / spreadsheets / send_mail / scriptapp) sono **già
>   sufficienti**: nessun nuovo scope, nessuna nuova Advanced Service.

## FEATURE A — Punto 1: slittamento stamp serali/notturni (quiet hours)
- Nuova `_applyQuietHours_(sogliaDate)` in `Scheduler.gs`:
  - ora `>= 19` → **09:00 del giorno successivo**;
  - ora `< 9` (notte) → **09:00 dello stesso giorno**;
  - `9 ≤ ora < 19` → invariata.
  - Usa `getHours()/setHours()` che in Apps Script lavorano nel fuso dello script
    (`Europe/Rome`, da `appsscript.json`); `setHours` gestisce anche il DST.
- Applicata in `processaEventoFunnel_` a `sogliaMs` **prima** del confronto dovuto/stale.
  **Esclude `ingresso`** (h=0): la mail "nuovo lead entrato" parte subito.
- **Interazione critica risolta:** la `TOLLERANZA_MS` (stale > 3h) è calcolata sulla soglia
  **SLITTATA**, non su quella originale — altrimenti uno stamp serale slittato alle 09:00 del
  giorno dopo verrebbe marcato "scaduto da >3h" e **mai inviato**.
- Costanti: `CONFIG.QUIET_AFTER_H = 19`, `CONFIG.QUIET_MORNING_H = 9`.

## FEATURE B — Punto 2: mail-riepilogo giornaliera @08:00
- Nuova `dailyLeadDigest()` (trigger time-based @08:00 `Europe/Rome`, registrato da `setup()`).
- Scorre i calendari del funnel (`funnelCalMatches_`) prendendo gli eventi che **iniziano oggi**
  (mezzanotte → 23:59 locali), dedup per `eventId`.
- Due blocchi: **✅ Confermati** (`status='confermato'`) e **⏳ In attesa** (`status='pending'`).
  `status='no'` esclusi. **Se entrambi vuoti → nessuna mail** (niente spam a vuoto).
- Per ogni lead: nome, orario appuntamento, telefono, link scheda (`?id=Lxxxx`), link evento.
  Corpo composto da `_composeDigestBody_` (funzione pura), ordinato per orario.
- Oggetto: `Riepilogo lead di oggi — <data> (<n> confermati · <m> in attesa)`.
- Nessun cutoff: è un memo operativo su chi ho **oggi**, a prescindere da quando creato.

## FEATURE C — Punto 4: reminder "compila CRM" a +2h dall'appuntamento (solo confermato)
- Nuovo stamp **`crm2h`** = `apptStart + CONFIG.CRM_REMINDER_H (2h)`.
- **Gate invertito:** a differenza del funnel normale (invia solo su `pending`), questo invia
  **solo se `status='confermato'`**.
- Implementato come ramo separato `_processaCrmReminder_`, chiamato in `processaEventoFunnel_`
  **prima** del gate `pending` — perché quel gate fa `return` su *qualsiasi* stato ≠ pending
  (confermato incluso), quindi un ramo "dopo" non sarebbe mai raggiunto per i confermati.
- Mail: *"Hai esitato il lead &lt;nome&gt; sul CRM e mandato la call ad Andrea?"* + link scheda +
  evento. Oggetto: `<nome> - Compila CRM (call ad Andrea)` (ramo `isCrm` in `EmailNotifier.send`
  + voce `EMAIL_STEP_LABELS.crm2h`).
- Stessa meccanica del funnel: dedup `sent_email_<eventId>_crm2h`, tolleranza stale,
  **quiet-hours** (slitta come gli altri), e **cutoff non-retroattivo** (già applicato a monte
  su `t0`=creazione).

## Versioni interne dei moduli
- `Config.gs` v1.4.0 → **v1.5.0**
- `Scheduler.gs` v1.2.0 → **v1.3.0**
- `Notifiers.gs` v1.3.0 → **v1.4.0**

## Test
Harness **Node+vm sul sorgente reale** (`Config.gs` + `Scheduler.gs`), **25 assert tutti verdi**
(eseguito con `TZ=Europe/Rome`):
- **A** quiet-hours su tutte le fasce (18:30/18:59/19:00/23:30/08:30/02:00/09:00/12:00) +
  l'**interazione quiet-hours ↔ stale** (rischio principale segnalato) + `ingresso` non slittato.
- **C** reminder CRM: invio singolo + dedup, no re-invio, dryRun, stale (marca senza inviare),
  quiet-hours (serale non inviato la sera).
- **B** `_composeDigestBody_`: blocchi, ora/nome/telefono/link, pending senza telefono, placeholder vuoti.
