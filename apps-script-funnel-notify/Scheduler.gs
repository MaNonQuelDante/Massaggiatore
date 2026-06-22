/**
 * Massaggiatore (TESTmess) — Funnel Notify — Scheduler.gs
 * v1.3.0 (TESTmess v2.5.87)
 *
 * Cuore del sistema. Il trigger ogni 5 minuti chiama checkFunnelNotifications():
 * scorre gli eventi "LEAD - Call", per ogni stamp dovuto (e non confermato/non già
 * inviato) chiama ogni notifier attivo e marca l'invio in modo persistente.
 *
 * Anti-duplicato: PropertiesService, chiave 'sent_<notifierId>_<eventId>_<stampKey>'
 * (prefisso DISTINTO dal Twilio 'notified_', così i due Apps Script non si pestano).
 *
 * CHANGELOG v1.3.0 (TESTmess v2.5.87) — ⚠️ REDEPLOY MANUALE + RILANCIA setup() (nuovo trigger):
 * - 🌙 FEATURE A (quiet hours): _applyQuietHours_(sogliaDate) slitta gli stamp che cadono dopo le 19
 *      (o di notte) alle 09:00 del mattino utile successivo. Applicata in processaEventoFunnel_ a
 *      sogliaMs PRIMA del confronto due/stale, ESCLUSO 'ingresso'. La TOLLERANZA stale usa la soglia
 *      SLITTATA (così uno stamp serale slittato non viene marcato stale e poi mai inviato).
 * - 📋 FEATURE B (digest): dailyLeadDigest() (trigger @08:00, registrato da setup()) manda UNA mail
 *      con i lead il cui APPUNTAMENTO è OGGI, divisi in ✅ Confermati / ⏳ In attesa (status='no' esclusi).
 *      Niente mail se entrambi i blocchi sono vuoti. Corpo composto da _composeDigestBody_.
 * - 📝 FEATURE C (reminder CRM): _processaCrmReminder_ — stamp 'crm2h' = apptStart + CRM_REMINDER_H,
 *      invia SOLO se status='confermato'. Chiamato in processaEventoFunnel_ PRIMA del gate pending
 *      (che fa `return` su ogni stato ≠ pending, confermato incluso). Stessi cutoff/stale/quiet-hours
 *      e dedup dedicata 'sent_<notifierId>_<eventId>_crm2h'.
 *
 * CHANGELOG v1.2.0 (TESTmess v2.5.82):
 * - 🎥 GOOGLE MEET nell'arricchimento: arricchisciEventoFunnel_ ora crea/recupera anche il Meet
 *      dell'evento (riga "🎥 Google Meet" nel blocco contatti), via Advanced Calendar Service
 *      (Calendar.Events.get/patch con conferenceData.createRequest) — come fa il front-end con
 *      ensureMeetOnEvent. Il flag 'enriched_<eventId>' viene marcato SOLO quando il Meet è pronto:
 *      se Google tarda, riprova ai giri successivi (entro la finestra "fresh" di 3h). Il resto
 *      della pipeline resta idempotente.
 * - 🔐 SCOPE: serve "https://www.googleapis.com/auth/calendar" (PIENO, non readonly) perché ora
 *      scriviamo sull'evento (setDescription/setTitle + patch conferenceData). Aggiornato
 *      appsscript.json. ⚠️ Richiede ri-autorizzazione (lancia setup()/test() una volta) + abilitare
 *      l'Advanced Calendar Service nell'editor (Servizi → Google Calendar API, identificatore "Calendar").
 *
 * CHANGELOG v1.1.0 (TESTmess v2.5.81):
 * - ✨ ARRICCHIMENTO EVENTO server-side (arricchisciEventoFunnel_): all'INGRESSO del lead (stamp
 *      h=0), a browser chiuso, inietta in cima alla descrizione il blocco contatti
 *      (📱 WhatsApp / 📞 Chiama / 📂 Scheda lead) e rinomina il titolo grezzo ("LEAD - Call"/
 *      "FOLLOWUP") in "Nome Cognome" (Title Case). Replica ciò che il front-end fa a
 *      "genera/invia messaggio" (js/google-calendar.js), ma senza dipendere dal token OAuth che
 *      scade. UNA volta sola per evento (flag 'enriched_<eventId>'). Isolato in try/catch: un suo
 *      errore NON blocca l'invio dell'email. NON tocca il Meet (richiede l'Advanced Calendar
 *      Service / conferenceData → round separato).
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
    var calMatch = funnelCalMatches_(cal.getName());

    // v2.5.67: T0 = creazione evento → un lead può prenotare una call FUTURA ma il funnel parte
    // dalla creazione. Sui calendari del funnel ("LEAD - Call"/"FOLLOWUP") scansiono anche gli eventi
    // futuri; sugli altri resto stretto (eventi col titolo esatto del funnel iniziati di recente).
    // Il cutoff + dedup evitano spam.
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
      if (!calMatch && !funnelTitleMatches_(titolo)) continue;
      visti++;
      processaEventoFunnel_(ev, props, nowMs, false, cal.getId()); // v2.5.82: calId per il Meet
    }
  }

  pulisciVecchieChiavi_(props, nowMs);
  Logger.log('✅ checkFunnelNotifications: %s eventi "LEAD - Call" valutati.', visti);
}

// ===== VALUTA UN EVENTO SU TUTTE LE SOGLIE =====
// dryRun=true → non invia e non marca (solo log). Usato da test().
function processaEventoFunnel_(ev, props, nowMs, dryRun, calId) {
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

  // 📝 v2.5.87 FEATURE C: reminder "compila CRM" a +CRM_REMINDER_H dall'APPUNTAMENTO, SOLO se
  // status='confermato'. DEVE stare QUI, PRIMA del gate pending qui sotto: quel gate fa `return` su
  // QUALSIASI stato ≠ pending (quindi anche su 'confermato') → un ramo messo "dopo" non sarebbe mai
  // raggiunto per i confermati. Il cutoff non-retroattivo (su t0=creazione) è già applicato sopra.
  if (status === 'confermato') {
    _processaCrmReminder_(ev, eventId, t0, apptStart, telefono, rec, props, nowMs, dryRun);
  }

  if (status !== 'pending') {
    Logger.log('🚦 Stato "%s" (≠ pending) → funnel fermo, salto evento: %s', status, ev.getTitle());
    return;
  }

  for (var k = 0; k < CONFIG.SOGLIE.length; k++) {
    var stamp = CONFIG.SOGLIE[k];
    var sogliaMs = t0Ms + stamp.h * 60 * 60 * 1000;

    // 🌙 v2.5.87 FEATURE A: se la soglia cade dopo le 19 (o di notte) la slitto alle 09:00 del mattino
    // utile successivo. ESCLUSO 'ingresso' (h=0): la mail "nuovo lead entrato" deve partire subito.
    // CRUCIALE: lo stale qui sotto si calcola sulla soglia SLITTATA (sogliaMs riassegnata), altrimenti
    // uno stamp serale slittato sarebbe già "scaduto da >3h" la mattina dopo e verrebbe marcato senza inviare.
    if (stamp.key !== 'ingresso') {
      sogliaMs = _applyQuietHours_(new Date(sogliaMs)).getTime();
    }

    if (nowMs < sogliaMs) continue;                         // non ancora dovuto
    var stale = nowMs > sogliaMs + CONFIG.TOLLERANZA_MS;    // troppo in ritardo (>3h, sulla soglia slittata)

    // ✨ v2.5.81: all'INGRESSO (h=0) e su evento "fresco" (non stale), oltre alla mail arricchiamo
    // l'evento server-side (blocco contatti + rename titolo). UNA volta sola (flag 'enriched_…').
    // Isolato in try/catch dentro la funzione: NON blocca l'invio dell'email. dryRun → non tocca.
    if (stamp.key === 'ingresso' && !stale && !dryRun) {
      arricchisciEventoFunnel_(ev, telefono, rec, props, nowMs, calId);
    }

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

// ===== 🌙 v2.5.87 FEATURE A: QUIET HOURS (slittamento stamp serali/notturni) =====
// Se `sogliaDate` cade a/oltre CONFIG.QUIET_AFTER_H (sera) o prima di CONFIG.QUIET_MORNING_H (notte),
// ritorna una NUOVA Date alle QUIET_MORNING_H:00 del mattino "utile" successivo; altrimenti la ritorna
// invariata. In Apps Script il fuso del runtime coincide con quello dello script (Europe/Rome, vedi
// appsscript.json) → getHours()/setHours()/setDate() lavorano già in ora locale italiana, coerenti con
// Session.getScriptTimeZone(); setHours gestisce anche i salti DST. Casi:
//   - ora >= 19  → 09:00 del GIORNO SUCCESSIVO (la sera è già passata oltre il 09:00 odierno);
//   - ora < 9    → 09:00 dello STESSO giorno (ore notturne: il mattino utile è oggi);
//   - 9 <= ora < 19 → invariata (orario lavorativo).
function _applyQuietHours_(sogliaDate) {
  var afterH   = (CONFIG.QUIET_AFTER_H   != null) ? CONFIG.QUIET_AFTER_H   : 19;
  var morningH = (CONFIG.QUIET_MORNING_H != null) ? CONFIG.QUIET_MORNING_H : 9;
  var h = sogliaDate.getHours();
  if (h >= afterH) {
    var d = new Date(sogliaDate.getTime());
    d.setDate(d.getDate() + 1);          // giorno successivo
    d.setHours(morningH, 0, 0, 0);       // 09:00 in ora locale (script tz)
    return d;
  }
  if (h < morningH) {
    var d2 = new Date(sogliaDate.getTime());
    d2.setHours(morningH, 0, 0, 0);      // 09:00 dello stesso giorno
    return d2;
  }
  return sogliaDate;                      // orario lavorativo → invariata
}

// ===== 📝 v2.5.87 FEATURE C: REMINDER "COMPILA CRM" (+CRM_REMINDER_H dall'appuntamento, SOLO confermato) =====
// Ramo SEPARATO dal funnel normale: soglia = apptStart + CRM_REMINDER_H, gate INVERTITO (lo chiama
// processaEventoFunnel_ solo quando status==='confermato'). Riusa l'identica meccanica del funnel:
// quiet-hours (Feature A), TOLLERANZA stale sulla soglia slittata, dedup persistente per
// (notifier, eventId, 'crm2h'), e i NOTIFIERS attivi. Il cutoff non-retroattivo (su t0=creazione) è
// già stato applicato a monte in processaEventoFunnel_. dryRun=true → non invia e non marca.
function _processaCrmReminder_(ev, eventId, t0, apptStart, telefono, rec, props, nowMs, dryRun) {
  if (!apptStart) return; // senza orario appuntamento non c'è un T0 per questo stamp
  var crmH = (CONFIG.CRM_REMINDER_H != null) ? CONFIG.CRM_REMINDER_H : 2;
  var stamp = { key: 'crm2h', h: crmH, label: 'Compila CRM (call ad Andrea)' };

  var sogliaMs = apptStart.getTime() + crmH * 60 * 60 * 1000;
  // 🌙 Feature A: anche il reminder CRM slitta se cade dopo le 19 (o di notte). Stale sulla soglia slittata.
  sogliaMs = _applyQuietHours_(new Date(sogliaMs)).getTime();

  if (nowMs < sogliaMs) return;                           // non ancora dovuto
  var stale = nowMs > sogliaMs + CONFIG.TOLLERANZA_MS;    // troppo in ritardo (>3h)

  var lead = null;
  for (var n = 0; n < NOTIFIERS.length; n++) {
    var notifier = NOTIFIERS[n];
    if (!notifier.isEnabled()) continue;

    var key = 'sent_' + notifier.id + '_' + eventId + '_' + stamp.key; // es. sent_email_<id>_crm2h
    if (props.getProperty(key)) continue;                 // già inviato (questo canale)

    if (stale) {
      if (!dryRun) props.setProperty(key, String(nowMs));
      Logger.log('⏰ [%s] reminder CRM scaduto da >3h → marco senza inviare: %s', notifier.id, ev.getTitle());
      continue;
    }

    if (!lead) lead = buildLeadFromEvent_(ev, t0, apptStart, telefono, rec);

    if (dryRun) {
      Logger.log('🧪 [DRY-RUN] %s INVIEREBBE reminder CRM a "%s" (appuntamento %s)',
                 notifier.id, lead.nome, FunnelNotify_fmtDataIt(apptStart));
      continue;
    }

    var ok = notifier.send(lead, stamp);
    props.setProperty(key, String(nowMs)); // 1 solo invio per (canale, evento, crm2h)
    if (!ok) Logger.log('⚠️ [%s] reminder CRM send() ha ritornato false (marco comunque): %s', notifier.id, ev.getTitle());
  }
}

// ===== ✨ v2.5.81 / 🎥 v2.5.82: ARRICCHIMENTO EVENTO server-side (contatti + titolo + Meet) =====
// Replica, a browser chiuso, ciò che il front-end fa a "genera/invia messaggio"
// (js/google-calendar.js: addWhatsAppLinkToEvent / ensureEventTitleCorrect / ensureMeetOnEvent):
// inietta in cima alla descrizione il blocco contatti (📱 WhatsApp / 📞 Chiama / 📂 Scheda lead /
// 🎥 Google Meet) e rinomina il titolo grezzo ("LEAD - Call"/"FOLLOWUP") in "Nome Cognome". Gira
// all'INGRESSO (stamp h=0). Idempotente (non duplica righe già presenti) e isolato in try/catch (un
// errore NON blocca l'email). Anti-ripetizione: flag 'enriched_<eventId>' su PropertiesService,
// marcato SOLO quando anche il Meet è pronto → entro la finestra "fresh" (≤3h) ritenta a crearlo se
// Google tarda. v2.5.82: il Meet usa l'Advanced Calendar Service (Calendar.Events) → va abilitato
// nell'editor (Servizi → Google Calendar API) e serve lo scope "calendar" PIENO (vedi appsscript.json).
function arricchisciEventoFunnel_(ev, telefono, rec, props, nowMs, calId) {
  var flagKey = 'enriched_' + ev.getId();
  if (props.getProperty(flagKey)) return;   // già arricchito (Meet incluso): non rifare a ogni giro

  try {
    var desc = ev.getDescription() || '';
    var righeNuove = [];

    // 📱 WhatsApp + 📞 Chiama: solo se ho il telefono e nella descrizione non c'è già un "wa.me/".
    // Normalizzazione IDENTICA al front-end: via spazi e "+", e ai numeri locali a 10 cifre antepongo 39.
    if (telefono && desc.indexOf('wa.me/') === -1) {
      var phoneClean = String(telefono).replace(/\s+/g, '').replace(/^\+/, '');
      if (phoneClean.indexOf('39') !== 0 && phoneClean.length === 10) phoneClean = '39' + phoneClean;
      righeNuove.push('📱 WhatsApp: https://wa.me/' + phoneClean);
      righeNuove.push('📞 Chiama: tel:+' + phoneClean);
    }

    // 📂 Scheda lead: deep-link ?id=<codice> se il lead è già nel foglio, altrimenti URL base nudo
    // (stesso fallback dell'email). Idempotente: salto se la riga "📂 Scheda lead" c'è già.
    if (desc.indexOf('📂 Scheda lead') === -1) {
      var code = (rec && rec.codice) ? rec.codice : '';
      var appLink = code ? (CONFIG.APP_BASE_URL + '?id=' + encodeURIComponent(code)) : CONFIG.APP_BASE_URL;
      righeNuove.push('📂 Scheda lead: ' + appLink);
    }

    // 🎥 Google Meet: riuso quello che c'è (in descrizione o sull'evento), altrimenti lo CREO
    // server-side (Advanced Calendar Service). Indipendente dal telefono. meetMancante=true →
    // non riesco a ottenerlo ORA: a fine funzione NON marco il flag, così ci riprovo al giro dopo.
    var meetLink = _estraiMeetDaDescrizione_(desc);
    if (!meetLink) meetLink = _ensureMeetServerSide_(calId, ev.getId());
    var meetMancante = !meetLink;
    if (meetLink && desc.indexOf(meetLink) === -1 && desc.indexOf('🎥 Google Meet') === -1) {
      righeNuove.push('🎥 Google Meet: ' + meetLink);
    }

    var nuovoDesc = desc;
    if (righeNuove.length) nuovoDesc = righeNuove.join('\n') + (desc ? '\n\n' + desc : '');

    // ✏️ Rename titolo → "Nome Cognome" (Title Case). Lo step NON va nel titolo dell'evento: vive
    // solo nell'oggetto dell'email (scelta confermata). Nome: rec.nome (dal foglio) è la fonte
    // autorevole; se manca, ripulisco il titolo dell'evento ("NOME: servizio" → "NOME") ma SOLO se
    // non è un token grezzo (non rinomino "LEAD - Call"/"FOLLOWUP" in "Lead"/"Followup").
    var titoloAttuale = (ev.getTitle() || '').trim();
    var nomeBase = (rec && rec.nome) ? rec.nome.trim() : '';
    if (!nomeBase) {
      var pulito = _nomePulitoFunnel_(titoloAttuale);
      if (!_isTitoloGrezzoFunnel_(pulito)) nomeBase = pulito;
    }
    var nuovoTitolo = '';
    if (nomeBase) {
      var tc = _titleCaseFunnel_(nomeBase);
      if (tc && tc !== titoloAttuale) nuovoTitolo = tc;
    }

    if (nuovoDesc !== desc) ev.setDescription(nuovoDesc);
    if (nuovoTitolo)        ev.setTitle(nuovoTitolo);

    // Marco "fatto" SOLO se il Meet è a posto. Se manca, NON marco → ritento al prossimo giro
    // (entro i 3h "fresh"); il resto è idempotente quindi i ritenti non duplicano niente.
    if (!meetMancante) props.setProperty(flagKey, String(nowMs));
    Logger.log('✨ [enrich] "%s": +%s righe%s%s', titoloAttuale, righeNuove.length,
               nuovoTitolo ? (' · titolo "' + nuovoTitolo + '"') : '',
               meetMancante ? ' · ⏳ Meet non ancora pronto (ritento)' : ' · 🎥 Meet ok');
  } catch (e) {
    // Isolato di proposito: l'email parte comunque. NON marco il flag → ritento al prossimo giro.
    Logger.log('❌ [enrich] arricchimento fallito (email NON bloccata): %s', e);
  }
}

// Ripulisce un titolo evento per estrarne il nome (stesse regole di ensureEventTitleCorrect):
// taglia dopo ":" e dopo " - ", rimuove le parentesi. "ARTURO ALVARI: Finanza" → "ARTURO ALVARI".
function _nomePulitoFunnel_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '';
  if (s.indexOf(':') !== -1)   s = s.split(':')[0].trim();      // "NOME: servizio" → "NOME"
  if (s.indexOf(' - ') !== -1) s = s.split(' - ')[0].trim();    // "Nome - SG Lead" → "Nome"
  s = s.replace(/\s*\([^)]*\)/g, '').trim();                    // "Nome (nota)" → "Nome"
  return s;
}

// True se la stringa è un "token grezzo" del funnel (non un nome di persona) → non rinominare.
function _isTitoloGrezzoFunnel_(s) {
  var t = String(s || '').trim().toLowerCase();
  if (!t) return true;
  if (t === 'lead' || t === 'call' || t === 'lead - call') return true;
  return t.indexOf('followup') !== -1 || t.indexOf('follow up') !== -1 || t.indexOf('follow-up') !== -1;
}

// Title Case "alla front-end" (toTitleCaseNome): minuscolo + iniziale maiuscola a inizio parola e
// dopo spazio/apostrofo/trattino. Mantiene gli accenti. "mario rossi" → "Mario Rossi".
function _titleCaseFunnel_(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s'’\-])([a-zà-ÿ])/g, function (m, sep, ch) { return sep + ch.toUpperCase(); });
}

// ===== 🎥 v2.5.82: GOOGLE MEET server-side (Advanced Calendar Service) =====
// Estrae un eventuale link Meet già scritto nella descrizione (niente chiamate API se c'è già).
function _estraiMeetDaDescrizione_(desc) {
  if (!desc) return '';
  var m = String(desc).match(/https:\/\/meet\.google\.com\/[a-z0-9\-]+/i);
  return m ? m[0] : '';
}

// Crea/recupera il link Google Meet dell'evento via Advanced Calendar Service (Calendar.Events).
// Ritorna l'URL del Meet o '' se non disponibile/non abilitato. Tutto in try/catch: niente eccezioni
// fuori (l'arricchimento e l'email non si bloccano mai). CalendarApp usa id "...@google.com" mentre
// l'Advanced Service vuole l'id "nudo" → split('@')[0].
function _ensureMeetServerSide_(calId, calAppEventId) {
  if (!calId || !calAppEventId) return '';
  var apiEventId = String(calAppEventId).split('@')[0];
  try {
    if (typeof Calendar === 'undefined') return '';   // Advanced Service non abilitato → niente Meet
    var ev = Calendar.Events.get(calId, apiEventId);
    var link = _extractMeetFromApiEvent_(ev);
    if (link) return link;                              // Meet già presente → riuso, non ne creo un altro

    var resource = {
      conferenceData: {
        createRequest: {
          requestId: Utilities.getUuid(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };
    var updated = Calendar.Events.patch(resource, calId, apiEventId, { conferenceDataVersion: 1 });
    link = _extractMeetFromApiEvent_(updated);
    if (link) return link;

    // Google a volte genera il link con un attimo di ritardo: 1 retry dopo breve attesa.
    Utilities.sleep(1500);
    var again = Calendar.Events.get(calId, apiEventId, { conferenceDataVersion: 1 });
    return _extractMeetFromApiEvent_(again);
  } catch (e) {
    Logger.log('⚠️ [meet] niente Meet per %s: %s', apiEventId, e);
    return '';
  }
}

// Estrae l'URL del Meet da un evento Advanced API: hangoutLink o entryPoint video di conferenceData.
function _extractMeetFromApiEvent_(ev) {
  if (!ev) return '';
  if (ev.hangoutLink) return ev.hangoutLink;
  var eps = ev.conferenceData && ev.conferenceData.entryPoints;
  if (eps) {
    for (var i = 0; i < eps.length; i++) {
      if (eps[i].entryPointType === 'video' && eps[i].uri) return eps[i].uri;
    }
  }
  return '';
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

// ===== v2.5.72: MATCH calendario/titolo del funnel ("LEAD - Call" + "FOLLOWUP") =====
// Il calendario è "del funnel" se il suo NOME contiene una delle CONFIG.CAL_MATCHES.
function funnelCalMatches_(calName) {
  var n = (calName || '').toLowerCase();
  var arr = CONFIG.CAL_MATCHES || [CONFIG.CAL_MATCH];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && n.indexOf(arr[i]) !== -1) return true;
  }
  return false;
}
// Fuori dai calendari del funnel accetto solo eventi col TITOLO esatto del funnel (legacy).
function funnelTitleMatches_(title) {
  return (title || '').trim().toLowerCase() === (CONFIG.TITLE_MATCH || CONFIG.CAL_MATCH);
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

// ===== 📋 v2.5.87 FEATURE B: DIGEST GIORNALIERO (@08:00) =====
// UNA mail-riepilogo con due blocchi sui lead il cui APPUNTAMENTO cade OGGI (start evento tra la
// mezzanotte e le 23:59 locali):
//   ✅ Confermati  → status='confermato'  ("manda il memo del giorno")
//   ⏳ In attesa   → status='pending'      ("in attesa di conferma")
//   (status='no' esclusi da entrambi.)
// Niente cutoff qui: è un memo operativo su CHI ho oggi, a prescindere da quando l'evento è stato creato.
// Se entrambi i blocchi sono vuoti NON manda nulla (niente spam a vuoto). Registrata da setup() come
// trigger time-based @08:00 Europe/Rome.
function dailyLeadDigest() {
  if (!CONFIG.SHEET_ID) { Logger.log('⚠️ dailyLeadDigest: SHEET_ID non configurato → stop.'); return; }

  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var ymd = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var dayStart = Utilities.parseDate(ymd + ' 00:00:00', tz, 'yyyy-MM-dd HH:mm:ss');
  var dayEnd   = Utilities.parseDate(ymd + ' 23:59:59', tz, 'yyyy-MM-dd HH:mm:ss');

  FunnelStore.load();

  var confermati = [], pending = [], visti = {};
  var cals = CalendarApp.getAllCalendars();
  for (var c = 0; c < cals.length; c++) {
    var cal = cals[c];
    var calMatch = funnelCalMatches_(cal.getName());
    var eventi;
    try { eventi = cal.getEvents(dayStart, dayEnd); } catch (e) { continue; }

    for (var i = 0; i < eventi.length; i++) {
      var ev = eventi[i];
      if (ev.isAllDayEvent()) continue;
      var titolo = (ev.getTitle() || '').trim().toLowerCase();
      if (!calMatch && !funnelTitleMatches_(titolo)) continue; // fuori dai calendari funnel: solo titolo esatto

      var eventId = ev.getId();
      if (visti[eventId]) continue;   // stesso evento in più calendari → conta una volta sola
      visti[eventId] = true;

      var desc = ev.getDescription() || '';
      var telefono = estraiTelefonoFunnel_(desc);
      var leadKey = telefono ? ('tel:' + telefono.replace(/\D/g, '')) : '';
      var status = FunnelStore.getStatus(telefono, leadKey);
      if (status === 'no') continue;  // esclusi

      var rec = FunnelStore.getLead(telefono, leadKey);
      var apptStart = ev.getStartTime();
      var lead = buildLeadFromEvent_(ev, _funnelEventCreated_(ev, rec), apptStart, telefono, rec);
      var nome = _titleCaseFunnel_(_nomePulitoFunnel_(lead.nome || '')) || (lead.nome || '(senza nome)');
      var entry = {
        nome: nome,
        ora: Utilities.formatDate(apptStart, tz, 'HH:mm'),
        oraMs: apptStart.getTime(),
        telefono: lead.telefono || '',
        appLink: lead.appLink || '',
        eventLink: lead.eventLink || ''
      };
      if (status === 'confermato') confermati.push(entry);
      else pending.push(entry); // 'pending' (e default per lead sconosciuti)
    }
  }

  if (!confermati.length && !pending.length) {
    Logger.log('ℹ️ dailyLeadDigest: nessun lead (confermato/pending) con appuntamento oggi → nessuna mail.');
    return;
  }

  // Ordino ogni blocco per orario appuntamento crescente.
  confermati.sort(function (a, b) { return a.oraMs - b.oraMs; });
  pending.sort(function (a, b) { return a.oraMs - b.oraMs; });

  var dataStr = Utilities.formatDate(now, tz, 'dd/MM/yyyy');
  var oggetto = 'Riepilogo lead di oggi — ' + dataStr +
                ' (' + confermati.length + ' confermati · ' + pending.length + ' in attesa)';
  var corpo = _composeDigestBody_(confermati, pending, dataStr);

  try {
    MailApp.sendEmail({ to: CONFIG.NOTIFY_EMAIL, subject: oggetto, body: corpo });
    Logger.log('📋 Digest inviato → %s (%s confermati, %s in attesa)', CONFIG.NOTIFY_EMAIL, confermati.length, pending.length);
  } catch (e) {
    Logger.log('❌ Digest NON inviato: %s', e);
  }
}

// Compone il CORPO (testo semplice) della mail-digest. Funzione PURA (nessuna API): riceve due array
// di entry { nome, ora, telefono, appLink, eventLink } e la data formattata. Stile coerente con EmailNotifier.
function _composeDigestBody_(confermati, pending, dataStr) {
  function blocco(titolo, arr, vuotoMsg) {
    var out = [titolo];
    if (!arr.length) { out.push('  ' + vuotoMsg); return out.join('\n'); }
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      out.push('• ' + e.ora + ' — ' + e.nome + (e.telefono ? ('  📞 ' + e.telefono) : ''));
      if (e.appLink)   out.push('    📂 Scheda: ' + e.appLink);
      if (e.eventLink) out.push('    📅 Evento: ' + e.eventLink);
    }
    return out.join('\n');
  }

  var righe = [];
  righe.push('Riepilogo lead con appuntamento oggi (' + dataStr + ').');
  righe.push('');
  righe.push(blocco('✅ Confermati — manda il memo del giorno:', confermati, '(nessuno)'));
  righe.push('');
  righe.push(blocco('⏳ In attesa di conferma:', pending, '(nessuno)'));
  righe.push('');
  righe.push('— TESTmess Funnel Notify');
  return righe.join('\n');
}

// ===== SETUP — lancia A MANO una volta: crea i trigger (ogni 5' + digest @08:00) =====
function setup() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    // v2.5.87: pulisco sia il trigger 5' sia il nuovo digest (idempotente: rilanciare setup non duplica).
    if (fn === 'checkFunnelNotifications' || fn === 'dailyLeadDigest') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkFunnelNotifications').timeBased().everyMinutes(5).create();
  // v2.5.87 FEATURE B: digest giornaliero alle 08:00 (Europe/Rome).
  ScriptApp.newTrigger('dailyLeadDigest').timeBased().atHour(8).everyDays(1).inTimezone('Europe/Rome').create();
  Logger.log('✅ Trigger creati: checkFunnelNotifications (ogni 5 min) + dailyLeadDigest (@08:00).');
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
    var calMatch = funnelCalMatches_(cal.getName());
    var eventi;
    try { eventi = cal.getEvents(finestraInizio, calMatch ? finestraFineWide : finestraFineNarrow); } catch (e) { continue; }
    for (var i = 0; i < eventi.length; i++) {
      var ev = eventi[i];
      if (ev.isAllDayEvent()) continue;
      var titolo = (ev.getTitle() || '').trim().toLowerCase();
      if (!calMatch && !funnelTitleMatches_(titolo)) continue;
      valutati++;
      processaEventoFunnel_(ev, props, nowMs, true, cal.getId()); // dryRun (il Meet non viene toccato)
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
