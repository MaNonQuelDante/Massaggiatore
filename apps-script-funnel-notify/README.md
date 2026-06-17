# Funnel Notify — Apps Script (componente del Massaggiatore)

Notifiche **email** automatiche legate al funnel dei lead "LEAD - Call". Gira come
**Google Apps Script** autonomo su trigger ogni 5 minuti → funziona **anche a browser
chiuso**. È la **base estensibile**: domani si aggiunge WhatsApp/SMS allo stesso scheduler
senza duplicare scheduling e anti-duplicato.

**SEPARATO** dall'Apps Script Twilio (`apps-script-reminder/`), che NON si tocca. Vive qui
solo come sorgente versionato con il resto del progetto.

## Regola di business
T0 = inizio dell'evento "LEAD - Call". Stamp da T0 (NON cumulativi), allineati al funnel UI:

| Offset | Stamp | Azione |
|--------|-------|--------|
| T0 + 2h | `scrivere`    | Scrivere al lead |
| T0 + 4h | `sollecitare` | Sollecitare il lead |
| T0 + 6h | `chiamata`    | Sollecitare via chiamata |

- **Stop funnel se "Confermato"**: quando spunti *Appuntamento confermato* nella UI, il web
  app lo scrive nel foglio (vedi sotto) e lo scheduler **salta tutte le email** di quel lead.
- Match evento: titolo == `lead - call` **oppure** nome calendario contiene `lead - call`.
- Anti-duplicato per `(canale, eventId, stamp)` via `PropertiesService` (`sent_…`), pulizia >48h.
- Tolleranza: stamp passato da >3h → marcato senza inviare (niente raffiche al primo deploy).

## Architettura (estensibile)
- `Config.gs` — `CONFIG` (email destinatario, ID foglio, soglie, tolleranze).
- `FunnelStore.gs` — legge il Google Sheet mirror; risponde `isConfirmed()` / `getLead()`.
- `Notifiers.gs` — notifier intercambiabili `{ id, isEnabled(), send(lead, stamp) }`. Attivo:
  `EmailNotifier`. Segnaposto commentato per `WhatsAppNotifier`.
- `Scheduler.gs` — `checkFunnelNotifications()` (trigger), `setup()`, `test()`, `testSendOnce()`.

Per aggiungere un canale: implementa un notifier e mettilo in `NOTIFIERS`. Lo scheduling e
l'anti-duplicato (per canale) sono già pronti.

## Il Google Sheet "Funnel Lead" (mirror dello stato)
Lo stato funnel del front-end vive in Drive **appDataFolder**, che un Apps Script **non può
leggere** (è per-applicazione). Perciò il web app lo **rispecchia** in un Google Sheet che
questo script legge. Tab `LEADS`, intestazione (riga 1):

```
leadKey | telefono | nome | codice | confirmed | t0ISO | updatedAt
```

Il foglio viene **creato e popolato automaticamente dal web app** al primo caricamento della
sezione Lead (serve solo incollare l'ID del foglio anche lato web, in `js/config.js` →
`FUNNEL_SHEET_ID`).

## Avvio
1. **Crea il foglio**: un Google Sheet nuovo (stesso account che eseguirà lo script). Copia
   l'ID dall'URL `.../spreadsheets/d/<ID>/edit`.
2. **Lato web**: incolla l'ID in `js/config.js` (`FUNNEL_SHEET_ID`), deploy, apri l'app loggato
   e visita la sezione **Lead** → il foglio si popola (tab `LEADS`).
3. **Lato Apps Script**: nuovo progetto Apps Script, incolla i 4 `.gs` + `appsscript.json`.
   Incolla lo stesso ID in `Config.gs` (`CONFIG.SHEET_ID`).
4. `test()` → log di cosa verrebbe inviato adesso (DRY-RUN, zero email). Verifica che i lead
   confermati risultino saltati.
5. `testSendOnce()` → arriva **una** email reale a `dante.consulenze@gmail.com`. Controlla
   oggetto/corpo e i due link.
6. `setup()` → attiva il trigger ogni 5 minuti.

## Note di sicurezza
- Finché `CONFIG.SHEET_ID` è vuoto **non parte nessun invio** (fail-safe).
- `test()` è sempre dry-run. La tolleranza 3h + dedup persistente evitano raffiche di arretrati.
- Quota `MailApp` consumer ~100 email/giorno: tienila a mente se i volumi crescono.
