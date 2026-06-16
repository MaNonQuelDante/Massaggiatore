# CHANGELOG v2.5.49 — FIX foto profilo / login Google

## Il problema (dai log)
All'apertura l'app diceva "Online ✅ / Auto-login completato", ma le chiamate reali
alle API Google tornavano **401**:

```
content-people.googleapis.com/.../people/me ... 401
content.googleapis.com/calendar/v3/.../calendarList ... 401
```

Quindi non era "non loggato": il **token salvato in localStorage era scaduto/revocato**.
Google lo rifiutava, ma l'app restava "loggata" e la foto profilo andava in errore
(immagine rotta). L'immagine rotta era solo il **sintomo**, non la causa.

## Causa esatta
1. `getUserInfo()` aveva un `catch` finale che **ingoiava il 401** e tornava un
   oggetto finto `{ name: 'Dante', email: '', photo: '' }`. Così il `catch` in
   `useRestoredToken()` non scattava mai: niente pulizia, niente rinnovo silenzioso,
   l'app mostrava "Online" con un token morto.
2. Il fallback foto in `showUserInfo()` faceva solo `display = 'none'`: lasciava
   l'`<img>` rotta invece di mostrare qualcosa.

## Fix
- **`getUserInfo()`**: distingue il token morto. Su **401/403 rilancia** l'errore →
  `useRestoredToken()` cattura → `clearStoredToken()` + `requestSilentRenewal()`.
  Se Google riconosce ancora la sessione, rinnova il token **senza popup** e la foto
  torna; altrimenti ricompare il pulsante "Accedi con Google".
  (Aggiunto anche check `oauthResponse.ok` prima di fare `.json()`.)
- **`showUserInfo()`**: la foto si vede **sempre** da loggati.
  - Nuovo helper `buildInitialAvatar(name)` → avatar SVG con l'iniziale del nome
    (sorgente `<img>` sempre valida, mai icona rotta).
  - `onerror` sull'`<img>`: se la foto Google non carica (URL scaduto/bloccato/404)
    passa all'avatar iniziale.
  - `referrerPolicy = 'no-referrer'`: fix noto per le foto
    `lh3.googleusercontent.com` che a volte vengono bloccate dal referer.

## File toccati
- `js/google-auth.js` (getUserInfo, showUserInfo, nuovo buildInitialAvatar, banner)
- `js/config.js` (version 2.5.49, fullName, lastUpdate)
- `index.html` (title, header data-version, cache-bust config.js + google-auth.js)

## Nota
Il login resta **in locale** (token in localStorage) come concordato; il backend
verrà dopo. Questo fix rende solo il ripristino sessione onesto: token valido →
resti loggato; token morto → rinnovo silenzioso o pulsante di login, mai più
"finto loggato" con foto rotta.
