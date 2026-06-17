# CHANGELOG v2.5.66 — Funnel Notify: email automatiche sul funnel lead (base estensibile)

Notifiche **email** automatiche legate al funnel dei lead "LEAD - Call", che partono **anche a
browser chiuso** (Google Apps Script). È la base su cui poi si innesta WhatsApp/SMS.

## Cosa fa
- Quando un evento "LEAD - Call" supera uno **stamp** del funnel (T0+2h / +4h / +6h dall'orario
  dell'appuntamento), arriva un'**email** a `dante.consulenze@gmail.com`.
- Il funnel **si ferma** appena spunti **"Appuntamento confermato"** sulla card del lead: da quel
  momento niente più email per quel lead (anche per gli stamp non ancora scattati).
- Anti-duplicato persistente: ogni email parte **una volta sola** per (canale, evento, stamp).

## Architettura (estensibile per progettazione)
Nuovo Apps Script **SEPARATO** in `apps-script-funnel-notify/` — il Twilio
(`apps-script-reminder/`) **non è toccato**.
- `Config.gs` — `CONFIG` (NOTIFY_EMAIL, SHEET_ID, soglie, tolleranze). Destinatario in costante.
- `FunnelStore.gs` — legge il Google Sheet mirror; `isConfirmed()` / `getLead()`.
- `Notifiers.gs` — notifier intercambiabili `{ id, isEnabled(), send(lead, stamp) }`. Attivo:
  `EmailNotifier` (MailApp). Segnaposto commentato per `WhatsAppNotifier`.
- `Scheduler.gs` — `checkFunnelNotifications()` (trigger 5'), `setup()`, `test()` (dry-run),
  `testSendOnce()` (1 email reale). Scheduling + anti-duplicato **centralizzati**: aggiungere un
  canale = aggiungere un notifier, senza ritoccare la logica.
- `appsscript.json` — scope minimi (calendar.readonly, spreadsheets.readonly, send_mail, scriptapp).
- `README.md` — deploy, wiring del foglio, test plan.

Pattern riusato 1:1 dal Twilio esistente: trigger 5 min, dedup su `PropertiesService`
(prefisso `sent_`, distinto da `notified_`), tolleranza 3h (niente raffiche di arretrati al primo
avvio), finestra 12h, pulizia chiavi 48h, match `titolo == 'lead - call'` o calendario che lo contiene.

## Perché un Google Sheet (decisione persistenza)
Lo stato funnel + il flag "Confermato" del front-end vivono su Drive **appDataFolder**
(`js/google-drive-storage.js`), che è **per-applicazione e NON leggibile da un Apps Script**. Per
farlo leggere allo scheduler, il web app lo **rispecchia** in un **Google Sheet dedicato**:
- Nuovo `js/funnel-sheet-sync.js`: tab `LEADS`, righe
  `leadKey | telefono | nome | codice | confirmed | t0ISO | updatedAt`. Crea tab + intestazione al
  volo. Upsert (mai cancella). **Fire-and-forget**: non lancia mai errori, non tocca la UI né gli
  appDataFolder.
- Scritto al **load della sezione Lead** (batch, throttle 20s) e al **toggle "Confermato"** (upsert
  immediato, hook in `toggleLeadConfirmed`).
- Riusa lo scope `spreadsheets` **già presente** in `js/google-auth.js` → **nessun nuovo login**.

## File
- **Nuovi**: `apps-script-funnel-notify/` (Config/FunnelStore/Notifiers/Scheduler `.gs` +
  `appsscript.json` + `README.md`), `js/funnel-sheet-sync.js`.
- **Modificati (minimi/additivi)**: `js/config.js` (`FUNNEL_SHEET_ID` + versione), `index.html`
  (script + cache-bust + versione), `js/main.js` (`buildFunnelLeadRow` + hook in `loadLeadSection`
  e `toggleLeadConfirmed`).
- **NON toccati**: Twilio, UI checklist, scope OAuth, appDataFolder.

## Attivazione (manuale, vedi README del componente)
1. Crea un Google Sheet, copia l'ID.
2. Incolla l'ID in `js/config.js` → `FUNNEL_SHEET_ID` (web) **e** in
   `apps-script-funnel-notify/Config.gs` → `CONFIG.SHEET_ID`.
3. Apri l'app loggato → sezione Lead → il foglio si popola.
4. In Apps Script: `test()` (dry-run) → `testSendOnce()` (1 email) → `setup()` (trigger 5').

## Sicurezza
- **Fail-safe**: finché `SHEET_ID`/`FUNNEL_SHEET_ID` sono vuoti, nessuna scrittura e nessun invio.
- `test()` è sempre dry-run. Tolleranza 3h + dedup persistente = niente inondazioni di arretrati.
- Quota `MailApp` consumer ~100 email/giorno (da tenere a mente sui volumi).
