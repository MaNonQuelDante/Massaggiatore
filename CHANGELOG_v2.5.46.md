# 📋 CHANGELOG v2.5.46 — MODALITÀ VIDEOCHIAMATA DALL'EVENTO + FIX TOGGLE

## 🎯 Obiettivo
La modalità videochiamata (Link / WhatsApp) ora viene **letta automaticamente
dall'evento** quando si seleziona un lead, e il toggle non perde più il colore.

## 🐞 Problema 1 — Il toggle Link/WhatsApp perdeva il colore (FIX)
- **Causa:** `setAssistenteToggle()` in `js/google-auth.js` usava il selettore
  `'.toggle-group .toggle-btn[data-value]'`, che pescava **tutti** i toggle della
  pagina — quindi anche i bottoni **LINK** e **WhatsApp**. Impostando il genere
  del setter ("M"/"F"), nessuno dei due combaciava con LINK/WA e veniva rimosso
  `active` da entrambi → il toggle modalità restava senza selezione.
- **Capitava solo da loggato** perché solo lì si leggono gli eventi.
- **Fix:** selettore ristretto ai soli bottoni `[data-value="M"]` / `[data-value="F"]`.

## 🆕 Problema 2 — La modalità non veniva letta dall'evento
Prima `fillFormFromEvent()` compilava nome, telefono, servizio, giorno, orario e
Meet, ma **non impostava mai** il toggle Link/WhatsApp: restava sul default "Link".

- **Nuova regola (richiesta utente):** nell'evento i setter scrivono la riga
  `Tipo di call: Whatsapp` (oppure altro). Se il valore contiene **"whatsapp"**
  → modalità **WhatsApp**; qualsiasi altra cosa (o riga assente) → **Link**.
- **Funzioni nuove** (`js/google-calendar.js`):
  - `detectMeetMode(event)` → legge **solo** il valore dopo `Tipo di call:`.
  - `setMeetModeToggle(mode)` → imposta `active` solo sui bottoni LINK/WA.
- ⚠️ **Perché non un "contiene whatsapp" generico:** l'app aggiunge da sola una
  riga `📱 WhatsApp: https://wa.me/...` a ogni evento col telefono
  (`addWhatsAppLinkToEvent`). Un match generico darebbe **sempre** falso positivo
  WhatsApp. Per questo si legge solo l'etichetta `Tipo di call`.

## 🔁 Default "Link" quando nessun lead è selezionato
- Selezionando "-- Seleziona lead --" (deselezione) → torna a **Link**.
- Dopo `resetForm()` (invio/genera) → torna a **Link**.
- Al caricamento pagina resta **Link** (default HTML invariato).

## 📂 File toccati
- `js/google-auth.js` — fix selettore `setAssistenteToggle`
- `js/google-calendar.js` — `detectMeetMode`, `setMeetModeToggle`, wiring in
  `fillFormFromEvent` + branch di deselezione
- `js/main.js` — reset modalità a Link in `resetForm`
- `js/config.js`, `index.html` — bump versione 2.5.45 → 2.5.46
