/**
 * Massaggiatore (TESTmess) — Funnel Notify — FunnelStore.gs
 * v1.1.0 (TESTmess v2.5.89)
 *
 * Legge il Google Sheet "Funnel Lead" (mirror scritto dal web app) e risponde a due
 * domande dello scheduler: "questo lead è Confermato?" e "dammi i dati del lead".
 *
 * Il foglio (tab CONFIG.SHEET_TAB) ha intestazione (v2.5.89):
 *   leadKey | telefono | nome | codice | status | t0ISO | createdISO | updatedAt | lastStep
 *   (legge ancora il vecchio schema con colonna "confirmed" come fallback.)
 *
 * CHANGELOG v1.1.0 (TESTmess v2.5.89) — ⚠️ REDEPLOY MANUALE:
 * - 📝 Legge la nuova colonna "lastStep" (label dell'ultima azione svolta verso il lead, scritta
 *      dal web app in coda allo schema). Tollerante all'ordine (head.indexOf), finisce in rec.lastStep
 *      ed è usata da Notifiers.gs per "Ultima azione verso il lead: …".
 *
 * Il match si fa PER TELEFONO NORMALIZZATO (prefisso 39 agnostico, ultime cifre),
 * con leadKey come chiave secondaria. Cache in memoria per la singola esecuzione.
 */

var FunnelStore = (function () {
  var _rows = null;          // array di oggetti riga
  var _byPhone = null;       // mappa telefonoNorm → riga
  var _byKey = null;         // mappa leadKey → riga

  // Telefono → solo cifre, senza prefisso internazionale 39 (per confronto locale).
  function _normPhone(raw) {
    var d = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.substring(2);
    if (d.length > 10 && d.indexOf('39') === 0) d = d.substring(2);
    return d; // es. +39 333 1234567 / 393331234567 / 3331234567 → 3331234567
  }

  function _truthy(v) {
    return v === true || String(v).trim().toUpperCase() === 'TRUE';
  }

  // Carica e indicizza il foglio (una sola volta per esecuzione).
  function load() {
    if (_rows) return _rows;
    _rows = []; _byPhone = {}; _byKey = {};

    if (!CONFIG.SHEET_ID) {
      Logger.log('⚠️ FunnelStore: CONFIG.SHEET_ID vuoto → nessun dato funnel (nessun invio).');
      return _rows;
    }

    var sheet;
    try {
      sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_TAB);
    } catch (e) {
      Logger.log('❌ FunnelStore: impossibile aprire il foglio (%s): %s', CONFIG.SHEET_ID, e);
      return _rows;
    }
    if (!sheet) {
      Logger.log('⚠️ FunnelStore: tab "%s" non trovata.', CONFIG.SHEET_TAB);
      return _rows;
    }

    var values = sheet.getDataRange().getValues();
    if (!values || values.length < 2) {
      Logger.log('ℹ️ FunnelStore: foglio vuoto (nessuna riga lead).');
      return _rows;
    }

    // Intestazione → indici colonna (tollerante all'ordine).
    var head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var ci = {
      leadKey:    head.indexOf('leadkey'),
      telefono:   head.indexOf('telefono'),
      nome:       head.indexOf('nome'),
      codice:     head.indexOf('codice'),
      status:     head.indexOf('status'),       // v2.5.67: confermato|pending|no
      confirmed:  head.indexOf('confirmed'),     // LEGACY (schema v2.5.66): fallback se manca 'status'
      t0ISO:      head.indexOf('t0iso'),
      createdISO: head.indexOf('creatediso'),    // v2.5.67: data creazione evento (T0 funnel)
      lastStep:   head.indexOf('laststep')        // v2.5.89: label ultima azione svolta verso il lead
    };

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      // v2.5.67: stato a 3 valori. Se manca la colonna 'status' (vecchio foglio) ricado sul
      // booleano 'confirmed': TRUE → "confermato", altrimenti vuoto (= pending lato scheduler).
      var statusRaw = ci.status >= 0 ? String(row[ci.status]).trim().toLowerCase() : '';
      if (!statusRaw && ci.confirmed >= 0) statusRaw = _truthy(row[ci.confirmed]) ? 'confermato' : '';
      var rec = {
        leadKey:    ci.leadKey    >= 0 ? String(row[ci.leadKey]).trim()    : '',
        telefono:   ci.telefono   >= 0 ? String(row[ci.telefono]).trim()   : '',
        nome:       ci.nome       >= 0 ? String(row[ci.nome]).trim()       : '',
        codice:     ci.codice     >= 0 ? String(row[ci.codice]).trim()     : '',
        status:     statusRaw,
        t0ISO:      ci.t0ISO      >= 0 ? String(row[ci.t0ISO]).trim()      : '',
        createdISO: ci.createdISO >= 0 ? String(row[ci.createdISO]).trim() : '',
        lastStep:   ci.lastStep   >= 0 ? String(row[ci.lastStep]).trim()   : ''   // v2.5.89
      };
      _rows.push(rec);
      var ph = _normPhone(rec.telefono);
      if (ph) _byPhone[ph] = rec;
      if (rec.leadKey) _byKey[rec.leadKey] = rec;
    }
    Logger.log('🔄 FunnelStore: %s lead caricati dal foglio.', _rows.length);
    return _rows;
  }

  // Trova la riga lead per telefono (primario) o leadKey (secondario). Può tornare null.
  function getLead(telefono, leadKey) {
    load();
    var ph = _normPhone(telefono);
    if (ph && _byPhone[ph]) return _byPhone[ph];
    if (leadKey && _byKey[leadKey]) return _byKey[leadKey];
    return null;
  }

  // v2.5.67: stato EFFETTIVO del lead. Lead sconosciuto o cella vuota → 'pending' (il cutoff lato
  // scheduler protegge comunque i lead vecchi dall'invio retroattivo).
  function getStatus(telefono, leadKey) {
    var rec = getLead(telefono, leadKey);
    var s = rec && rec.status ? String(rec.status).trim().toLowerCase() : '';
    return (s === 'confermato' || s === 'pending' || s === 'no') ? s : 'pending';
  }

  // v2.5.67: il funnel va FERMATO se lo stato è "confermato" o "no" (sostituisce isConfirmed).
  function shouldStopFunnel(telefono, leadKey) {
    var s = getStatus(telefono, leadKey);
    return s === 'confermato' || s === 'no';
  }

  return { load: load, getLead: getLead, getStatus: getStatus, shouldStopFunnel: shouldStopFunnel };
})();
