# CHANGELOG v2.5.77 — Eventi Calendar: link/scheda più affidabili + "Copia link Meet" pulito

## Contesto (segnalazione di Dante)
1. «Sugli eventi non sempre mi mette dentro il numero WhatsApp, il link chiamata, il link alla
   scheda.» → iniezione che a volte falliva **in silenzio**.
2. «Quando faccio "copia invito" esce tutto il pippone (orario, fuso, "Informazioni per partecipare"…)
   invece del solo link Meet, non posso presentarlo al cliente.»

## Diagnosi (codice vero, niente tirare a indovinare)
- **Tutto dipendeva dal telefono.** In `addWhatsAppLinkToEvent` un `if (!telefono) return` precoce
  usciva subito: niente WhatsApp **e** niente rename titolo **e** niente riga scheda. La riga scheda
  non c'entra col telefono, ma moriva insieme.
- **Stesso difetto in `ensureEventTitleCorrect`** (il "ripara quando selezioni il lead"): scheda e
  WhatsApp erano dietro `if (telefono)`, e la chiave del codice (`leadKey`) richiedeva il telefono.
- **Fallimento patch muto.** La `events.patch` falliva (tipicamente token Google scaduto/revocato →
  401/403) ma l'errore restava solo in `console`: Dante non vedeva nulla a schermo.
- **leadCode null silenzioso.** In `markLeadAsContacted` il codice lead si assegna solo con token
  valido; se mancava, `leadCode` restava `null` (→ niente riga scheda) senza alcuna traccia.
- **Bug regex.** In `addWhatsAppLinkToEvent` il numero veniva ripulito con `/^\\+/` (un backslash di
  troppo): NON rimuoveva il `+` iniziale → su numeri `+39…` usciva `wa.me/+39…` malformato. La
  gemella in `ensureEventTitleCorrect` era già corretta (`/^\+/`).
- **Il "pippone" del Meet non è nostro.** Quel blocco (orario, fuso, "Informazioni per partecipare",
  link) lo genera **Google** sul suo bottone "Copia invito"; non è nella nostra `description` e
  **non è modificabile via API**. L'unica soluzione reale è un bottone NOSTRO che copia solo l'URL.

## Fix — `js/google-calendar.js`
1. **Scheda + rename disaccoppiati dal telefono** (`addWhatsAppLinkToEvent`). Niente più `return`
   precoce: senza numero si saltano **solo** le righe WhatsApp/Chiamata; titolo e
   `📂 Scheda lead: …?id=Lxxxx` vengono applicati lo stesso. `needsWhatsAppLink = hasPhone && …`.
2. **Stesso disaccoppiamento in `ensureEventTitleCorrect`.** La chiave `leadKey` non richiede più il
   telefono: `leadIdentityKey` cade su `nome:<nome>|<cognome>` quando il numero manca, **esattamente**
   come fa `markLeadAsContacted` → il codice si ritrova lo stesso (chiavi coerenti tra i due percorsi).
   Inoltre i **due `events.get` ridondanti** sono stati uniti in **uno solo**.
3. **Fallimento patch VISIBILE.** Nel `catch` di `addWhatsAppLinkToEvent`: se `code` è 401/403 →
   toast `⚠️ Link non iniettati nell'evento — riconnetti Google e riprova`; altrimenti toast generico.
   L'errore continua a propagare (il chiamante logga warn come prima).
4. **Diagnostica leadCode null** (`markLeadAsContacted`): ramo `else` che logga quali prerequisiti
   mancano (`DriveStorage`/`accessToken`/`leadIdentityKey`/`formatLeadCode`) — il colpevole tipico è
   `accessToken` assente/scaduto.
5. **FIX regex** `/^\\+/` → `/^\+/`: ora il `+` iniziale viene rimosso e il link WhatsApp è pulito.
6. **Guardia anti-titolo-vuoto**: il rename scatta solo se `newTitle` non è vuoto (un parsing a
   vuoto non azzera mai il titolo dell'evento).

## Feature — bottone "📋 Copia link Meet"
- Nuova funzione `copyMeetLink(url)`: `navigator.clipboard.writeText(url)` con **fallback** `textarea`
  + `execCommand('copy')` per contesti senza Clipboard API. Toast `✅ Link Meet copiato`.
- Bottone aggiunto in **3 punti** dove esiste un Meet: form lead (`googleMeetContainer`), lista
  eventi della Home (`event-meet-btn--exists`), e subito dopo aver creato un Meet (`addMeetToEvent`).
- Copia **solo** l'URL nudo `https://meet.google.com/xxx-xxxx-xxx` — niente blocco testuale di Google.
- CSS dedicato (indaco `#667eea`, distinto dal verde "Apri Meet"): `.btn-meet-copy` e
  `.event-meet button.event-meet-btn--copy`.

## Cosa NON è stato toccato (per onestà)
- Il blocco testuale del Meet sul "Copia invito" di Google resta: è lato Google, non aggirabile via
  API. Il bottone nuovo è il modo corretto di avere il link pulito per il cliente.
- Scope OAuth / Client ID / redirect URI: invariati.

## File toccati
- `js/google-calendar.js` (fix iniezione + regex + copyMeetLink + bottoni)
- `css/style.css` (stili bottone copia)
- `js/config.js`, `index.html` (bump versione + cache-bust dei file toccati)
