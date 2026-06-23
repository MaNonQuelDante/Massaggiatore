# TESTmess v2.5.90 — Notifiche funnel SOLO calendario "LEAD - Call"

**Data:** 2026-06-23
**Ambito:** SOLO `apps-script-funnel-notify/Config.gs` (Apps Script). La web app vanilla JS **non cambia comportamento**.

## Cosa cambia
Dante vuole ricevere le notifiche del funnel **solo** per i lead del calendario **"LEAD - Call"**, e basta.

Dalla v2.5.72 il funnel agganciava **due** calendari — "LEAD - Call" **e** "FOLLOWUP" — tramite la
costante `CONFIG.CAL_MATCHES`. Ora:

```diff
- CAL_MATCHES: ['lead - call', 'followup', 'follow up', 'follow-up'],
+ CAL_MATCHES: ['lead - call'],
```

Da qui in poi **tutte** le mail del funnel — ingresso, "scrivere", "sollecitare", "chiamata", il
digest giornaliero delle 08:00 e il reminder CRM (crm2h) — partono **solo** dagli eventi del
calendario **"LEAD - Call"**. Gli eventi del calendario **"FOLLOWUP" non generano più alcuna notifica**.

## È "l'opzione"
Il match calendario è centralizzato in `CONFIG.CAL_MATCHES`, letto da `funnelCalMatches_`.
Per **riattivare FOLLOWUP** in futuro basta rimettere le sue voci nell'array:
`['lead - call', 'followup', 'follow up', 'follow-up']`. Una sola riga.

## Cosa NON ho toccato (di proposito)
- `funnelTitleMatches_` / `TITLE_MATCH` → resta `'lead - call'` (un evento con quel titolo esatto
  vale comunque, anche se in un altro calendario — coerente con "solo Lead - call").
- `_isTitoloGrezzoFunnel_` (riconosce ancora "followup") → ora innocua: nessun evento FOLLOWUP
  arriva più alla fase di arricchimento, quindi quel ramo non viene esercitato.
- **Sezione Lead della web app** (`isLeadFunnelEvent` in `js/main.js`): continua a **mostrare** le
  schede dei lead anche dal calendario FOLLOWUP. È **visualizzazione**, non una notifica → lasciata
  invariata. Se vuoi togliere anche quelle schede, dimmelo: è una modifica separata sulla web app.
- `apps-script-reminder/` (Twilio): già solo "LEAD - Call" e non attivo. Non toccato.

## ⚠️ Redeploy necessario
Questa è una modifica **Apps Script**: il push su GitHub **non** aggiorna lo script in esecuzione.
Per renderla effettiva:
1. Apri il progetto su **script.google.com**.
2. Ricopia il contenuto aggiornato di **`Config.gs`** nell'editor.
3. Salva. **Nessun nuovo trigger** → **NON serve** rilanciare `setup()`.

## Versioni interne
- `Config.gs` → **v1.6.0**
