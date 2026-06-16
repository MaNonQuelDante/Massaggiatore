# v2.5.56 — Funnel conferma lead: aggancio card↔evento "LEAD - Call" più robusto

## Perché
Il titolo dell'evento su Calendar **cambia dopo l'invio del messaggio**, quindi non si
può usare il nome esatto come riferimento rigido. E i nomi possono avere maiuscole/
minuscole, accenti e **refusi**. Serviva un confronto che reggesse a questo.

## Cosa cambia (solo la logica di match; UI/funnel invariati rispetto a v2.5.55)

### "LEAD - Call" riconosciuto in due modi
Un evento è considerato "LEAD - Call" se **`LEAD - Call`** è il **titolo dell'evento**
**oppure** il **nome del calendario** in cui sta (case-insensitive). Così funziona
qualunque sia la convenzione usata su Google Calendar, senza dover scegliere a priori.

### Strategia di aggancio card-lead ↔ evento (dalla più sicura alla più tollerante)
1. **Telefono** — confronto sulle **ultime 9 cifre** (robusto al prefisso +39/0039). Il
   telefono è preso dalla **descrizione** dell'evento (`extractPhoneFromEvent`) e **non
   cambia** quando rinomini l'evento dopo l'invio → riferimento più stabile quando c'è.
2. **Nome normalizzato identico** — `normalizeName()` porta tutto a minuscolo, **toglie
   gli accenti** (è→e, ò→o…), rimuove cifre/punteggiatura/emoji e compatta gli spazi.
   Così "NICCOLO ROSSI" ≡ "Niccolò Rossi".
3. **Nome simile (refusi)** — distanza di **Levenshtein** entro una soglia in base alla
   lunghezza (≤4 char: 0 · ≤8: 1 · oltre: 2), **solo se il match è NON ambiguo**: un
   unico nome ai minimi e nettamente più vicino del successivo. Se due nomi diversi sono
   ugualmente vicini → **nessun aggancio** (meglio "T0 n/d" che il lead sbagliato).

A parità di candidato vince il **T0 più recente** (l'ultima call pianificata).
Gli eventi **all-day** (senza orario) restano scartati: niente T0 → orari `—`.

## Dettaglio tecnico
- `js/main.js`
  - Nuovi: `normalizeName`, `levenshtein`, `nameTypoTolerance`.
  - `buildLeadCallIndex()`: ora ritorna una **lista di candidati**
    `{ phone9, nameNorm, t0 }` e filtra per titolo **o** `calendarName` = "LEAD - Call".
  - `findLeadT0()`: riscritta con le 3 fasi (telefono → nome identico → nome simile non
    ambiguo). Rimossa la vecchia `leadNameKey` e l'indice per-mappa.
  - Riusa sempre `extractPhoneFromEvent` / `extractNameFromEvent` / `parseNameSurname`.
- `index.html` / `js/config.js`: bump **2.5.56** + cache-bust `main.js`, `config.js`.

## NON toccato
- Render del funnel, 5 step, orari T0/+2/+4/+6, default checkbox, persistenza Drive
  (`LEAD_CHECKLIST`): tutto invariato da v2.5.55.
- Storico messaggi e logica Calendar: invariati (solo riuso).

## Test
Harness reale `vm` che carica l'autentico `js/main.js`: **12/12 verifiche passate** —
match per telefono anche con titolo già modificato dopo l'invio; "LEAD - Call" come
titolo e come nome calendario; nome con accenti/maiuscole diverse; refuso entro soglia;
**ambiguità → nessun match**; nome troppo corto → nessuna tolleranza refusi; all-day
scartato; orari non cumulativi; render con e senza T0.

## Limite noto (dichiarato)
Se dopo l'invio il titolo viene cambiato in modo da **non** lasciar recuperare il nome
originale **e** l'evento non ha il telefono in descrizione, l'aggancio per quel lead non
è possibile: mostrerà `T0 n/d`. Il match per nome è volutamente tollerante ma non 100%.
