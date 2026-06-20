# CHANGELOG v2.5.78 — Link Google Meet nel blocco contatti dell'evento

## Contesto (richiesta di Dante)
«Quando facciamo quella roba che mettiamo il numero di telefono per la chiamata, il link a WhatsApp
e il link alla scheda, mettici anche il link di Google Meet, così faccio copia e lo incollo al
cliente.»

## Cosa fa ora
Il blocco contatti che iniettiamo nella **descrizione** dell'evento Calendar adesso può contenere
**4 righe** (ognuna solo se il dato esiste):

```
📱 WhatsApp: https://wa.me/39…
📞 Chiama: tel:+39…
📂 Scheda lead: …?id=Lxxxx
🎥 Google Meet: https://meet.google.com/xxx-xxxx-xxx
```

Così apri l'evento, **copi la descrizione** e mandi tutto al cliente in un colpo.

> Nota: questo NON è il "Copia invito" di Google (quello continua a generare il suo blocco fisso e
> non è toccabile). Questa è la nostra descrizione, sotto il nostro controllo.

## Implementazione — `js/google-calendar.js`
- **`extractMeetLink(ev)`** (nuovo helper): ricava il link Meet da un evento cercando in
  `hangoutLink` (legacy), `conferenceData.entryPoints` video (nuovo) e, come ultima spiaggia, un
  `meet.google.com` già presente nella descrizione. Ritorna `''` se non c'è Meet.
- **`addWhatsAppLinkToEvent`** e **`ensureEventTitleCorrect`**: oltre a WhatsApp/Chiama/Scheda ora
  aggiungono la riga `🎥 Google Meet` se l'evento ha un Meet. Logica di prepend riscritta a "lista
  di righe mancanti": ogni riga (scheda, Meet) si aggiunge **solo se `needs*` è vero**, quindi
  niente duplicati anche quando una parte del blocco è già presente.
- **`prependMeetLinkToEvent(eventId, calendarId, meetLink)`** (nuovo): appena si crea un Meet col
  bottone "+ Aggiungi Meet", mette subito `🎥 Google Meet: <link>` in cima alla descrizione.
  Idempotente (non duplica se già presente). Chiamato in `addMeetToEvent` sia nel percorso
  immediato sia nel **retry a 3s** (quando Google genera il link in modo asincrono).

## Idempotenza (perché non sporca le descrizioni)
- `needsWhatsAppLink = hasPhone && !desc.includes('wa.me/')`
- `needsLeadLink = !!appLink && !desc.includes('?id=')`
- `needsMeetLink = !!meetLink && !desc.includes(meetLink)`

Ripassando sullo stesso evento, se una riga c'è già non viene riaggiunta.

## File toccati
- `js/google-calendar.js`
- `js/config.js`, `index.html` (bump versione + cache-bust dei file toccati)
