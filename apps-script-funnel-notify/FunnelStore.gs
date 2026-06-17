/**
 * Massaggiatore (TESTmess) — Funnel Notify — FunnelStore.gs
 * v1.0.0
 *
 * Legge il Google Sheet "Funnel Lead" (mirror scritto dal web app) e risponde a due
 * domande dello scheduler: "questo lead è Confermato?" e "dammi i dati del lead".
 *
 * Il foglio (tab CONFIG.SHEET_TAB) ha intestazione:
 *   leadKey | telefono | nome | codice | confirmed | t0ISO | updatedAt
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
      leadKey:   head.indexOf('leadkey'),
      telefono:  head.indexOf('telefono'),
      nome:      head.indexOf('nome'),
      codice:    head.indexOf('codice'),
      confirmed: head.indexOf('confirmed'),
      t0ISO:     head.indexOf('t0iso')
    };

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var rec = {
        leadKey:   ci.leadKey   >= 0 ? String(row[ci.leadKey]).trim()  : '',
        telefono:  ci.telefono  >= 0 ? String(row[ci.telefono]).trim() : '',
        nome:      ci.nome      >= 0 ? String(row[ci.nome]).trim()     : '',
        codice:    ci.codice    >= 0 ? String(row[ci.codice]).trim()   : '',
        confirmed: ci.confirmed >= 0 ? _truthy(row[ci.confirmed])      : false,
        t0ISO:     ci.t0ISO     >= 0 ? String(row[ci.t0ISO]).trim()    : ''
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

  // true SOLO se il lead esiste nel foglio ed è confermato. Lead sconosciuto → false
  // (non lo blocco: meglio una mail in più che perdere un sollecito; ma vedi nota scheduler).
  function isConfirmed(telefono, leadKey) {
    var rec = getLead(telefono, leadKey);
    return !!(rec && rec.confirmed);
  }

  return { load: load, getLead: getLead, isConfirmed: isConfirmed };
})();
