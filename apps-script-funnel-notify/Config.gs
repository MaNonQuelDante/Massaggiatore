/**
 * Massaggiatore (TESTmess) — Funnel Notify — Config.gs
 * v1.0.0 (introdotto con TESTmess v2.5.66)
 *
 * Notifiche automatiche legate al funnel dei lead ("LEAD - Call"). Gira come Google
 * Apps Script autonomo (browser chiuso) su trigger ogni 5 minuti. Per ora invia EMAIL;
 * l'architettura "notifier" è pronta per aggiungere domani WhatsApp/SMS senza toccare
 * scheduling e anti-duplicato.
 *
 * SEPARATO dall'Apps Script Twilio (apps-script-reminder/): quello NON si tocca.
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
  SHEET_ID: '',           // ← INCOLLA QUI L'ID DEL FOGLIO
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
  SOGLIE: [
    { key: 'scrivere',    h: 2, label: 'Scrivere al lead' },
    { key: 'sollecitare', h: 4, label: 'Sollecitare il lead' },
    { key: 'chiamata',    h: 6, label: 'Sollecitare via chiamata' }
  ],

  // Match evento: titolo == 'lead - call' (case-insensitive) o nome calendario lo contiene.
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
