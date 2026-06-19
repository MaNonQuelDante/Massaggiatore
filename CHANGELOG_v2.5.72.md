# CHANGELOG v2.5.72

Le **schede lead** ora nascono anche dai **calendari** (LEAD - Call + FOLLOWUP), non solo dai messaggi inviati. + Apps Script: mail di **ingresso** e funnel esteso a FOLLOWUP.

---

## 1) WEB — Le schede lead compaiono dai calendari (coerenza con la tendina)

**Problema:** un lead messo a calendario compariva nella **tendina** (che legge gli eventi del Calendar) ma **non nelle schede** della sezione Lead. Motivo: le schede nascevano **solo** dalla `cronologia` dei messaggi → finché non scrivevi al lead, niente scheda. Risultato incoerente (lead nella tendina ma non nelle schede).

**Fix:** la sezione Lead ora **materializza una scheda** anche per i lead che hanno **solo** un evento nei calendari del funnel, prima di qualunque messaggio:
- Nuovo `isLeadFunnelEvent(event)` — un evento è "del funnel" se sta nei calendari **"LEAD - Call"** o **"FOLLOWUP"** (match sul nome calendario, tollerante a `follow up`/`follow-up`) o se il titolo è esattamente `lead - call`. Solo questi due calendari hanno lead.
- Nuovo `buildCalendarLeads(candidates)` — deriva l'anagrafica dei lead dagli eventi, **dedup per `leadIdentityKey`** (la stessa chiave della cronologia → niente doppioni).
- In `loadLeadSection`: dopo il raggruppamento della cronologia, **merge** dei lead-da-calendario. Se il lead è già presente (perché poi gli hai scritto) i due si **fondono**; l'anagrafica dell'evento riempie solo i campi mancanti (i dati a mano della cronologia hanno priorità). Tolta l'uscita anticipata su cronologia vuota.
- I lead-da-calendario **senza messaggi** sono ordinati per **recency dell'evento** (ingresso/appuntamento), così i nuovi appena entrati stanno in cima ("mano a mano che vengono aggiunti").
- `buildLeadCallIndex` ora riconosce anche FOLLOWUP e per ogni candidato salva `phoneRaw` + `firstName`/`lastName` (servono a materializzare la scheda).

**Effetto:** un lead a calendario compare **subito** come scheda, con il suo **stato** (Confermato/Pending/No) e il funnel di conferma. Le schede e la tendina sono coerenti. Niente doppioni col lead poi messaggiato.

> Dipende dal parsing telefono: se il numero nell'evento non viene letto, un lead-da-calendario (chiave `nome:`) e lo stesso lead messaggiato con numero (chiave `tel:`) non si fondono. Per questo il fix telefono di v2.5.71 è importante.

File: `js/main.js`.

---

## 2) APPS SCRIPT (funnel-notify) — Mail di ingresso + FOLLOWUP ⚠️ richiede REDEPLOY

> ⚠️ Questi file (`apps-script-funnel-notify/*.gs`) **non si auto-deployano**: vanno **ricopiati a mano** nell'editor di Apps Script perché le mail cambino davvero.

- **Stamp di INGRESSO (h=0)**: appena il lead entra (evento creato) parte la mail **"🆕 Nuovo lead entrato"**. Come gli altri stamp è soggetto a `TOLLERANZA_MS` (eventi creati da **>3h** → marcati senza inviare: niente raffica di ingressi arretrati al primo giro).
- **FOLLOWUP**: il funnel ora copre anche il calendario **"FOLLOWUP"** (prima solo "LEAD - Call"). Match centralizzato in `CONFIG.CAL_MATCHES` + helper `funnelCalMatches_` / `funnelTitleMatches_`.
- `Notifiers.gs`: copia dedicata per l'email di ingresso.

File: `apps-script-funnel-notify/Config.gs`, `Scheduler.gs`, `Notifiers.gs`.

---

## Verifica
- Logica pura testata con Node: `isLeadFunnelEvent` 6/6, `buildCalendarLeads` dedup/merge ok. Sintassi `main.js` e tutti i `.gs` ok.
- Da verificare in app (login Google): un evento "LEAD - Call"/"FOLLOWUP" appena creato deve comparire come scheda nella sezione Lead, con stato Pending.

## Deploy
- Bump `js/config.js` + `index.html` (title, header, cache-bust `config.js` e `main.js`).
- Commit + push `origin/main` + backup `.tar.gz` su Drive.
- **Da fare a mano:** redeploy dell'Apps Script `funnel-notify` per attivare mail ingresso + FOLLOWUP.
