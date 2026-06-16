# CHANGELOG v2.5.59 — Sezione Lead (4 interventi)

Data: 2026-06-16

Interventi mirati sulla sezione **Lead** / funnel-conferma. File toccati:
`js/main.js`, `js/google-drive-storage.js`, `css/style.css`, `js/config.js`, `index.html`.

---

## 1) FIX — Persistenza spunte funnel-conferma (root cause trovata)

**Sintomo:** le checkbox del FUNNEL CONFERMA si perdevano al reload della pagina,
pur "sembrando" salvate (in console compariva `💾 Checklist salvata`).

**Causa reale:** in `js/google-drive-storage.js` l'oggetto `DRIVE_FILES` **non
mappava** le chiavi `LEAD_CHECKLIST` e `LEAD_BINDINGS`. Quindi:
- `DriveStorage.save('LEAD_CHECKLIST', …)` → `DRIVE_FILES['LEAD_CHECKLIST']` =
  `undefined` → la funzione logga "Key non valida" e **ritorna `false` senza
  scrivere nulla**. Il chiamante non controllava il valore di ritorno → falso
  "salvata".
- `DriveStorage.load('LEAD_CHECKLIST')` → stesso problema → `null` → al reload lo
  stato ripartiva vuoto e le spunte risultavano perse.

**La `leadKey` era già stabile** e deterministica: `tel:` + telefono normalizzato a
sole cifre (fallback `nome:` + nome|cognome). Stesso lead → stessa key tra sessioni.
Nessun fix necessario sulla key.

**Fix:** aggiunte le due voci in `DRIVE_FILES`:
- `LEAD_CHECKLIST: 'testmess_lead_checklist.json'`
- `LEAD_BINDINGS: 'testmess_lead_bindings.json'`

Ora save/load funzionano davvero. I file vivono in **appDataFolder** (permanente):
nessun TTL/scadenza, nessuna routine di reset o cleanup li tocca (verificato: le
uniche cancellazioni nel codice riguardano `CONTACTED_LEADS`, chiave diversa).
Le spunte restano permanenti finché non vengono cambiate dall'utente.

## 2) Telefono con prefisso in cima alla card

`393394865982` ora mostrato come **`+39 339 486 5982`**. Nuovo helper
`formatLeadPhoneDisplay()`: normalizza a sole cifre, toglie `39`/`0039` iniziale
SOLO se è davvero un prefisso (lunghezza > 10) per non duplicare il `+39` né
"mangiare" un prefisso mobile 39x già nazionale, poi raggruppa 3-3-resto.

## 3) Footer card — rimosso il nome servizio

Nella riga azione del footer rimosso `"Finanza Efficace"` / `"Stock Gain"`
(campo `servizio`). Resta solo il tag **`FE - Lead`** / **`SG - Lead`** (campo
`societa`). Il nome servizio resta usato solo in messaggi/rubrica.

## 4) Bottone WhatsApp sulla riga "Inviare a Gruppo NoShow"

Aggiunto un bottone WhatsApp (stile `.lead-wa-btn`) affiancato alla riga `noshow`,
come `<a>` fuori dalla `<label>` così il click non spunta la casella. Apre
`https://wa.me/393755588371?text=<messaggio>` (destinatario fisso per ora).

Messaggio precompilato (`encodeURIComponent`), SOLO valori, uno per riga, senza
etichette:

```
{nome cognome lead}
{data e ora appuntamento}
{numero telefono lead}
{nome assistente}
{primo nome account Google}
```

Fonti: nome/cognome/telefono dal record lead della card; data/ora appuntamento dal
T0 risolto (evento "LEAD - Call"); nome assistente da `#operatoreName` (stessa fonte
dei messaggi); primo nome account Google da `userProfileData().name.split(' ')[0]`.
