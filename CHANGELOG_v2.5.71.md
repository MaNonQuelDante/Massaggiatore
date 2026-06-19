# CHANGELOG v2.5.71

Due fix indipendenti nella sezione **Lead**: coerenza visiva del funnel a lead congelato + parsing telefono elastico dagli eventi Google.

---

## 1) Funnel checklist — a "Confermato"/"No" tutte le spunte restano BLU (coerenti)

**Problema:** quando un lead passa a *Confermato* (o *No*) il funnel si congela, ma il rendering era incoerente: la prima checkbox **"Ingresso lead" restava blu/cliccabile** mentre gli altri step completati diventavano **grigi/disabled** (`opacity: 0.55` + attributo `disabled`). Risultato: un quadratino blu, gli altri spenti.

**Causa:** in `renderLeadChecklist` lo stato "frozen" escludeva apposta l'ingresso:
```js
const frozen = frozenFunnel && step.key !== 'ingresso';
```
e gli step frozen ricevevano l'attributo HTML `disabled`, che fa ingrigire la checkbox dal browser (uccide l'`accent-color` blu).

**Fix (opzione "tutto blu read-only"):**
- Tolta l'eccezione: `const frozen = frozenFunnel;` → **tutti** gli step si comportano allo stesso modo.
- Niente più `disabled`: la checkbox completata resta **blu con spunta bianca**. Il read-only è ora gestito via CSS `.lead-funnel-frozen { pointer-events: none; }` + `tabindex="-1"`.
- **Guardia anche lato JS** in `toggleLeadChecklistStep`: se il funnel è congelato, il toggle viene ignorato e la vista ripristinata (niente spunte fantasma a funnel chiuso).
- CSS: rimosso `opacity: 0.55` che "spegneva" tutto; mantenuto lo strikethrough sull'orario come indicatore "congelato".

**Effetto:** gli step **completati** restano blu e coerenti tra loro; quelli **non completati** restano neutri/vuoti; niente è più cliccabile a funnel congelato. La logica di `firstCheckedAt`/freeze esistente è invariata.

File: `js/main.js`, `css/style.css`.

---

## 2) Telefono dagli eventi — `extractPhoneFromEvent` ora è ELASTICO

**Problema:** un numero scritto come `(342) 354-2724` (o altri formati con parentesi/trattini/punti, con o senza `+39`) **non veniva riconosciuto** dall'evento Google → il lead restava senza telefono.

**Causa:** le vecchie regex assumevano blocchi contigui `3xx xxxxxx` o un prefisso `+39/0039`; parentesi e trattini spezzavano il match e nessun pattern accettava un mobile a 10 cifre formattato all'americana.

**Fix:**
- Riscritta `extractPhoneFromEvent`: 1) cerca un numero **etichettato** (`Telefono:`/`Tel:`/`Cell:`/`WhatsApp:`…) e normalizza il blocco che segue; 2) altrimenti scorre i "blocchi telefonici" del testo e tiene il primo valido.
- Nuovo helper `normalizeItalianPhone(raw, labeled)`: tollera `+`, `0039`, prefisso `39`, parentesi, trattini, punti e spazi → restituisce `+39XXXXXXXXXX`. Senza prefisso accetta **solo** il mobile italiano canonico (10 cifre, inizia per 3) per evitare falsi positivi (date, importi); con etichetta/prefisso esplicito è più permissivo (fissi inclusi).

**Verificato** su 12 casi (incl. `(342) 354-2724`, `+39 342 354 2724`, `0039 …`, `342.354.2724`, data `19/06/2026` → nessun numero): 12/12 ok.

File: `js/google-calendar.js`.

---

## Note
- Aperto separatamente il tema "**lead da Calendar visibili nelle schede anche prima del primo messaggio**" (oggi le schede nascono solo da `cronologia`, la tendina dal Calendar): richiede una scelta sul comportamento + valutazione effetti sulle mail del funnel → da decidere prima di implementare.

## Deploy
- Bump `js/config.js` (version + fullName + lastUpdate) e `index.html` (title, header, cache-bust di `config.js`, `google-calendar.js`, `main.js`, `style.css`).
- Commit + push `origin/main` + backup `.tar.gz` su Drive.
