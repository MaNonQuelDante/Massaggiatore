/**
 * Massaggiatore (TESTmess) — Funnel Notify — Notifiers.gs
 * v1.0.0
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

// ===== 📧 EMAIL (attivo) =====
var EmailNotifier = {
  id: 'email',

  isEnabled: function () {
    return !!CONFIG.NOTIFY_EMAIL;
  },

  send: function (lead, stamp) {
    // v2.5.72: lo stamp 'ingresso' (h=0) è la mail "nuovo lead entrato" → copia dedicata.
    var isIngresso = stamp.key === 'ingresso';
    var oggetto = isIngresso
      ? '[Massaggiatore] 🆕 Nuovo lead entrato · ' + (lead.nome || 'Lead')
      : '[Massaggiatore] Stamp T+' + stamp.h + 'h · ' + (lead.nome || 'Lead');

    var righe = [];
    righe.push(isIngresso
      ? 'È entrato un nuovo lead (evento creato in calendario).'
      : 'È scaduto uno stamp del funnel per questo lead.');
    righe.push('');
    righe.push('👤 Lead: ' + (lead.nome || '(senza nome)'));
    if (lead.telefono) righe.push('📞 Telefono: ' + lead.telefono);
    righe.push('🕒 Ingresso lead (creazione evento): ' + FunnelNotify_fmtDataIt(lead.t0));
    if (lead.apptStart) righe.push('📅 Appuntamento (call): ' + FunnelNotify_fmtDataIt(lead.apptStart));
    righe.push(isIngresso
      ? '🆕 Ingresso lead registrato (T0).'
      : '⏰ Stamp raggiunto: T+' + stamp.h + 'h dall\'ingresso — ' + stamp.label);
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
