# v2.5.54 — Filtro calendari home: dropdown compatto a riga singola + persistenza cloud

## Cosa cambia
Il blocco **"Filtra per Calendario"** nella home (prima una lista di checkbox sempre
aperta, alta e ingombrante) diventa un **dropdown multi-select su una sola riga**:

- **Trigger compatto**: icona calendario + label della selezione corrente + chevron.
  - 0 selezionati → `Nessun calendario`
  - 1–2 (e nome corto) → i nomi, es. `Main, SG - Follow Up`
  - troppi per la riga → `N calendari selezionati`
- Al click si apre il **menù a tendina** con una checkbox per calendario.
- **Chiusura al click fuori** dal dropdown.
- Rimossa la voce checkbox **"Tutti i Calendari"** come stato di default. Al suo posto,
  dentro il menù, due **azioni**: `Seleziona tutti` / `Deseleziona tutti` (azioni, non
  uno stato iniziale).

## Persistenza (cloud)
- La selezione continua a salvarsi col **meccanismo già esistente**:
  `saveHomeSelectedCalendars()` → `localStorage` + **Google Drive**
  (`HOME_SELECTED_CALENDARS`) + report attività. Nessun meccanismo nuovo inventato.
- **MAI default a "tutti i calendari"**: un utente nuovo che non ha mai salvato nulla
  parte da **selezione vuota** → nessun calendario spuntato → **nessun evento mostrato**
  finché non sceglie esplicitamente. Lo stato vuoto è valido.
- **Loading vs vuoto**: `populateHomeCalendarDropdown()` ora **non scrive mai** in
  cloud/localStorage durante il render — salva **solo** su azione utente (toggle
  checkbox o azioni seleziona/deseleziona). Così non si rischia di sovrascrivere in
  cloud una selezione reale che stava ancora arrivando da Drive durante l'init.

## Dettaglio tecnico
- `js/google-calendar.js`
  - `populateHomeCalendarDropdown()` riscritta: render del trigger + menù a tendina,
    apertura/chiusura, listener su checkbox e azioni, click-outside (listener globale
    registrato una sola volta). Rimosso il default "tutti selezionati + autosave".
  - `updateLeadSelectorByDate()`: il filtro eventi non tratta più `null` come "tutti".
    `null`/non-array (mai salvato) ⇒ selezione vuota ⇒ nessun evento.
  - `getHomeSelectedCalendar()`: aggiornato il contratto nei commenti (null = mai
    impostato; è il consumer a tradurlo in "nessuno", non più in "tutti").
- `index.html`: il contenitore `#homeCalendarFilterCheckboxes` passa da box scrollabile
  a root del dropdown (`class="cal-dropdown"`).
- `css/style.css`: nuovi stili `.cal-dropdown*` (trigger, menù, item, azioni, chevron).

## NON toccato
- Il filtro della **pagina Calendario** (`renderCalendarCheckboxes` /
  `getFilteredEventsByCalendar` / chiave `SELECTED_CALENDARS`) resta invariato.
- Privacy v2.5.45: senza login Google i nomi dei calendari restano nascosti.

## Test
Harness reale con **jsdom** che carica il vero `js/google-calendar.js` e pilota il
dropdown renderizzato: **23/23 verifiche passate** (utente nuovo = vuoto e nessuna
scrittura in cloud al render; apertura/click-fuori; persistenza su toggle; seleziona/
deseleziona tutti; semantica del filtro eventi; re-render con selezione salvata e label
corta/lunga). Non testabili senza login reale: la sync effettiva con Google Drive.
