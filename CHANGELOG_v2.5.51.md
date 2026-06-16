# CHANGELOG v2.5.51 — Fix login persistente (il vero bug del re-login a ogni reload)

## Sintomo
A OGNI ricarica pagina l'app rifaceva il login Google e richiedeva i permessi,
nonostante la persistenza del token (v2.5.47) fosse già implementata.

## Causa reale (dalla console)
```
✅ Token valido ripristinato da localStorage (altri 59 min)   ← il token c'è ed è valido
🔍 Richiesta user info...
.../people/me  →  401                                         ← ma l'API lo rifiuta
🔒 Token rifiutato dall'API People (401), rilancio per silent renewal
⚠️ Token non valido all'uso: pulisco e tento rinnovo silenzioso
[GSI_LOGGER]: Failed to open popup window ... Maybe blocked    ← silent renewal bloccato (no gesto utente)
ℹ️ Rinnovo silenzioso non riuscito → mostro pulsante login    ← ti tocca ri-loggare
```

Il token persisteva benissimo, ma **`gapi.client` non lo riceveva mai**:
- Quando il token arriva **fresco dal popup GIS**, è GIS che lo attacca a
  `gapi.client` internamente → le chiamate API funzionano.
- Quando viene **ripristinato da localStorage** (`useRestoredToken`), GIS non è
  coinvolto: il codice impostava `accessToken` / `window.accessToken` ma **mai**
  `gapi.client.setToken(...)`. Risultato: `people/me` partiva senza header
  Authorization → **401**.
- Il 401 veniva (correttamente, da v2.5.49) interpretato come "token morto" →
  pulizia + rinnovo silenzioso → ma il silent renewal vuole aprire un popup senza
  un click utente → **bloccato dal browser** → ricompare il pulsante di login.

→ Loop a ogni reload. La persistenza c'era; mancava di **dire a gapi qual è il token**.

Verifica: `grep -rn "setToken" js/` → **nessun risultato** in tutta la codebase.

## Cosa è cambiato

### `js/google-auth.js`
- Nuova helper **`setGapiToken(token)`**: chiama `gapi.client.setToken({access_token})`
  (o `null` per scollegare), con guardia su `window.gapi && gapi.client`.
- **`useRestoredToken`** (ripristino sessione): ora chiama `setGapiToken(token)`
  PRIMA delle chiamate API → la sessione ripristinata è subito autenticata. **(fix)**
- **`handleAuthResponse`** (login fresco / silent renewal riuscito): chiama
  `setGapiToken(accessToken)` esplicitamente, per non dipendere dal comportamento
  implicito di GIS (robustezza).
- **`handleSignoutClick`** (logout): `setGapiToken(null)` per non lasciare un token
  revocato attaccato a gapi.client.

### `index.html` / `js/config.js`
- Bump versione a 2.5.51 (title, header/`data-version`, cache-buster di
  `config.js`, `google-auth.js`, `main.js`, `style.css`).

## Effetto atteso
- Reload **entro l'ora** → token ripristinato e accettato da gapi: nessun popup,
  nessun re-login, nessuna richiesta permessi.
- Reload **dopo l'ora** → rinnovo silenzioso `prompt:''` (se la sessione Google è
  viva nel browser): nuovo token senza popup né consenso.
- Popup/consenso solo al **primo login** o dopo revoca/sessione Google scaduta.

## Cosa NON è stato toccato (regola CLAUDE.md)
- Scope OAuth, Client ID, REDIRECT_URI: invariati.

## Da segnalare (NON modificato senza richiesta esplicita)
Nei log l'app gira su `https://manonqueldante.github.io/Massaggiatore/`, ma in
`config.js` `REDIRECT_URI` punta a `https://dantemanonquello.github.io/sgfemassdante/`
(dominio e path diversi). Il login funziona lo stesso perché GIS in popup mode non
usa quella costante, ma il mismatch genera il falso "⏱️ Timeout autenticazione dopo
10s" e messaggi di errore fuorvianti. Allineare `REDIRECT_URI` (e l'origine
autorizzata nel Client ID) alla URL reale eliminerebbe quel rumore. Da fare solo
su tua conferma.

## Test
- `node --check js/google-auth.js` → OK.
- ⚠️ Verifica live (reload senza re-login) testabile solo in browser con login reale.
</content>
</invoke>
