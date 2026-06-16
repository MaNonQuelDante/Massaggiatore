# CHANGELOG v2.5.52 — Allineato il dominio reale (manonqueldante)

## Contesto
Il dominio `dantemanonquello.github.io/sgfemassdante/` è **morto**: l'app gira
solo su `https://manonqueldante.github.io/Massaggiatore/`. I riferimenti vecchi
generavano il falso `⏱️ Timeout autenticazione dopo 10s` nei log (REDIRECT_URI che
non corrispondeva alla URL reale).

## Cosa è cambiato

### `js/google-auth.js`
- **`REDIRECT_URI`** → `https://manonqueldante.github.io/Massaggiatore/` (era
  `https://dantemanonquello.github.io/sgfemassdante/`).
- Commenti (banner CHANGELOG interno + "URI JavaScript autorizzati") aggiornati a
  `manonqueldante.github.io`.

### `js/config.js`
- `GITHUB_CONFIG.repo` → `MaNonQuelDante/Massaggiatore` (era `DanteManonquello/sgfemassdante`).
- `GITHUB_CONFIG.username` → `MaNonQuelDante` (era `DanteManonquello`).
  (Nota: `GITHUB_CONFIG.enabled` resta `false`, push manuale — è solo coerenza.)
- Bump versione 2.5.52.

### `index.html`
- Bump versione (title, header/`data-version`, cache-buster di `config.js`,
  `google-auth.js`, `main.js`, `style.css`).

### `CLAUDE.md`
- Titolo `(TESTmess / Massaggiatore)` e Hosting aggiornato alla URL reale.

## Non toccato
- Client ID e scope OAuth: invariati. L'origine `manonqueldante.github.io` è già
  autorizzata nel Client ID (il login da lì funziona), quindi nessuna modifica in
  Google Cloud Console necessaria per questa versione.

## Nota
I file storici (CHANGELOG/README delle versioni precedenti) contengono ancora il
vecchio dominio: sono **archivio**, lasciati invariati di proposito.

## Test
- `node --check` su `google-auth.js` e `config.js` → OK.
</content>
