# CHANGELOG v2.5.81 — Apps Script Funnel: email più pulite + eventi auto-arricchiti 24h

> ⚠️ **Solo Apps Script.** La web app NON cambia comportamento. Per attivare queste modifiche
> serve il **REDEPLOY MANUALE**: copia i file `.gs` aggiornati nell'editor di
> [script.google.com](https://script.google.com) (progetto "Funnel Notify"). Vedi in fondo.

File toccati: `apps-script-funnel-notify/Notifiers.gs`, `apps-script-funnel-notify/Scheduler.gs`,
`apps-script-funnel-notify/Config.gs` (+ bump versione web in `js/config.js` / `index.html`).

---

## 1) EMAIL più pulite (`Notifiers.gs` → `EmailNotifier.send`)

**Oggetto** = `Nome Cognome - <step>` (niente più prefisso `[Massaggiatore]` né emoji nell'oggetto).
Lo `<step>` dipende dallo stamp del funnel (mappa `EMAIL_STEP_LABELS`):

| stamp.key     | step nell'oggetto       |
|---------------|-------------------------|
| `ingresso`    | **Appena entrato**      |
| `scrivere`    | **Manda primo messaggio** |
| `sollecitare` | **Manda sollecito**     |
| `chiamata`    | **Chiama**              |

(chiave sconosciuta → fallback a `stamp.label`).

**Corpo** ripulito:
- via la parentesi `(creazione evento)` → ora solo `🕒 Ingresso lead: <data>`;
- via la parentesi `(call)` → ora solo `📅 Appuntamento: <data>`;
- rimossa la riga esplicativa `🆕 Ingresso lead registrato (T0).` / `⏰ Stamp raggiunto…`.

Restano: Lead, Telefono, Ingresso, Appuntamento, Evento calendario, Scheda lead, firma.
Il **nome** mostrato (oggetto + riga Lead) è ripulito e in Title Case
(`ARTURO ALVARI: Finanza` → `Arturo Alvari`) riusando gli helper di `Scheduler.gs`.

---

## 2) EVENTO arricchito in automatico all'ingresso (`Scheduler.gs` → `arricchisciEventoFunnel_`)

Appena il lead entra (stamp `ingresso`, h=0), **a browser chiuso**, lo scheduler replica
server-side ciò che il front-end fa a "genera/invia messaggio", **senza dipendere dal token
OAuth che scade dopo 1h**:

- inietta in cima alla **descrizione** il blocco contatti, idempotente (non duplica righe già presenti):
  - `📱 WhatsApp: https://wa.me/<numero>` (solo se c'è il telefono e non c'è già un `wa.me/`)
  - `📞 Chiama: tel:+<numero>`
  - `📂 Scheda lead: <APP_BASE_URL>?id=<codice>` (se il lead è già nel foglio; altrimenti URL base nudo, come l'email);
- **rinomina il titolo** grezzo (`LEAD - Call` / `FOLLOWUP`) in **`Nome Cognome`** (Title Case).
  Lo *step* NON va nel titolo dell'evento (vive solo nell'oggetto dell'email): così il titolo
  resta coerente con quello che scrive la web app, senza litigare.

**Garanzie:**
- gira **una volta sola** per evento (flag `enriched_<eventId>` su `PropertiesService`);
- normalizzazione telefono **identica** al front-end (toglie spazi e `+`, antepone `39` ai numeri locali a 10 cifre);
- rename solo se ho un nome affidabile (`rec.nome` dal foglio, o il titolo evento ripulito e
  non-grezzo): non trasforma mai `LEAD - Call`/`FOLLOWUP` in `Lead`/`Followup`;
- **isolato in `try/catch`**: un errore di arricchimento **non blocca l'invio dell'email**;
- agganciato alle stesse barriere del funnel: solo stato `pending`, solo eventi oltre il cutoff,
  solo eventi "freschi" (entro la tolleranza di 3h → niente arricchimenti retroattivi di massa).

**Escluso:** il **Google Meet** (richiede l'Advanced Calendar Service / `conferenceData`) — round separato.

---

## REDEPLOY (obbligatorio per attivare)

1. Apri [script.google.com](https://script.google.com) → progetto **Funnel Notify**.
2. Incolla il contenuto aggiornato di **`Notifiers.gs`**, **`Scheduler.gs`**, **`Config.gs`**.
3. Salva. Niente nuovi scope da autorizzare (usa `CalendarApp` già concesso).
4. (Opzionale) lancia `test()` per un dry-run, poi `testSendOnce()` per una mail di prova.
