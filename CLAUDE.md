# CLAUDE.md — Stock Gain Messenger (TESTmess / sgfemassdante)

Istruzioni di progetto per Claude. Le leggo a ogni sessione.

## ⚠️ REGOLA FISSA — DEPLOY AUTOMATICO A OGNI MODIFICA
Ogni volta che cambio anche solo una riga di codice, **eseguo SEMPRE in automatico,
senza chiedere**, questa sequenza completa:

1. **Bump versione** in `js/config.js` (`version` + `fullName` + `lastUpdate`) e in
   `index.html` (title, header `data-version` e testo, e cache-bust `?v=` di TUTTI
   gli script che cambiano — almeno quello del file toccato).
2. **CHANGELOG** `CHANGELOG_v<versione>.md` con cosa è cambiato.
3. **Commit** git con messaggio chiaro `vX.Y.Z - ...`.
4. **Push** su GitHub (`origin/main`).
5. **Backup su Drive**: `tar.gz` del progetto (escluso `.git`) con nome
   `TESTmess_v<versione>_<DESCRIZIONE>.tar.gz`, caricato nella cartella
   **`gdrive:RIPARTIAMO DA QUI/000) SOFTWARE/02) MASSAGGIATORE/2030 top versioni/`**
   (NON nella root di Drive — lì stanno tutte le versioni storiche).

NON chiedo conferma per fare questo. Lo faccio e basta.
L'UNICA eccezione è se Dante dice esplicitamente "non committare" / "mostrami
prima il diff" / "aspetta": in quel caso mi fermo finché non dà l'OK.

Versionamento: l'app usa un numero unico crescente (es. 2.5.47). I singoli moduli
(es. `google-auth.js`) possono avere un banner di versione interno indipendente.

## Stack
- Web app statica, **vanilla JS puro**, nessun framework/build. Solo Google
  Identity Services per OAuth. No backend.
- Hosting: GitHub Pages → `https://dantemanonquello.github.io/sgfemassdante/`
- Integrazioni Google: Calendar, Drive (`drive.file`), People/Contacts, Sheets.

## Convenzioni
- Commenti in **italiano**.
- `console.log` con emoji: ✅ ❌ ⚠️ 🔐 🔄 📅 📱 ℹ️ ecc.
- Niente librerie esterne oltre a Google Identity Services.
- Non toccare scope OAuth, Client ID, redirect URI senza richiesta esplicita.
- Preservare le funzioni esistenti degli altri moduli (calendar/drive/sheets/rubrica).

## Strumenti deploy (Mac)
- `git` + `gh` (utente GitHub: MaNonQuelDante) in `~/.local/bin`.
- `rclone` in `~/.local/bin`, remote Drive = `gdrive:`.
