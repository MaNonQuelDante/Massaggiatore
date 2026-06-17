# CHANGELOG v2.5.62 — Link chiamata classica sotto WhatsApp nell'evento Calendar

Data: 2026-06-17

File toccati: `js/google-calendar.js`, `js/config.js`, `index.html`.

---

## Cosa cambia

Quando si invia/genera un messaggio, l'evento Google Calendar viene aggiornato e in
**cima alla descrizione** compare la riga `📱 WhatsApp: https://wa.me/<numero>` (link diretto
alla chat). Ora, **subito sotto** (a capo), viene aggiunta una seconda riga:

```
📱 WhatsApp: https://wa.me/393394865982
📞 Chiama: tel:+393394865982
```

`tel:+<numero>` fa partire una **telefonata classica** (non WhatsApp). Su mobile è cliccabile
e avvia la chiamata; su desktop dipende dal client.

## Dettagli implementazione

In `js/google-calendar.js` ci sono **due** blocchi che costruiscono quella riga. In entrambi:

- dopo `const whatsappLink = \`https://wa.me/${phoneClean}\`;` aggiunto
  `const phoneLink = \`tel:+${phoneClean}\`;` (stesso `phoneClean` già normalizzato col prefisso 39);
- la `newDescription` passa da `📱 WhatsApp: ${whatsappLink}` a
  `📱 WhatsApp: ${whatsappLink}\n📞 Chiama: ${phoneLink}`.

Blocco 1 ~riga 1393-1424, blocco 2 ~riga 1530-1542.

## Nota — solo eventi nuovi

Entrambi i blocchi aggiornano la descrizione solo se non contiene già `wa.me/`
(`!currentDescription.includes('wa.me/')`). Quindi il link **📞 Chiama** compare solo sugli
eventi **nuovi**: gli eventi che hanno già la riga WhatsApp non vengono ritoccati (nessun
aggiornamento retroattivo, come da richiesta).
