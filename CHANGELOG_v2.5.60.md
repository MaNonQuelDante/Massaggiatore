# v2.5.60 — Componente Reminder Lead (Apps Script + Twilio WhatsApp)

Aggiunto un nuovo componente del progetto, **separato dall'app web**: un Google
Apps Script che manda reminder WhatsApp (via Twilio) sugli appuntamenti "LEAD - Call".

## Cosa cambia
- Nuova cartella **`apps-script-reminder/`** nel repo (solo sorgente versionato, NON caricato da `index.html`):
  - `Codice.gs` — logica completa in un solo file.
  - `appsscript.json` — scope minimi (calendar.readonly, script.external_request, script.scriptapp), timezone Europe/Rome.
  - `README.md` — regole, Script Properties, avvio.
- Bump versione `2.5.59 → 2.5.60` (`js/config.js` + `index.html`). **Nessuna modifica al comportamento della web app**: solo numero di versione + nuovo sorgente nel progetto.

## Logica del reminder
- T0 = inizio evento "LEAD - Call". Soglie da T0 (NON cumulative), dopo l'appuntamento:
  - +2h → "Scrivere al lead"
  - +4h → "Sollecitare il lead"
  - +6h → "Sollecitare via chiamata"
- Match evento: titolo == `lead - call` (case-insensitive) **oppure** nome calendario contiene `lead - call`.
- Trigger ogni 5 min. Dedup per coppia (eventId + soglia) via `PropertiesService`; pulizia chiavi > 48h.
- Tolleranza 3h: soglia troppo vecchia → marca senza inviare (no raffiche di arretrati al primo deploy).
- Invio Twilio con template utility (`ContentSid` + `ContentVariables`, 5 variabili). Credenziali SOLO in Script Properties, mai hardcoded.
- Setter: SOLO da fonti esplicite (`Setter:`/`Assistente:`/`Operatore:`), altrimenti `NOSETTER` (mai fallback al nome account).
- `setup()` crea il trigger (idempotente); `test()` simula in dryRun senza toccare Twilio.

## Stato
- Architettura pronta. **Twilio ancora da creare** → credenziali placeholder nelle Script Properties; non operativo finché non popolate. Esecuzione (creazione Twilio + template + attivazione trigger) rimandata.
