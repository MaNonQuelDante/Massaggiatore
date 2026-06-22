# Funnel Notify — Apps Script (componente del Massaggiatore)

Notifiche **email** automatiche legate al funnel dei lead "LEAD - Call". Gira come
**Google Apps Script** autonomo su trigger ogni 5 minuti → funziona **anche a browser
chiuso**. È la **base estensibile**: domani si aggiunge WhatsApp/SMS allo stesso scheduler
senza duplicare scheduling e anti-duplicato.

**SEPARATO** dall'Apps Script Twilio (`apps-script-reminder/`), che NON si tocca. Vive qui
solo come sorgente versionato con il resto del progetto.

## Regola di business (v2.5.67)
**T0 = CREAZIONE dell'evento "LEAD - Call"** (ingresso reale del lead), NON l'orario di inizio
appuntamento. Stamp da T0 (NON cumulativi), allineati al funnel UI:

| Offset | Stamp | Azione |
|--------|-------|--------|
| T0 + 2h | `scrivere`    | Scrivere al lead |
| T0 + 4h | `sollecitare` | Sollecitare il lead |
| T0 + 6h | `chiamata`    | Sollecitare via chiamata |

- **Stato a 3 valori** (`confermato` / `pending` / `no`): le email del funnel partono **SOLO se lo
  stato è `pending`**. `confermato` e `no` **fermano** il funnel di quel lead.
- **🌙 Quiet hours (v2.5.87)**: gli stamp (tranne `ingresso`) che cadrebbero **dopo le 19:00** o
  **di notte (<09:00)** slittano alle **09:00 del mattino utile successivo** (`_applyQuietHours_`).
  La tolleranza stale è calcolata sulla soglia **slittata**.
- **📝 Reminder CRM (v2.5.87)**: stamp `crm2h` = **orario appuntamento + 2h** che — al contrario del
  funnel normale — parte **SOLO se `confermato`** ("Compila CRM / call ad Andrea").
- **📋 Digest giornaliero (v2.5.87)**: trigger separato **@08:00** che manda **una** mail-riepilogo
  con i lead il cui **appuntamento è oggi** (✅ confermati · ⏳ in attesa; `no` esclusi).
- **NON retroattivo (`FUNNEL_CUTOFF_ISO`)**: un evento **creato prima del cutoff** viene **saltato
  senza inviare**, a prescindere dallo stato — niente mail "indietro nel tempo". Doppia barriera
  (stato lato web + cutoff hard qui). Il valore DEVE essere identico a `FUNNEL_CUTOFF_ISO` in
  `js/config.js` (front-end).
- **Finestra**: sui calendari "LEAD - Call" si scansiona anche il futuro (`FUTURE_MS`, ~3 mesi),
  così un lead che prenota una call futura riceve comunque il funnel calcolato dalla creazione.
- Match evento: titolo == `lead - call` **oppure** nome calendario contiene `lead - call`.
- Anti-duplicato per `(canale, eventId, stamp)` via `PropertiesService` (`sent_…`), pulizia >48h.
- Tolleranza: stamp passato da >3h → marcato senza inviare (niente raffiche al primo deploy).

## Architettura (estensibile)
- `Config.gs` — `CONFIG` (email destinatario, ID foglio, soglie, tolleranze, `FUNNEL_CUTOFF_ISO`).
- `FunnelStore.gs` — legge il Google Sheet mirror; risponde `getStatus()` / `shouldStopFunnel()` / `getLead()`.
- `Notifiers.gs` — notifier intercambiabili `{ id, isEnabled(), send(lead, stamp) }`. Attivo:
  `EmailNotifier`. Segnaposto commentato per `WhatsAppNotifier`.
- `Scheduler.gs` — `checkFunnelNotifications()` (trigger 5'), `dailyLeadDigest()` (trigger @08:00,
  v2.5.87), `_applyQuietHours_` / `_processaCrmReminder_`, `setup()`, `test()`, `testSendOnce()`.

Per aggiungere un canale: implementa un notifier e mettilo in `NOTIFIERS`. Lo scheduling e
l'anti-duplicato (per canale) sono già pronti.

## Il Google Sheet "Funnel Lead" (mirror dello stato)
Lo stato funnel del front-end vive in Drive **appDataFolder**, che un Apps Script **non può
leggere** (è per-applicazione). Perciò il web app lo **rispecchia** in un Google Sheet che
questo script legge. Tab `LEADS`, intestazione (riga 1):

```
leadKey | telefono | nome | codice | status | t0ISO | createdISO | updatedAt
```

`status` = `confermato|pending|no`; `createdISO` = creazione evento (= T0 del funnel); `t0ISO` =
orario appuntamento. Lo script legge ancora il vecchio header con `confirmed` come fallback.

Il foglio viene **creato e popolato automaticamente dal web app** al primo caricamento della
sezione Lead (serve solo incollare l'ID del foglio anche lato web, in `js/config.js` →
`FUNNEL_SHEET_ID`).

## Avvio
1. **Crea il foglio**: un Google Sheet nuovo (stesso account che eseguirà lo script). Copia
   l'ID dall'URL `.../spreadsheets/d/<ID>/edit`.
2. **Lato web**: incolla l'ID in `js/config.js` (`FUNNEL_SHEET_ID`), deploy, apri l'app loggato
   e visita la sezione **Lead** → il foglio si popola (tab `LEADS`).
3. **Lato Apps Script**: nuovo progetto Apps Script, incolla i 4 `.gs` + `appsscript.json`.
   Incolla lo stesso ID in `Config.gs` (`CONFIG.SHEET_ID`) **e** lo stesso `FUNNEL_CUTOFF_ISO`
   che hai in `js/config.js` (devono coincidere).
4. `test()` → log di cosa verrebbe inviato adesso (DRY-RUN, zero email). Verifica che i lead
   `confermato`/`no` e quelli creati prima del cutoff risultino saltati.
5. `testSendOnce()` → arriva **una** email reale a `dante.consulenze@gmail.com`. Controlla
   oggetto/corpo e i due link.
6. `setup()` → attiva i trigger: **ogni 5 minuti** (`checkFunnelNotifications`) **+ @08:00**
   (`dailyLeadDigest`, v2.5.87). `setup()` è **idempotente** (rieseguirlo non duplica i trigger):
   **dopo ogni redeploy che cambia/aggiunge trigger va rilanciato.**

## Note di sicurezza
- Finché `CONFIG.SHEET_ID` è vuoto **non parte nessun invio** (fail-safe).
- `test()` è sempre dry-run. La tolleranza 3h + dedup persistente evitano raffiche di arretrati.
- Quota `MailApp` consumer ~100 email/giorno: tienila a mente se i volumi crescono.
