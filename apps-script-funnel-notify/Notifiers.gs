/**
 * Massaggiatore (TESTmess) — Funnel Notify — Notifiers.gs
 * v1.4.0 (TESTmess v2.5.87)
 *
 * CHANGELOG v1.4.0 (TESTmess v2.5.87):
 * - 📝 NUOVO stamp 'crm2h' (reminder "compila CRM", Feature C): oggetto "Nome - Compila CRM
 *      (call ad Andrea)" e corpo dedicato ("Hai esitato il lead <nome> sul CRM e mandato la call
 *      ad Andrea?") con link scheda + evento. Ramo isCrm in EmailNotifier.send + voce in
 *      EMAIL_STEP_LABELS. Lo scheduling/gate (solo confermato) è in Scheduler.gs (_processaCrmReminder_).
 *
 * CHANGELOG v1.3.0 (TESTmess v2.5.81):
 * - ✉️ OGGETTO email = "Nome Cognome - <step>" (niente più prefisso "[Massaggiatore]" né emoji).
 *      Lo <step> dipende dallo stamp (mappa EMAIL_STEP_LABELS): ingresso→"Appena entrato",
 *      scrivere→"Manda primo messaggio", sollecitare→"Manda sollecito", chiamata→"Chiama".
 * - 🧹 CORPO email più pulito: via le parentesi "(creazione evento)" e "(call)", rimossa la riga
 *      esplicativa "🆕 Ingresso lead registrato (T0)." / "⏰ Stamp raggiunto…".
 * - 🔤 Nome ripulito + Title Case anche nell'oggetto/riga Lead (riusa _nomePulitoFunnel_ /
 *      _titleCaseFunnel_ di Scheduler.gs, stesso progetto Apps Script).
 *
 * Notifier intercambiabili. Ognuno espone la stessa interfaccia:
 *   { id: String, isEnabled(): Boolean, send(lead, stamp): Boolean }
 *
 * Lo scheduler (Scheduler.gs) si occupa UNA SOLA VOLTA di: trovare gli stamp dovuti,
 * saltare i lead confermati e fare l'anti-duplicato per (notifier.id, eventId, stamp).
 * Quindi aggiungere un canale = aggiungere un oggetto a NOTIFIERS, senza duplicare logica.
 *
 * lead  = { nome, telefono, t0 (Date=creazione/ingresso), apptStart (Date=appuntamento),
 *           eventTitle, eventLink, appLink, code, eventId }
 * stamp = { key, h, label }   (es. { key:'scrivere', h:2, label:'Scrivere al lead' })
 */

// v2.5.81: mappa stamp.key → "step" mostrato nell'oggetto email ("Nome Cognome - <step>").
// Fallback a stamp.label per chiavi sconosciute (vedi send()).
var EMAIL_STEP_LABELS = {
  ingresso:    'Appena entrato',
  scrivere:    'Manda primo messaggio',
  sollecitare: 'Manda sollecito',
  chiamata:    'Chiama',
  crm2h:       'Compila CRM (call ad Andrea)'   // v2.5.87 Feature C
};

// ===== 📧 EMAIL (attivo) =====
var EmailNotifier = {
  id: 'email',

  isEnabled: function () {
    return !!CONFIG.NOTIFY_EMAIL;
  },

  send: function (lead, stamp) {
    // v2.5.72: lo stamp 'ingresso' (h=0) è la mail "nuovo lead entrato" → copia dedicata.
    var isIngresso = stamp.key === 'ingresso';
    // v2.5.87: lo stamp 'crm2h' è il reminder "compila CRM" (solo confermato) → copia dedicata.
    var isCrm = stamp.key === 'crm2h';

    // v2.5.81: nome ripulito + Title Case ("ARTURO ALVARI: Finanza" → "Arturo Alvari").
    // _nomePulitoFunnel_/_titleCaseFunnel_ vivono in Scheduler.gs (stesso progetto Apps Script).
    var nome = _titleCaseFunnel_(_nomePulitoFunnel_(lead.nome || '')) || (lead.nome || '');

    // v2.5.81: oggetto = "Nome Cognome - <step>". Niente prefisso "[Massaggiatore]" né emoji.
    // v2.5.87: per 'crm2h' lo step = "Compila CRM (call ad Andrea)" (da EMAIL_STEP_LABELS).
    var step = EMAIL_STEP_LABELS[stamp.key] || stamp.label;
    var oggetto = (nome || 'Lead') + ' - ' + step;

    var righe = [];
    if (isCrm) {
      // v2.5.87 Feature C: promemoria operativo (esitazione lead + invio call ad Andrea).
      righe.push('Hai esitato il lead ' + (nome || '(senza nome)') + ' sul CRM e mandato la call ad Andrea?');
      righe.push('');
      righe.push('👤 Lead: ' + (nome || '(senza nome)'));
      if (lead.telefono) righe.push('📞 Telefono: ' + lead.telefono);
      if (lead.apptStart) righe.push('📅 Appuntamento: ' + FunnelNotify_fmtDataIt(lead.apptStart));
    } else {
      righe.push(isIngresso
        ? 'È entrato un nuovo lead (evento creato in calendario).'
        : 'È scaduto uno stamp del funnel per questo lead.');
      righe.push('');
      righe.push('👤 Lead: ' + (nome || '(senza nome)'));
      if (lead.telefono) righe.push('📞 Telefono: ' + lead.telefono);
      // v2.5.81: via la parentesi "(creazione evento)".
      righe.push('🕒 Ingresso lead: ' + FunnelNotify_fmtDataIt(lead.t0));
      // v2.5.81: via la parentesi "(call)".
      if (lead.apptStart) righe.push('📅 Appuntamento: ' + FunnelNotify_fmtDataIt(lead.apptStart));
      // v2.5.81: rimossa la riga esplicativa "🆕 Ingresso lead registrato (T0)." / "⏰ Stamp raggiunto…".
    }
    righe.push('');
    if (lead.eventLink) righe.push('📅 Evento calendario: ' + lead.eventLink);
    if (lead.appLink)   righe.push('📂 Scheda lead: ' + lead.appLink);
    righe.push('');
    righe.push('— TESTmess Funnel Notify');

    var corpo = righe.join('\n');

    try {
      MailApp.sendEmail({
        to: CONFIG.NOTIFY_EMAIL,
        subject: oggetto,
        body: corpo
      });
      Logger.log('📧 Email inviata → %s (%s, T+%sh)', CONFIG.NOTIFY_EMAIL, lead.nome, stamp.h);
      return true;
    } catch (e) {
      Logger.log('❌ Email NON inviata (%s, T+%sh): %s', lead.nome, stamp.h, e);
      return false;
    }
  }
};

// ===== 📱 WHATSAPP (segnaposto, NON attivo) =====
// Domani: implementa send() (es. UrlFetch verso Twilio col template approvato — lo stesso
// dell'apps-script-reminder), aggiungi 'script.external_request' agli scope in appsscript.json
// e inserisci WhatsAppNotifier dentro NOTIFIERS. Scheduling e anti-duplicato sono GIÀ pronti:
// la dedup è per (notifier.id, eventId, stamp), quindi i due canali non si pestano i piedi.
//
// var WhatsAppNotifier = {
//   id: 'whatsapp',
//   isEnabled: function () { return false; },
//   send: function (lead, stamp) { /* ... */ return false; }
// };

// Canali attivi, in ordine. Per ora solo email.
var NOTIFIERS = [EmailNotifier];
