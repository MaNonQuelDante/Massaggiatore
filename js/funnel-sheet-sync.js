/* ================================================================================
   FUNNEL SHEET SYNC - TESTmess v2.5.88

   Rispecchia lo stato funnel dei lead (identità + stato conferma + ingresso) in un
   Google Sheet dedicato, così l'Apps Script "Funnel Notify" (che gira a browser chiuso)
   può leggerlo. Lo stato primario resta su Drive appDataFolder (UI invariata): QUESTO è
   solo un mirror in scrittura, additivo. appDataFolder NON è leggibile da Apps Script
   (è per-applicazione) → serve questo ponte.

   Foglio: tab CONFIG 'LEADS', intestazione (v2.5.88):
     leadKey | telefono | nome | codice | status | t0ISO | createdISO | updatedAt | lastStep
   - status     = "confermato" | "pending" | "no" (era il booleano "confirmed"). L'Apps
                  Script manda mail SOLO se "pending".
   - createdISO = data di CREAZIONE dell'evento "LEAD - Call" (ingresso reale). È il T0
                  autorevole del funnel lato Apps Script (stamp T+2/4/6h dal createdISO).
   - t0ISO      = orario APPUNTAMENTO (start evento), tenuto per retrocompatibilità.
   - lastStep   = v2.5.88: label leggibile dell'ULTIMO step funnel spuntato (escluso 'ingresso').
                  Serve all'Apps Script per "Ultima azione verso il lead: X" nella mail. Aggiunta
                  IN CODA: non sposta le colonne esistenti (l'Apps Script legge per nome header).

   ID del foglio: window.APP_CONFIG.FUNNEL_SHEET_ID (in js/config.js). Se vuoto → no-op
   (feature spenta finché non lo configuri). Tutte le operazioni sono fire-and-forget:
   non lanciano MAI errori al chiamante, così non possono rompere la sezione Lead.
   ================================================================================ */

const FUNNEL_SHEET = {
    TAB: 'LEADS',
    HEADER: ['leadKey', 'telefono', 'nome', 'codice', 'status', 't0ISO', 'createdISO', 'updatedAt', 'lastStep'],
    RANGE: 'A:I'
};

let _funnelSheetReady = false;   // tab + header garantiti (una volta per sessione)
let _funnelSheetApiLoaded = false;
let _funnelLastBatchSync = 0;    // throttle del batch

function _funnelSheetId() {
    return (window.APP_CONFIG && window.APP_CONFIG.FUNNEL_SHEET_ID) || '';
}

function _funnelCanRun() {
    return !!_funnelSheetId() && !!window.accessToken && !!(window.gapi && window.gapi.client);
}

// Carica l'API Sheets (idempotente).
async function _funnelEnsureApi() {
    if (_funnelSheetApiLoaded) return true;
    try {
        await window.gapi.client.load('sheets', 'v4');
        _funnelSheetApiLoaded = true;
        return true;
    } catch (e) {
        console.warn('⚠️ [FunnelSheet] load API Sheets fallito (ignoro):', e);
        return false;
    }
}

// Garantisce che esista la tab 'LEADS' con l'intestazione corretta.
async function _funnelEnsureTabAndHeader() {
    if (_funnelSheetReady) return true;
    const spreadsheetId = _funnelSheetId();

    // 1) Esiste la tab?
    let hasTab = false;
    try {
        const meta = await window.gapi.client.sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets.properties.title'
        });
        const sheets = (meta.result && meta.result.sheets) || [];
        hasTab = sheets.some(s => s.properties && s.properties.title === FUNNEL_SHEET.TAB);
    } catch (e) {
        console.warn('⚠️ [FunnelSheet] get metadata fallito:', e);
        return false;
    }

    // 2) Crea la tab se manca
    if (!hasTab) {
        try {
            await window.gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: FUNNEL_SHEET.TAB } } }] }
            });
            console.log(`✅ [FunnelSheet] Creata tab "${FUNNEL_SHEET.TAB}"`);
        } catch (e) {
            console.warn('⚠️ [FunnelSheet] addSheet fallito:', e);
            return false;
        }
    }

    // 3) Intestazione presente?
    try {
        const head = await window.gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${FUNNEL_SHEET.TAB}!A1:I1`
        });
        const row1 = (head.result && head.result.values && head.result.values[0]) || [];
        const first = row1[0];
        // v2.5.88: riscrivo l'header se manca (foglio nuovo), se è il vecchio schema a 7 colonne
        // (col E = "confirmed" invece di "status"), OPPURE se manca la colonna "lastStep" (schema
        // pre-v2.5.88). Riscrivere A1:I1 è idempotente e non sposta i dati delle colonne A:H.
        const hasStatus = first === 'leadKey' && String(row1[4]).trim().toLowerCase() === 'status';
        const hasLastStep = String(row1[8] || '').trim().toLowerCase() === 'laststep';
        if (!hasStatus || !hasLastStep) {
            await window.gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${FUNNEL_SHEET.TAB}!A1:I1`,
                valueInputOption: 'RAW',
                resource: { values: [FUNNEL_SHEET.HEADER] }
            });
            console.log('✅ [FunnelSheet] Intestazione (v2.5.88, +lastStep) scritta');
        }
    } catch (e) {
        console.warn('⚠️ [FunnelSheet] header fallito:', e);
        return false;
    }

    _funnelSheetReady = true;
    return true;
}

// Riga foglio (array A:I) da un leadRow normalizzato. v2.5.67: status (stringa) + createdISO.
// v2.5.88: + lastStep in coda (label ultimo step funnel spuntato, '' se nessuno oltre 'ingresso').
function _funnelRowArray(lr) {
    return [
        lr.leadKey || '',
        lr.telefono || '',
        lr.nome || '',
        lr.codice || '',
        lr.status || 'pending',   // "confermato" | "pending" | "no" (default prudente: pending)
        lr.t0ISO || '',
        lr.createdISO || '',
        new Date().toISOString(),
        lr.lastStep || ''         // v2.5.88: ultima azione verso il lead (per la mail Apps Script)
    ];
}

// Legge la colonna A (leadKey) → mappa key → numero riga (1-based, header = riga 1).
async function _funnelKeyRowMap() {
    const spreadsheetId = _funnelSheetId();
    const map = {};
    try {
        const resp = await window.gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${FUNNEL_SHEET.TAB}!A2:A`
        });
        const rows = (resp.result && resp.result.values) || [];
        rows.forEach((r, i) => {
            const k = (r && r[0]) ? String(r[0]) : '';
            if (k) map[k] = i + 2; // +2: salta header e parte da riga 2
        });
    } catch (e) {
        console.warn('⚠️ [FunnelSheet] lettura colonna A fallita:', e);
    }
    return map;
}

// ===== PUBBLICO: sync batch di tutti i lead (upsert, mai cancella) =====
async function syncAllLeadsToFunnelSheet(leadRows) {
    if (!_funnelCanRun() || !Array.isArray(leadRows) || leadRows.length === 0) return;
    // Throttle: non più di una volta ogni 20s (la sezione Lead può re-renderizzare spesso).
    if (Date.now() - _funnelLastBatchSync < 20000) return;
    _funnelLastBatchSync = Date.now();

    try {
        if (!await _funnelEnsureApi()) return;
        if (!await _funnelEnsureTabAndHeader()) return;

        const spreadsheetId = _funnelSheetId();
        const keyRow = await _funnelKeyRowMap();

        const updates = [];   // ValueRange per le righe esistenti
        const appends = [];    // righe nuove
        leadRows.forEach(lr => {
            if (!lr || !lr.leadKey) return;
            const arr = _funnelRowArray(lr);
            const row = keyRow[lr.leadKey];
            if (row) updates.push({ range: `${FUNNEL_SHEET.TAB}!A${row}:I${row}`, values: [arr] });
            else appends.push(arr);
        });

        if (updates.length > 0) {
            await window.gapi.client.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                resource: { valueInputOption: 'RAW', data: updates }
            });
        }
        if (appends.length > 0) {
            await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${FUNNEL_SHEET.TAB}!${FUNNEL_SHEET.RANGE}`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: appends }
            });
        }
        console.log(`💾 [FunnelSheet] Sync: ${updates.length} aggiornati, ${appends.length} nuovi`);
    } catch (e) {
        console.warn('⚠️ [FunnelSheet] syncAllLeads fallito (ignoro):', e);
    }
}

// ===== PUBBLICO: upsert di un singolo lead (usato al toggle "Confermato") =====
async function upsertLeadToFunnelSheet(leadRow) {
    if (!_funnelCanRun() || !leadRow || !leadRow.leadKey) return;
    try {
        if (!await _funnelEnsureApi()) return;
        if (!await _funnelEnsureTabAndHeader()) return;

        const spreadsheetId = _funnelSheetId();
        const arr = _funnelRowArray(leadRow);
        const keyRow = await _funnelKeyRowMap();
        const row = keyRow[leadRow.leadKey];

        if (row) {
            await window.gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${FUNNEL_SHEET.TAB}!A${row}:I${row}`,
                valueInputOption: 'RAW',
                resource: { values: [arr] }
            });
        } else {
            await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${FUNNEL_SHEET.TAB}!${FUNNEL_SHEET.RANGE}`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: { values: [arr] }
            });
        }
        console.log(`💾 [FunnelSheet] Upsert lead ${leadRow.leadKey} (status=${leadRow.status || 'pending'})`);
    } catch (e) {
        console.warn('⚠️ [FunnelSheet] upsertLead fallito (ignoro):', e);
    }
}

window.FunnelSheetSync = {
    syncAllLeads: syncAllLeadsToFunnelSheet,
    upsertLead: upsertLeadToFunnelSheet
};
