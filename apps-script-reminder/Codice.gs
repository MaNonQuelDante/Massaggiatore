/**
 * Massaggiatore (TESTmess) — Reminder Lead "LEAD - Call" -> WhatsApp via Twilio
 *
 * Componente del progetto Massaggiatore (cartella apps-script-reminder/), ma
 * SEPARATO dall'app web: NON è caricato da index.html. Gira come Google Apps
 * Script autonomo su trigger temporale ogni 5 minuti. Versionato col progetto.
 *
 * Pattern: trigger temporale + dedup su PropertiesService (come l'Apps Script email).
 *
 * STATO: architettura pronta. Twilio ancora da creare -> le credenziali sono solo
 * placeholder in Script Properties (vedi note in fondo / inviaTwilio_). Nessun valore
 * reale è hardcoded qui.
 */

// Soglie da T0 (orario inizio evento), NON cumulative. Reminder DOPO l'appuntamento.
var SOGLIE = [
  { h: 2, azione: 'Scrivere al lead' },
  { h: 4, azione: 'Sollecitare il lead' },
  { h: 6, azione: 'Sollecitare via chiamata' }
];

var TOLLERANZA_MS = 3 * 60 * 60 * 1000;   // oltre soglia+3h: salta e marca (no arretrati)
var FINESTRA_MS   = 12 * 60 * 60 * 1000;  // leggo eventi delle ultime ~12h (copre +6h con margine)
var PULIZIA_MS    = 48 * 60 * 60 * 1000;  // chiavi dedup più vecchie di 48h -> cancellate

/**
 * FUNZIONE PRINCIPALE — la lancia il trigger ogni 5 minuti.
 */
function checkLeadReminders() {
  var props = PropertiesService.getScriptProperties();
  var nowMs = new Date().getTime();
  var finestraInizio = new Date(nowMs - FINESTRA_MS);
  var finestraFine   = new Date(nowMs + 5 * 60 * 1000); // piccolo margine in avanti

  var cals = CalendarApp.getAllCalendars();
  for (var c = 0; c < cals.length; c++) {
    var cal = cals[c];
    // Match: nome calendario contiene "lead - call" -> tutti gli eventi valgono
    var calMatch = cal.getName().toLowerCase().indexOf('lead - call') !== -1;

    var eventi;
    try {
      eventi = cal.getEvents(finestraInizio, finestraFine);
    } catch (e) {
      continue; // calendario non leggibile: salto
    }

    for (var i = 0; i < eventi.length; i++) {
      var ev = eventi[i];
      if (ev.isAllDayEvent()) continue; // serve un orario preciso come T0
      // Match alternativo: titolo == "lead - call" (case-insensitive).
      // (Se i tuoi titoli contengono anche il nome del lead e NON usi un calendario
      //  dedicato, cambia "=== 'lead - call'" in ".indexOf('lead - call') === 0")
      var titolo = (ev.getTitle() || '').trim().toLowerCase();
      if (!calMatch && titolo !== 'lead - call') continue;

      processaEvento_(ev, props, nowMs);
    }
  }

  pulisciVecchieChiavi_(props, nowMs);
}

/**
 * Per un evento, valuta le 3 soglie e invia/marca dove serve.
 */
function processaEvento_(ev, props, nowMs) {
  var t0 = ev.getStartTime().getTime();
  var eventId = ev.getId();
  var dati = null; // costruisco i dati una sola volta, solo se serve inviare

  for (var k = 0; k < SOGLIE.length; k++) {
    var soglia = SOGLIE[k];
    var key = 'notified_' + eventId + '_' + soglia.h;

    if (props.getProperty(key)) continue;            // già notificato
    var sogliaMs = t0 + soglia.h * 60 * 60 * 1000;
    if (nowMs < sogliaMs) continue;                  // non ancora dovuto

    // Troppo in ritardo (> soglia + 3h): marca SENZA inviare (no raffiche di arretrati)
    if (nowMs > sogliaMs + TOLLERANZA_MS) {
      props.setProperty(key, String(nowMs));
      continue;
    }

    if (!dati) dati = buildMessageData_(ev);
    var valori = {
      summary: dati.summary,
      dataOra: dati.dataOra,
      azione: soglia.azione,
      telefono: dati.telefono,
      setter: dati.setter
    };

    inviaTwilio_(valori, false);
    // Marco DOPO il tentativo per garantire 1 solo invio per (evento, soglia) ed evitare raffiche.
    // (Se preferisci ritentare in caso di errore Twilio: marca solo se inviaTwilio_ ritorna true.)
    props.setProperty(key, String(nowMs));
  }
}

/**
 * Estrae i valori del messaggio dall'evento. Una riga per valore, senza etichette.
 */
function buildMessageData_(ev) {
  var desc = ev.getDescription() || '';
  var setter = estraiSetter_(desc); // SOLO fonti esplicite, altrimenti NOSETTER
  return {
    summary: (ev.getTitle() || 'LEAD - Call').trim(),
    dataOra: fmtDataIt_(ev.getStartTime()),
    telefono: estraiTelefono_(desc),
    setter: setter ? setter : 'NOSETTER'
  };
}

/**
 * Setter — REGOLA CRITICA: solo da fonti esplicite della description.
 * Nessun fallback al nome account o a default. Se non c'è -> stringa vuota (poi NOSETTER).
 */
function estraiSetter_(desc) {
  if (!desc) return '';
  var m = String(desc).match(/(?:setter|assistente|operatore)\s*[:\-]\s*(.+)/i);
  if (m) {
    var nome = m[1].split(/[\r\n<]/)[0].replace(/<[^>]*>/g, '').trim();
    if (nome) return nome;
  }
  return '';
}

/**
 * Telefono lead: cerca wa.me/<num>, poi "Telefono:", poi un +<prefisso>...
 */
function estraiTelefono_(desc) {
  if (!desc) return '';
  var s = String(desc);
  var m;
  m = s.match(/wa\.me\/(\+?\d{6,})/i);                       if (m) return normTel_(m[1]);
  m = s.match(/telefono\s*[:\-]?\s*(\+?[\d\s().\-]{6,})/i);  if (m) return normTel_(m[1]);
  m = s.match(/(\+\d[\d\s().\-]{7,})/);                      if (m) return normTel_(m[1]);
  return '';
}

function normTel_(raw) {
  return String(raw).replace(/[^\d+]/g, '');
}

function fmtDataIt_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

/**
 * Invio Twilio WhatsApp con TEMPLATE utility approvato (ContentSid + ContentVariables).
 * Tutto da Script Properties. dryRun=true -> solo log, nessuna chiamata reale.
 *
 * IMPORTANTE: il template approvato deve avere 5 variabili {{1}}..{{5}}, nell'ordine:
 *   {{1}} nome lead/appuntamento  {{2}} data e ora  {{3}} azione  {{4}} telefono  {{5}} setter
 * Se il tuo template ha una struttura diversa, adatta la mappa contentVars qui sotto.
 */
function inviaTwilio_(valori, dryRun) {
  var props = PropertiesService.getScriptProperties();
  var sid         = props.getProperty('TWILIO_ACCOUNT_SID');
  var token       = props.getProperty('TWILIO_AUTH_TOKEN');
  var from        = (props.getProperty('TWILIO_FROM') || '').replace(/[^\d]/g, '');
  var templateSid = props.getProperty('TWILIO_TEMPLATE_SID');
  var destRaw     = props.getProperty('DEST_NUMBERS') || '';

  var dests = destRaw.split(',')
    .map(function (x) { return x.replace(/[^\d]/g, ''); })
    .filter(function (x) { return x.length > 0; });

  // Anteprima testuale (per log). Twilio rifiuta variabili vuote -> uso "-".
  var corpo = [
    valori.summary, valori.dataOra, valori.azione,
    valori.telefono || '-', valori.setter || 'NOSETTER'
  ].join('\n');

  var contentVars = JSON.stringify({
    '1': valori.summary  || '-',
    '2': valori.dataOra  || '-',
    '3': valori.azione   || '-',
    '4': valori.telefono || '-',
    '5': valori.setter   || 'NOSETTER'
  });

  if (dryRun) {
    Logger.log('[DRY-RUN] Twilio NON chiamato.');
    Logger.log('[DRY-RUN] Destinatari: %s', dests.join(', ') || '(nessuno)');
    Logger.log('[DRY-RUN] TemplateSid: %s', templateSid || '(mancante)');
    Logger.log('[DRY-RUN] Valori:\n%s', corpo);
    return true;
  }

  if (!sid || !token || !from || !templateSid) {
    Logger.log('ERRORE: credenziali Twilio incomplete (SID/Token/From/TemplateSid). Invio saltato.');
    return false;
  }
  if (dests.length === 0) {
    Logger.log('ERRORE: DEST_NUMBERS vuoto. Invio saltato.');
    return false;
  }

  var url  = 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json';
  var auth = 'Basic ' + Utilities.base64Encode(sid + ':' + token);
  var tuttoOk = true;

  for (var i = 0; i < dests.length; i++) {
    var payload = {
      'From': 'whatsapp:+' + from,
      'To': 'whatsapp:+' + dests[i],
      'ContentSid': templateSid,
      'ContentVariables': contentVars
    };
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { Authorization: auth },
      payload: payload,
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) {
      Logger.log('Twilio OK (%s) -> %s', code, dests[i]);
    } else {
      tuttoOk = false;
      Logger.log('Twilio ERRORE (%s) -> %s : %s', code, dests[i], resp.getContentText());
    }
  }
  return tuttoOk;
}

/**
 * Pulisce le chiavi dedup più vecchie di 48h per non gonfiare lo storage.
 */
function pulisciVecchieChiavi_(props, nowMs) {
  var tutte = props.getProperties();
  for (var key in tutte) {
    if (key.indexOf('notified_') !== 0) continue;
    var ts = parseInt(tutte[key], 10);
    if (isNaN(ts) || (nowMs - ts) > PULIZIA_MS) {
      props.deleteProperty(key);
    }
  }
}

/**
 * SETUP — lanciala A MANO una volta: crea il trigger ogni 5 minuti.
 * Rimuove eventuali trigger duplicati della stessa funzione.
 */
function setup() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkLeadReminders') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkLeadReminders').timeBased().everyMinutes(5).create();
  Logger.log('Trigger creato: checkLeadReminders ogni 5 minuti.');
}

/**
 * TEST — verifica la logica SENZA chiamare Twilio (dryRun). Niente spesa.
 * Guarda l'output in "Esecuzioni"/Log.
 */
function test() {
  var descConSetter = 'Lead interessato.\nTelefono: +39 333 1234567\nSetter: Marco Rossi\nhttps://wa.me/393331234567';
  var dati = {
    summary: 'LEAD - Call - Mario Bianchi',
    dataOra: fmtDataIt_(new Date()),
    azione: 'Sollecitare il lead',
    telefono: estraiTelefono_(descConSetter),
    setter: estraiSetter_(descConSetter) || 'NOSETTER'
  };
  Logger.log('--- TEST estrazione ---');
  Logger.log('Telefono: %s', dati.telefono);   // atteso: +393331234567
  Logger.log('Setter:   %s', dati.setter);      // atteso: Marco Rossi
  Logger.log('--- TEST invio (log-only) ---');
  inviaTwilio_(dati, true);

  // Caso senza setter -> deve risultare NOSETTER (mai inventare)
  var descSenza = 'Lead da richiamare. Telefono: 3339876543';
  Logger.log('Setter assente -> %s', estraiSetter_(descSenza) || 'NOSETTER');
}
