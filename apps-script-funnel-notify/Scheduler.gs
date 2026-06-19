/**
 * Massaggiatore (TESTmess) — Funnel Notify — Scheduler.gs
 * v1.0.0
 *
 * Cuore del sistema. Il trigger ogni 5 minuti chiama checkFunnelNotifications():
 * scorre gli eventi "LEAD - Call", per ogni stamp dovuto (e non confermato/non già
 * inviato) chiama ogni notifier attivo e marca l'invio in modo persistente.
 *
 * Anti-duplicato: PropertiesService, chiave 'sent_<notifierId>_<eventId>_<stampKey>'
 * (prefisso DISTINTO dal Twilio 'notified_', così i due Apps Script non si pestano).
 */

// ===== TRIGGER PRINCIPALE (ogni 5 minuti) =====
function checkFunnelNotifications() {
  if (!CONFIG.SHEET_ID) {
    Logger.log('⚠️ SHEET_ID non configurato → stop (nessun invio). Incolla l\'ID in Config.gs.');
    return;
  }

  var props = PropertiesService.getScriptProperties();
  var nowMs = new Date().getTime();
  var finestraInizio = new Date(nowMs - CONFIG.FINESTRA_MS);
  // v2.5.67: finestra futura ampia (default 5') usata sotto per-calendario.
  var finestraFineNarrow = new Date(nowMs + 5 * 60 * 1000);
  var finestraFineWide   = new Date(nowMs + CONFIG.FUTURE_MS);

  FunnelStore.load(); // pre-carica il foglio una volta per esecuzione

  var cals = CalendarApp.getAllCalendars();
  var visti = 0;
  for (var c = 0; c < cals.length; c++) {
    var cal = cals[c];
    var calMatch = cal.getName().toLowerCase().indexOf(CONFIG.CAL_MATCH) !== -1;

    // v2.5.67: T0 = creazione evento → un lead può prenotare una call FUTURA ma il funnel parte
    // dalla creazione. Sui calendari "LEAD - Call" scansiono anche gli eventi futuri; sugli altri
    // resto stretto (eventi titolati "lead - call" iniziati di recente). Il cutoff + dedup evitano spam.
    var eventi;
    try {
      eventi = cal.getEvents(finestraInizio, calMatch ? finestraFineWide : finestraFineNarrow);
    } catch (e) {
      continue;
    }

    for (var i = 0; i < eventi.length; i++) {
      var ev = eventi[i];
      if (ev.isAllDayEvent()) continue;
      var titolo = (ev.getTitle() || '').trim().toLowerCase();
      if (!calMatch && titolo !== CONFIG.CAL_MATCH) continue;
      visti++;
      processaEventoFunnel_(ev, props, nowMs, false);
    }
  }

  pulisciVecchieChiavi_(props, nowMs);
  Logger.log('✅ checkFunnelNotifications: %s eventi "LEAD - Call" valutati.', visti);
}

// ===== VALUTA UN EVENTO SU TUTTE LE SOGLIE =====
// dryRun=true → non invia e non marca (solo log). Usato da test().
function processaEventoFunnel_(ev, props, nowMs, dryRun) {
  var eventId = ev.getId();
  var apptStart = ev.getStartTime(); // orario APPUNTAMENTO (start) — non più T0, tenuto per l'email

  var desc = ev.getDescription() || '';
  var telefono = estraiTelefonoFunnel_(desc);
  var leadKey = telefono ? ('tel:' + telefono.replace(/\D/g, '')) : '';

  var rec = FunnelStore.getLead(telefono, leadKey); // può essere null (lead non ancora nel foglio)

  // 🕒 v2.5.67: T0 del funnel = CREAZIONE dell'evento (ingresso reale), NON l'orario appuntamento.
  // Preferenza: createdISO dal foglio → ev.getDateCreated() → fallback ev.getStartTime().
  var t0 = _funnelEventCreated_(ev, rec);
  var t0Ms = t0.getTime();

  // 🛡️ v2.5.67: CUTOFF non-retroattivo. Evento creato PRIMA del cutoff → salto senza inviare né
  // marcare (niente mail indietro nel tempo), a prescindere dallo stato. Barriera hard.
  var cutoffMs = funnelCutoffMs_();
  if (cutoffMs && t0Ms < cutoffMs) {
    Logger.log('🛡️ Evento creato prima del cutoff → salto (no mail): %s (creato %s)',
               ev.getTitle(), FunnelNotify_fmtDataIt(t0));
    return;
  }

  // 🚦 v2.5.67: invio SOLO se lo stato è "pending". "confermato"/"no" → funnel fermo.
  // Lead sconosciuto/cella vuota → 'pending' (default), ma il cutoff qui sopra protegge i vecchi.
  var status = FunnelStore.getStatus(telefono, leadKey);
  if (status !== 'pending') {
    Logger.log('🚦 Stato "%s" (≠ pending) → funnel fermo, salto evento: %s', status, ev.getTitle());
    return;
  }

  for (var k = 0; k < CONFIG.SOGLIE.length; k++) {
    var stamp = CONFIG.SOGLIE[k];
    var sogliaMs = t0Ms + stamp.h * 60 * 60 * 1000;

    if (nowMs < sogliaMs) continue;                         // non ancora dovuto
    var stale = nowMs > sogliaMs + CONFIG.TOLLERANZA_MS;    // troppo in ritardo (>3h)

    var lead = null; // costruito una sola volta, solo se serve

    for (var n = 0; n < NOTIFIERS.length; n++) {
      var notifier = NOTIFIERS[n];
      if (!notifier.isEnabled()) continue;

      var key = 'sent_' + notifier.id + '_' + eventId + '_' + stamp.key;
      if (props.getProperty(key)) continue;                 // già inviato (questo canale)

      if (stale) {
        // Stamp vecchio: marca SENZA inviare (no raffiche di arretrati).
        if (!dryRun) props.setProperty(key, String(nowMs));
        Logger.log('⏰ [%s] stamp T+%sh scaduto da >3h → marco senza inviare: %s',
                   notifier.id, stamp.h, ev.getTitle());
        continue;
      }

      if (!lead) lead = buildLeadFromEvent_(ev, t0, apptStart, telefono, rec);

      if (dryRun) {
        Logger.log('🧪 [DRY-RUN] %s INVIEREBBE T+%sh a "%s" (%s)',
                   notifier.id, stamp.h, lead.nome, lead.telefono || 's/n');
        continue;
      }

      var ok = notifier.send(lead, stamp);
      // Marco DOPO il tentativo: 1 solo invio per (canale, evento, stamp), niente raffiche.
      // (Se un giorno vuoi ritentare sugli errori: marca solo se ok === true.)
      props.setProperty(key, String(nowMs));
      if (!ok) Logger.log('⚠️ [%s] send() ha ritornato false (marco comunque): %s', notifier.id, ev.getTitle());
    }
  }
}

// ===== COSTRUISCI L'OGGETTO LEAD PER I NOTIFIER =====
// v2.5.67: t0 = CREAZIONE evento (ingresso, base degli stamp); apptStart = orario appuntamento.
function buildLeadFromEvent_(ev, t0, apptStart, telefono, rec) {
  var nome = (rec && rec.nome) ? rec.nome : (ev.getTitle() || 'LEAD - Call').trim();
  var code = (rec && rec.codice) ? rec.codice : '';
  var appLink = code ? (CONFIG.APP_BASE_URL + '?id=' + encodeURIComponent(code)) : CONFIG.APP_BASE_URL;
  var eventLink = '';
  try { eventLink = ev.getHtmlLink(); } catch (e) { eventLink = ''; }

  return {
    nome: nome,
    telefono: telefono || (rec ? rec.telefono : '') || '',
    t0: t0,                 // = creazione evento (ingresso lead)
    apptStart: apptStart,   // = orario appuntamento (start evento)
    eventTitle: (ev.getTitle() || '').trim(),
    eventLink: eventLink,
    appLink: appLink,
    code: code,
    eventId: ev.getId()
  };
}

// ===== v2.5.67: T0 = CREAZIONE evento (ingresso). createdISO dal foglio → getDateCreated() → start =====
function _funnelEventCreated_(ev, rec) {
  if (rec && rec.createdISO) {
    var d = new Date(rec.createdISO);
    if (!isNaN(d.getTime())) return d;
  }
  try {
    var c = ev.getDateCreated();
    if (c && !isNaN(c.getTime())) return c;
  } catch (e) { /* alcuni eventi non espongono getDateCreated → fallback */ }
  return ev.getStartTime();
}

// ===== v2.5.67: cutoff non-retroattivo in ms (0 se assente/illeggibile = nessun blocco) =====
function funnelCutoffMs_() {
  if (!CONFIG.FUNNEL_CUTOFF_ISO) return 0;
  var t = new Date(CONFIG.FUNNEL_CUTOFF_ISO).getTime();
  return isNaN(t) ? 0 : t;
}

// ===== TELEFONO LEAD dalla description (wa.me → Telefono: → +prefisso) =====
function estraiTelefonoFunnel_(desc) {
  if (!desc) return '';
  var s = String(desc), m;
  m = s.match(/wa\.me\/(\+?\d{6,})/i);                       if (m) return _normTelFunnel_(m[1]);
  m = s.match(/telefono\s*[:\-]?\s*(\+?[\d\s().\-]{6,})/i);  if (m) return _normTelFunnel_(m[1]);
  m = s.match(/(\+\d[\d\s().\-]{7,})/);                      if (m) return _normTelFunnel_(m[1]);
  return '';
}
function _normTelFunnel_(raw) {
  return String(raw).replace(/[^\d+]/g, '');
}

// ===== FORMAT DATA IT (usato anche da Notifiers.gs) =====
function FunnelNotify_fmtDataIt(d) {
  if (!d) return '(orario sconosciuto)';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

// ===== PULIZIA chiavi dedup > 48h =====
function pulisciVecchieChiavi_(props, nowMs) {
  var tutte = props.getProperties();
  for (var key in tutte) {
    if (key.indexOf('sent_') !== 0) continue;
    var ts = parseInt(tutte[key], 10);
    if (isNaN(ts) || (nowMs - ts) > CONFIG.PULIZIA_MS) {
      props.deleteProperty(key);
    }
  }
}

// ===== SETUP — lancia A MANO una volta: crea il trigger ogni 5 minuti =====
function setup() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkFunnelNotifications') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkFunnelNotifications').timeBased().everyMinutes(5).create();
  Logger.log('✅ Trigger creato: checkFunnelNotifications ogni 5 minuti.');
}

// ===== TEST (dry-run) — NESSUN invio. Mostra cosa verrebbe inviato adesso =====
function test() {
  if (!CONFIG.SHEET_ID) { Logger.log('⚠️ Incolla prima SHEET_ID in Config.gs.'); return; }
  var props = PropertiesService.getScriptProperties();
  var nowMs = new Date().getTime();
  var finestraInizio = new Date(nowMs - CONFIG.FINESTRA_MS);
  var finestraFineNarrow = new Date(nowMs + 5 * 60 * 1000);
  var finestraFineWide   = new Date(nowMs + CONFIG.FUTURE_MS);

  FunnelStore.load();
  Logger.log('--- TEST (DRY-RUN): nessuna email verrà inviata ---');

  var cals = CalendarApp.getAllCalendars(), valutati = 0;
  for (var c = 0; c < cals.length; c++) {
    var cal = cals[c];
    var calMatch = cal.getName().toLowerCase().indexOf(CONFIG.CAL_MATCH) !== -1;
    var eventi;
    try { eventi = cal.getEvents(finestraInizio, calMatch ? finestraFineWide : finestraFineNarrow); } catch (e) { continue; }
    for (var i = 0; i < eventi.length; i++) {
      var ev = eventi[i];
      if (ev.isAllDayEvent()) continue;
      var titolo = (ev.getTitle() || '').trim().toLowerCase();
      if (!calMatch && titolo !== CONFIG.CAL_MATCH) continue;
      valutati++;
      processaEventoFunnel_(ev, props, nowMs, true); // dryRun
    }
  }
  Logger.log('--- TEST finito: %s eventi "LEAD - Call" valutati ---', valutati);
}

// ===== TEST INVIO REALE — manda UNA email di prova (per verificare formato/consegna) =====
function testSendOnce() {
  var leadFinto = {
    nome: 'Mario Rossi (TEST)',
    telefono: '+39 333 1234567',
    t0: new Date(),
    apptStart: new Date(),
    eventTitle: 'LEAD - Call',
    eventLink: 'https://calendar.google.com/',
    appLink: CONFIG.APP_BASE_URL + '?id=L0001',
    code: 'L0001',
    eventId: 'TEST'
  };
  var ok = EmailNotifier.send(leadFinto, { key: 'scrivere', h: 2, label: 'Scrivere al lead' });
  Logger.log(ok ? '✅ Email di prova inviata a %s' : '❌ Invio di prova fallito', CONFIG.NOTIFY_EMAIL);
}
