/**
 * Massaggiatore (TESTmess) — Funnel Notify — Config.gs
 * v1.5.0 (introdotto con TESTmess v2.5.66)
 *
 * Notifiche automatiche legate al funnel dei lead ("LEAD - Call"). Gira come Google
 * Apps Script autonomo (browser chiuso) su trigger ogni 5 minuti. Per ora invia EMAIL;
 * l'architettura "notifier" è pronta per aggiungere domani WhatsApp/SMS senza toccare
 * scheduling e anti-duplicato.
 *
 * SEPARATO dall'Apps Script Twilio (apps-script-reminder/): quello NON si tocca.
 *
 * ⚠️⚠️ REDEPLOY MANUALE (v1.5.0 / TESTmess v2.5.87): dopo il commit ricopia i .gs aggiornati
 *    nell'editor di script.google.com E RILANCIA setup() UNA VOLTA, perché v1.5.0 aggiunge un
 *    NUOVO trigger giornaliero (dailyLeadDigest @08:00) che esiste solo dopo aver rieseguito setup().
 *    Il trigger checkFunnelNotifications ogni 5' NON viene toccato.
 *
 * CHANGELOG v1.5.0 (TESTmess v2.5.87):
 * - 🌙 FEATURE A (quiet hours): gli stamp del funnel (tranne 'ingresso') che cadono dopo le 19:00
 *      (o di notte, < 09:00) NON partono in quel momento ma slittano alle 09:00 del mattino utile
 *      successivo. Nuova _applyQuietHours_ in Scheduler.gs; la TOLLERANZA stale è calcolata sulla
 *      soglia SLITTATA (altrimenti uno stamp serale slittato verrebbe marcato stale e mai inviato).
 * - 📋 FEATURE B (digest giornaliero): nuovo trigger @08:00 dailyLeadDigest() → UNA mail con due
 *      blocchi (✅ Confermati di oggi · ⏳ In attesa di conferma di oggi); 'no' esclusi; niente
 *      mail se entrambi vuoti.
 * - 📝 FEATURE C (reminder CRM): nuovo stamp 'crm2h' = apptStart + 2h che — al contrario del funnel
 *      normale — invia SOLO se status='confermato' ("Compila CRM / call ad Andrea"). Ramo dedicato
 *      con dedup 'sent_email_<eventId>_crm2h', stessa meccanica stale/cutoff e quiet-hours.
 *
 * CHANGELOG v1.4.0 (TESTmess v2.5.82):
 * - 🎥 Il Meet entra nell'arricchimento evento (Scheduler.gs: arricchisciEventoFunnel_ +
 *      _ensureMeetServerSide_), creato/recuperato via Advanced Calendar Service (Calendar.Events).
 * - 🔐 appsscript.json: scope calendar.readonly → "calendar" (PIENO) perché ora scriviamo
 *      sull'evento, e aggiunto l'Advanced Calendar Service (Calendar v3).
 * - ⚠️ REDEPLOY: oltre a ricopiare i .gs, nell'editor abilita Servizi → Google Calendar API
 *      (identificatore "Calendar") e ri-autorizza (lancia setup() o test() una volta).
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

  // v2.5.87 FEATURE A — QUIET HOURS: uno stamp del funnel che cade a/oltre QUIET_AFTER_H (sera) o
  // prima di QUIET_MORNING_H (notte) NON parte in quel momento ma slitta alle QUIET_MORNING_H:00 del
  // mattino utile successivo (vedi _applyQuietHours_ in Scheduler.gs). Lo stamp 'ingresso' (h=0) è ESCLUSO
  // (la mail "nuovo lead entrato" deve partire subito).
  QUIET_AFTER_H:   19,   // ora (locale Europe/Rome) a partire dalla quale si slitta
  QUIET_MORNING_H: 9,    // ora del mattino "utile" a cui si slitta

  // v2.5.87 FEATURE C — REMINDER CRM: stamp dedicato 'crm2h' = orario APPUNTAMENTO + CRM_REMINDER_H.
  // A differenza del funnel normale (solo 'pending') questo parte SOLO se status='confermato'.
  CRM_REMINDER_H:  2,    // ore dopo l'appuntamento per il promemoria "compila CRM"

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
