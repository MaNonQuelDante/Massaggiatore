# CHANGELOG v2.5.82 — Google Meet automatico nell'arricchimento evento + fix scope Calendar

> ⚠️ **Solo Apps Script.** La web app NON cambia comportamento. Per attivarlo serve il
> **REDEPLOY MANUALE** dei `.gs` su [script.google.com](https://script.google.com) **+ due passi
> in più** rispetto al solito (servizio Calendar da abilitare + ri-autorizzazione). Vedi in fondo.

File toccati: `apps-script-funnel-notify/Scheduler.gs`, `apps-script-funnel-notify/Config.gs`,
`apps-script-funnel-notify/appsscript.json` (+ bump versione web in `js/config.js` / `index.html`).

---

## 1) 🎥 Google Meet creato in automatico quando il lead entra (`Scheduler.gs`)

`arricchisciEventoFunnel_` ora, oltre a WhatsApp / Chiama / Scheda lead, **crea o recupera il
Google Meet** dell'evento e aggiunge la riga `🎥 Google Meet: <link>` nel blocco contatti.

- Usa l'**Advanced Calendar Service** (`Calendar.Events.get` / `Calendar.Events.patch` con
  `conferenceData.createRequest`, `conferenceSolutionKey: hangoutsMeet`) — esattamente come fa il
  front-end con `ensureMeetOnEvent`, ma **server-side e a browser chiuso**.
- **Non duplica** il Meet: prima controlla se ne esiste già uno (in descrizione o sull'evento) e in
  quel caso lo riusa.
- **Indipendente dal telefono** (come scheda e titolo): entra anche su lead senza numero.
- Se Google tarda a generare il link, fa **1 retry** dopo una breve attesa.
- **Resilienza:** il flag `enriched_<eventId>` viene marcato **solo quando il Meet è pronto**.
  Se in quel giro non si riesce, l'evento viene ritentato ai giri successivi (entro la finestra
  "fresh" di 3h). Tutto il resto (contatti + titolo) è idempotente, quindi i ritenti non duplicano
  nulla. Tutto in `try/catch`: un errore del Meet **non blocca** né l'arricchimento né l'email.

## 2) 🔐 Fix scope Calendar (`appsscript.json`) — *necessario anche per v2.5.81*

- Scope `https://www.googleapis.com/auth/calendar.readonly` → **`https://www.googleapis.com/auth/calendar`** (pieno).
  Dalla v2.5.81 l'arricchimento **scrive** sull'evento (`setDescription` / `setTitle`) e ora anche
  `patch` della conferenceData: con la sola lettura **non avrebbe mai funzionato**.
- Aggiunto l'**Advanced Calendar Service** (`Calendar` v3) alle `dependencies`.

---

## REDEPLOY (obbligatorio per attivare) — 4 passi

1. Apri [script.google.com](https://script.google.com) → progetto **Funnel Notify**.
2. Incolla il contenuto aggiornato di **`Notifiers.gs`**, **`Scheduler.gs`**, **`Config.gs`**.
3. **Abilita il servizio Calendar:** nel pannello a sinistra, accanto a **Servizi** clicca **+**,
   scegli **Google Calendar API**, lascia l'identificatore **`Calendar`**, **Aggiungi**.
4. **Ri-autorizza:** lancia una volta `setup()` (o `test()`) dal menu in alto → "Esegui". Comparirà
   la richiesta di autorizzazione con il **nuovo** permesso Calendar (scrittura): **accetta**.

*(Lo scope è cambiato, quindi Google chiederà di riautorizzare: è normale e va fatto una volta.)*
Per una prova: `test()` = dry-run (nessuna modifica, niente Meet), `testSendOnce()` = email di prova.
