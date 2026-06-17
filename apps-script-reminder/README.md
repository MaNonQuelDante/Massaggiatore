# Reminder Lead — Apps Script (componente del Massaggiatore)

Componente del progetto **Massaggiatore (TESTmess)**, ma SEPARATO dall'app web:
NON è caricato da `index.html`. È un **Google Apps Script** autonomo che gira su
trigger ogni 5 minuti e manda reminder WhatsApp (via Twilio, template utility
approvato) quando un appuntamento "LEAD - Call" supera certe soglie orarie.

Vive in questa cartella solo come **sorgente versionato** insieme al resto del
progetto (linea `TESTmess v2.5.x`). In esecuzione gira nell'editor Apps Script di
Google, non sul sito.

## Stato
- ⏳ **Twilio ancora da creare**: le credenziali sono solo placeholder nelle Script Properties. Il codice non parte in produzione finché non si popolano.

## Regola di business
T0 = orario di inizio dell'evento "LEAD - Call". Soglie da T0 (NON cumulative), reminder DOPO l'appuntamento:

| Offset | Azione |
|--------|--------|
| T0 + 2h | Scrivere al lead |
| T0 + 4h | Sollecitare il lead |
| T0 + 6h | Sollecitare via chiamata |

- Match evento: titolo == `lead - call` (case-insensitive) **oppure** nome calendario contiene `lead - call`.
- Dedup per coppia (eventId + soglia) via `PropertiesService`. Pulizia chiavi > 48h.
- Tolleranza: soglia passata da > 3h → si marca senza inviare (niente raffiche di arretrati al primo deploy).
- **Setter**: estratto SOLO da fonti esplicite (`Setter:` / `Assistente:` / `Operatore:` nella description). Mai fallback al nome account → se assente, scrive letteralmente `NOSETTER`.

## File
- `Codice.gs` — tutta la logica (un solo file).
- `appsscript.json` — scope minimi (Calendar readonly + external_request + triggers).

## Script Properties da creare (editor Apps Script → ⚙ Impostazioni progetto → Proprietà script)
1. `TWILIO_ACCOUNT_SID` (`AC...`), `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (numero Twilio WhatsApp, solo cifre con prefisso es. `14155238886`).
2. `TWILIO_TEMPLATE_SID` (`HX...`) — template utility approvato con 5 variabili `{{1}}..{{5}}`: nome / data-ora / azione / telefono / setter.
3. `DEST_NUMBERS` — destinatari in sole cifre con prefisso, separati da virgola (es. `393331234567,393339876543`).

## Avvio (quando Twilio è pronto)
1. Crea un nuovo progetto Apps Script, incolla `Codice.gs` + `appsscript.json`.
2. Crea le Script Properties qui sopra.
3. Lancia `test()` → controlla i log (nessuna spesa, dryRun).
4. Lancia `setup()` una volta → attiva il trigger ogni 5 minuti.
