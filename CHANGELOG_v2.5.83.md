# CHANGELOG v2.5.83 — Auto-spunta degli step funnel all'invio + nuovo messaggio "Gruppo No Show"

> ✅ **Solo web app** (vanilla JS). Nessun redeploy Apps Script richiesto.

File toccato: `js/main.js` (+ bump versione in `js/config.js` / `index.html`).

**Il problema risolto:** gli orari del funnel lead venivano congelati nel momento in cui mettevi
la spunta **a mano** — se la mettevi in ritardo, il timestamp era sbagliato. Ora, quando invii il
messaggio, lo step giusto si spunta **da solo**, col timestamp **reale** dell'invio.

---

## 1) 🔵 Auto-spunta dello step funnel all'invio del messaggio

Quando **generi** o **invii su WhatsApp** un messaggio, lo step funnel del lead si spunta in
automatico (timestamp `firstCheckedAt` = orario reale d'invio, congelato come sempre):

| Tipo messaggio | Step spuntato |
|---|---|
| **Primo Messaggio** (`primo_messaggio`) | **Scrivere al lead** |
| **Riscontro** (`riscontro`) | **Sollecitare il lead** |
| **Gruppo No Show** (`gruppo_noshow`, nuovo) | **Inviare a Gruppo NoShow** |

- Aggancio **unico** in coda a `saveToCronologia` → vale per **entrambi** i bottoni (Genera e
  Invia su WhatsApp), già `await`-ati prima del reset del form. Nuova `autoCheckFunnelStepOnSend`
  + mappa `MSG_TYPE_TO_FUNNEL_STEP`.
- Riusa `toggleLeadChecklistStep` (stessa logica della spunta manuale): **non** sovrascrive il
  `firstCheckedAt` se lo step era già spuntato, ed è **no-op a funnel congelato** (Confermato/No).

### ⏳ Lo step "Chiamata" NON è auto-spuntabile (per ora)
Il `tel:` parte quasi sempre **fuori dall'app** (evento Google Calendar, mail o WhatsApp del
Notifier) → non è intercettabile lato JS da qui. Resta manuale e verrà **rivisto a parte** (servirà
un redirect tracciato lato Apps Script). Tutto il resto del fattibile è stato fatto.

## 2) 💬 Nuovo tipo messaggio "Gruppo No Show"

Nuova voce nella tendina dei messaggi. Il testo è **identico** a quello del bottone NoShow già
presente sulla card lead: stessa fonte unica `buildNoShowText` (estratta da `buildNoShowWaHref`,
così non c'è testo duplicato/inventato). Cinque righe:

```
Nome Cognome
gg/mm, hh:mm (appuntamento)
+39 ... (telefono lead)
<assistente>
<tuo nome Google>
```

**⚠️ Dove va l'invio:** con questo tipo, il bottone **Invia su WhatsApp** apre la chat verso
**TE STESSO (+39 351 980 9874)**, **non** verso il lead — il corpo contiene già i dati del lead,
e poi **lo inoltri tu a mano sul gruppo**. La cronologia e la marcatura del lead restano comunque
legate al **numero del lead** (non al numero "self"). Il vecchio bottone NoShow verde sulla card
continua a funzionare come prima (inoltro diretto al numero del gruppo).

## 3) 🛡️ Sicurezza: niente cancellazione delle spunte degli altri lead

L'auto-spunta può partire dalla **Home**, dove la sezione Lead potrebbe non essere mai stata aperta
in quella sessione → lo stato in memoria sarebbe vuoto e il salvataggio avrebbe **sovrascritto su
Drive cancellando le spunte di tutti gli altri lead**. Per questo `autoCheckFunnelStepOnSend`
**rilegge prima la checklist completa da Drive** (fonte di verità) e poi spunta. Verificato.

---

### Test
Harness Node+vm sul **vero** `js/main.js` (DOM stubbato): (a) `buildNoShowText` produce le 5 righe
attese e `buildNoShowWaHref` punta ancora al numero del gruppo con lo stesso testo; (b)
`primo_messaggio→scrivere`, `riscontro→sollecitare`, `gruppo_noshow→noshow`; (c) un **altro** lead
già spuntato **resta intatto** dopo le auto-spunte; (d) tipo non mappato = nessun salvataggio; (e)
lo step `chiamata` non viene mai auto-spuntato dall'invio. Tutti passati.
