# v2.5.79 — Template "Link Meet" + Schede Lead non retroattive

## 1) Nuovo template messaggio "Link Meet"
- Aggiunto il template `link_meet` (categoria **Promemoria**) ai default in `loadTemplates()` (`js/main.js`).
- Testo prodotto:
  ```
  <URL del Google Meet>
  Eccoci NOME, ti lascio intanto il link. A tra poco
  ```
  (prima riga = solo l'URL del Meet, a capo, poi il testo).
- Nuovo segnaposto **`{URL}`** risolto in `updatePreview()`:
  - legge l'`<option>` selezionata di `#selectLead` → `dataset.eventData` (JSON dell'evento Calendar, già presente);
  - passa l'evento a `window.extractMeetLink(ev)` (cerca in `hangoutLink` / `conferenceData` / descrizione);
  - se c'è il link → sostituisce `{URL}` con l'URL nudo;
  - se NON c'è lead selezionato o l'evento non ha Meet → `[seleziona un lead con Meet]` (così è ovvio cosa manca).
  - La sostituzione di `{URL}` vale per **tutti** i template (riusabile altrove).
  - **Zero chiamate extra a Google**: l'evento è già nel `dataset` dell'option.
- Blocco di migrazione difensivo: se un localStorage vecchio non ha `link_meet`, viene aggiunto senza reset manuale (oggi il reset forzato di `loadTemplates()` lo ricrea già dai default).

## 2) Schede Lead — solo da OGGI in poi (non retroattivo)
- Le **schede** della sezione Lead ora mostrano SOLO i lead con appuntamento **dal giorno corrente in poi** (`t0 >= mezzanotte locale di oggi`). I lead con appuntamento passato spariscono dalle card.
- Filtro applicato su `leadSectionLeads` (la lista che alimenta le card), in `loadLeadSection()` (`js/main.js`).
- **NON toccati**:
  - la tendina `#selectLead` (filtrata per giorno selezionato a parte in `js/google-calendar.js`);
  - il mirror del funnel sul Google Sheet (continua a usare la lista completa → l'Apps Script/foglio non cambia comportamento);
  - il cutoff dell'Apps Script (`FUNNEL_CUTOFF_ISO`).
- Un lead **senza data appuntamento risolvibile** (es. messaggio manuale senza evento Calendar) viene **tenuto**: non è "vecchio", semplicemente non ha una data su cui filtrare.
- Log in console: numero di lead vecchi nascosti dalle schede.

## File toccati
- `js/main.js` — template `link_meet`, `{URL}` in `updatePreview()`, filtro non-retroattivo schede.
- `js/config.js` — bump versione + `lastUpdate`.
- `index.html` — title, header, cache-buster `?v=` di `main.js` e `config.js`.
