# 📋 CHANGELOG v2.5.47 — LOGIN GOOGLE PERSISTENTE

## 🎯 Obiettivo
Login persistente client-side (no backend): dopo il primo consenso, niente più
popup né caselle ai refresh/riaperture successive. Rinnovo silenzioso in background.

## 🔧 Modifiche (modulo `google-auth.js` → v2.5.18)
- **`tryRestoreSession()`** al caricamento: se in localStorage c'è un token valido
  (con margine di 60s) lo usa subito; se scaduto/assente tenta il **rinnovo
  silenzioso**.
- **`requestSilentRenewal()`**: `tokenClient.requestAccessToken({ prompt: '' })`
  → nuovo access_token senza UI se la sessione Google è attiva e il consenso è
  già stato dato.
- **`requestExplicitLogin()`**: popup pieno SOLO al primo login o dopo revoca.
  `handleAuthClick` è ora un wrapper agganciato al click del pulsante.
- **Fallback corretto**: se il rinnovo silenzioso fallisce NON si forza un popup
  (i browser lo bloccano senza gesto utente) → si mostra il pulsante di login.
- **Auto-refresh (30min)** e **keep-alive (25min)** ora passano tutti da
  `requestSilentRenewal()` per logica unica.
- `restoreTokenFromStorage()` rimossa (sostituita da `tryRestoreSession` +
  `useRestoredToken`).

## 📱 Note
- **Safari iOS / ITP**: il rinnovo silenzioso può occasionalmente fallire e
  ricadere sul pulsante; è un limite di piattaforma, non aggirabile senza backend.
- I warning **COOP** in console durante il silent sono benigni.

## ⛔ Non toccato
Scope OAuth, Client ID, redirect URI, moduli calendar/drive/sheets.

## 📂 File
- `js/google-auth.js` — refactor login (modulo v2.5.18)
- `js/google-calendar.js` — aggiornato un commento che citava la vecchia funzione
- `js/config.js`, `index.html` — bump app 2.5.46 → 2.5.47
