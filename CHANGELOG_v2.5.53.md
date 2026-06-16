# CHANGELOG v2.5.53

**Data:** 2026-06-16

## 🗑️ Rimossa la pagina "Cronologia" dal menu
Lo storico dei messaggi vive ora **solo** nella sezione **Lead** (che è la vera
cronologia, raggruppata lead per lead). La vecchia pagina "Cronologia" era ridondante.

Modifiche:
- **`index.html`**
  - Rimossa la voce di menu `data-page="cronologia"` (`<i class="fas fa-history"></i> Cronologia`).
  - Rimosso l'intero blocco pagina `<div id="cronologiaContent">…</div>` (titolo, toolbar data, lista).
- **`js/main.js`**
  - Rimossa la riga del router `'cronologia': 'cronologiaContent',`.
  - Rimossa la riga di dispatch `if (page === 'cronologia') await loadCronologia();`.

### ⚠️ Cosa NON è stato toccato (serve alla sezione Lead)
- `saveToCronologia()` → continua a loggare ogni messaggio inviato.
- Storage `STORAGE_KEYS.CRONOLOGIA` su Google Drive → invariato.
- Classi CSS `cronologia-list` / `cronologia-item` → ancora usate dalla sezione Lead e Ri-Conferme.
- Le funzioni `loadCronologia()` / `renderCronologia()` restano definite (non più
  richiamate) per non rimuovere codice: nessun effetto, nessun riferimento DOM attivo.

## 📱 Bottone WhatsApp diretto su ogni card Lead
In `loadLeadSection()` (`js/main.js`), su ogni card lead è stato aggiunto un bottone
**WhatsApp** che apre `https://wa.me/<numero>` del lead stesso (numero ripulito con
`.replace(/\D/g, '')`). Mostrato solo se il lead ha un telefono.

Nuovo stile in `css/style.css`: `.lead-wa-btn` (verde WhatsApp, usa le variabili
`--whatsapp-green` / `--whatsapp-teal` già presenti, coerente con `.cronologia-wa-link`).

## Versionamento
Bump `2.5.52` → `2.5.53` in `js/config.js` (version, fullName, lastUpdate) e in
`index.html` (title, header `data-version`/testo, cache-bust `?v=` di tutti gli script e del CSS).
