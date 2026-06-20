/**
 * Massaggiatore (TESTmess) — Funnel Notify — Config.gs
 * v1.3.0 (introdotto con TESTmess v2.5.66)
 *
 * Notifiche automatiche legate al funnel dei lead ("LEAD - Call"). Gira come Google
 * Apps Script autonomo (browser chiuso) su trigger ogni 5 minuti. Per ora invia EMAIL;
 * l'architettura "notifier" è pronta per aggiungere domani WhatsApp/SMS senza toccare
 * scheduling e anti-duplicato.
 *
 * SEPARATO dall'Apps Script Twilio (apps-script-reminder/): quello NON si tocca.
 *
 * CHANGELOG v1.3.0 (TESTmess v2.5.81):
 * - ✉️ EMAIL: oggetto "Nome Cognome - <step>" (mappa step in Notifiers.gs), corpo ripulito
 *      (via "(creazione evento)"/"(call)" e la riga esplicativa dello stamp). Vedi Notifiers.gs.
 * - ✨ EVENTO auto-arricchito all'ingresso (Scheduler.gs: arricchisciEventoFunnel_): blocco
 *      contatti in descrizione (📱 WhatsApp / 📞 Chiama / 📂 Scheda lead, usa APP_BASE_URL) +
 *      titolo "Nome Cognome". Server-side, browser chiuso, una volta sola per evento. Meet escluso.
 * - ⚠️ Richiede REDEPLOY manuale (copia i .gs aggiornati nell'editor di script.google.com).
 *
 * CHANGELOG v1.2.0 (TESTmess v2.5.72):
 * - 🆕 Stamp di INGRESSO (h=0): appena il lead entra (evento creato) parte la mail "nuovo lead
 *      entrato". Soggetto a TOLLERANZA_MS come gli altri stamp (eventi creati da >3h → marcati
 *      senza inviare, niente raffica di ingressi arretrati).
 * - 📅 FOLLOWUP: il funnel ora vale anche per il calendario "FOLLOWUP" (oltre a "LEAD - Call").
 *      Match calendario/titolo centralizzato in CONFIG.CAL_MATCHES + funnelCalMatches_/funnelTitleMatches_.
 * - ⚠️ Richiede REDEPLOY manuale di questo Apps Script (copia i .gs aggiornati nell'editor).
 *
 * CHANGELOG v1.1.0 (TESTmess v2.5.67):
 * - 🕒 T0 del funnel = data di CREAZIONE dell'evento "LEAD - Call" (ingresso reale del lead),
 *      NON più l'orario di inizio appuntamento. Stamp T+2/4/6h dal createdISO.
 * - 🚦 Stato a 3 valori (confermato|pending|no): mail SOLO se "pending". Confermato/No fermano.
 * - 🛡️ NON retroattivo: FUNNEL_CUTOFF_ISO. Eventi creati PRIMA del cutoff → saltati (niente mail
 *      indietro nel tempo), anche se per errore lo stato risultasse "pending".
 * - 🔭 Finestra di scansione allargata al futuro sui calendari "LEAD - Call" (appuntamenti
 *      futuri creati da poco devono comunque ricevere il funnel basato sulla creazione).
 *
 * CHANGELOG v1.0.0:
 * - ⏰ Scheduler time-based (5') sugli eventi "LEAD - Call"
 * - 📧 EmailNotifier (MailApp) → CONFIG.NOTIFY_EMAIL
 * - 🔄 Stop funnel quando il lead è "Confermato" (letto dal Google Sheet mirror)
 * - ✅ Anti-duplicato persistente per (notifier, evento, stamp) su PropertiesService
 *
 * ⚠️ Prima dell'avvio: incolla SHEET_ID qui sotto e lancia setup() una volta.
 *    Finché SHEET_ID è vuoto, lo scheduler NON invia (fail-safe).
 */

var CONFIG = {
  // Destinatario delle email (UNICA costante da non hardcodare altrove).
  NOTIFY_EMAIL: 'dante.consulenze@gmail.com',

  // ID del Google Sheet "Funnel Lead" che il web app popola (mirror dello stato funnel).
  // Lo trovi nell'URL del foglio: .../spreadsheets/d/<QUESTO>/edit
  SHEET_ID: '1Mclh4ua8_7a9d6nmOTh1WXxOGW0rXw5cNkXVLennQDE',  // v2.5.68: foglio "Massaggiatore - Funnel Lead" (stesso ID in js/config.js)
  SHEET_TAB: 'LEADS',     // tab con le righe lead
  LOG_TAB: 'LOG',         // tab di log invii (creata al volo se manca)

  // Base URL dell'app per il link "scheda lead" nell'email (?id=Lxxxx).
  APP_BASE_URL: 'https://manonqueldante.github.io/Massaggiatore/',

  // v2.5.67: CUTOFF non-retroattivo. Il funnel/email valgono SOLO per eventi CREATI da questo
  // istante in poi. Eventi creati prima → saltati senza inviare (doppia barriera oltre allo stato).
  // DEVE essere identico a window.APP_CONFIG.FUNNEL_CUTOFF_ISO in js/config.js (front-end).
  FUNNEL_CUTOFF_ISO: '2026-06-19T11:52:00+02:00',

  // v2.5.67: stamp del funnel da notificare. Soglie da T0 = CREAZIONE evento (ingresso), NON
  // cumulative. Allineate a LEAD_CHECKLIST_STEPS del front-end (scrivere=2h, sollecitare=4h, chiamata=6h).
  // v2.5.72: aggiunto lo stamp di INGRESSO (h=0): appena il lead entra (evento creato) parte la mail
  // "nuovo lead entrato". Gli altri restano soglie da T0=creazione (NON cumulative). Lo stamp ingresso,
  // come gli altri, è soggetto a TOLLERANZA_MS: per eventi creati da >3h viene marcato senza inviare
  // (niente raffica di "ingressi" arretrati al primo giro dello scheduler).
  SOGLIE: [
    { key: 'ingresso',    h: 0, label: 'Ingresso lead' },
    { key: 'scrivere',    h: 2, label: 'Scrivere al lead' },
    { key: 'sollecitare', h: 4, label: 'Sollecitare il lead' },
    { key: 'chiamata',    h: 6, label: 'Sollecitare via chiamata' }
  ],

  // Match evento: l'evento è "del funnel" se il NOME del calendario contiene una delle CAL_MATCHES,
  // oppure se il TITOLO dell'evento è esattamente TITLE_MATCH (convenzione legacy sul titolo).
  // v2.5.72: oltre a "LEAD - Call" rientra anche "FOLLOWUP" (i due calendari che contengono lead).
  CAL_MATCHES: ['lead - call', 'followup', 'follow up', 'follow-up'],
  TITLE_MATCH: 'lead - call',
  // Retrocompat: log/funzioni che usano ancora CONFIG.CAL_MATCH (= prima voce di CAL_MATCHES).
  CAL_MATCH: 'lead - call',

  // Stesse tolleranze del Twilio: niente raffiche di arretrati, finestra di lettura, pulizia.
  TOLLERANZA_MS: 3 * 60 * 60 * 1000,   // stamp passato da >3h → marca senza inviare
  FINESTRA_MS:   12 * 60 * 60 * 1000,  // leggo eventi iniziati nelle ultime ~12h
  // v2.5.67: con T0=creazione, un lead può prenotare una call FUTURA ma il funnel deve partire
  // dalla creazione (oggi). Sui calendari "LEAD - Call" scansiono anche gli eventi che INIZIANO
  // nei prossimi N giorni, così quelli creati di recente ma datati avanti vengono comunque valutati.
  FUTURE_MS:     92 * 24 * 60 * 60 * 1000,  // ~3 mesi avanti (solo calendari "LEAD - Call")
  PULIZIA_MS:    48 * 60 * 60 * 1000   // chiavi dedup più vecchie di 48h → cancellate
};
