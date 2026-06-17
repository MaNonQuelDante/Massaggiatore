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

  // Stamp del funnel da notificare. Soglie da T0 (inizio evento), NON cumulative.
  // Allineate a LEAD_CHECKLIST_STEPS del front-end (scrivere=2h, sollecitare=4h, chiamata=6h).
  SOGLIE: [
    { key: 'scrivere',    h: 2, label: 'Scrivere al lead' },
    { key: 'sollecitare', h: 4, label: 'Sollecitare il lead' },
    { key: 'chiamata',    h: 6, label: 'Sollecitare via chiamata' }
  ],

  // Match evento: titolo == 'lead - call' (case-insensitive) o nome calendario lo contiene.
  CAL_MATCH: 'lead - call',

  // Stesse tolleranze del Twilio: niente raffiche di arretrati, finestra di lettura, pulizia.
  TOLLERANZA_MS: 3 * 60 * 60 * 1000,   // stamp passato da >3h → marca senza inviare
  FINESTRA_MS:   12 * 60 * 60 * 1000,  // leggo eventi delle ultime ~12h
  PULIZIA_MS:    48 * 60 * 60 * 1000   // chiavi dedup più vecchie di 48h → cancellate
};
