/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.72',
    fullName: 'v2.5.72 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    // v2.5.66: ID del Google Sheet "Funnel Lead" (mirror dello stato funnel per l'Apps Script
    // "Funnel Notify" che manda email a browser chiuso). VUOTO = mirror spento (nessuna scrittura).
    // Incolla qui l'ID dall'URL del foglio (.../spreadsheets/d/<ID>/edit) e lo STESSO ID in
    // apps-script-funnel-notify/Config.gs → CONFIG.SHEET_ID.
    FUNNEL_SHEET_ID: '1Mclh4ua8_7a9d6nmOTh1WXxOGW0rXw5cNkXVLennQDE',
    // CUTOFF non-retroattivo del funnel. v2.5.69: nel FRONT-END NON è più usato (tutti i lead entrano
    // "pending"); la garanzia "niente mail indietro nel tempo" è data SOLO dall'Apps Script, che salta
    // gli eventi "LEAD - Call" CREATI prima di questo istante. Valore ISO FISSO = momento del deploy
    // della migrazione (NON Date.now()). DEVE restare identico a CONFIG.FUNNEL_CUTOFF_ISO in
    // apps-script-funnel-notify/Config.gs (lì è attivo).
    FUNNEL_CUTOFF_ISO: '2026-06-19T11:52:00+02:00',
    lastUpdate: '2026-06-19 (v2.5.72) - Schede lead dai calendari (LEAD - Call + FOLLOWUP) + mail di ingresso. (WEB) La sezione Lead ora MATERIALIZZA una scheda anche per i lead che hanno solo un evento nei calendari "LEAD - Call"/"FOLLOWUP" e a cui non hai ancora scritto: prima le schede nascevano SOLO dalla cronologia messaggi → un lead appena messo a calendario compariva nella tendina ma non nelle schede. Ora compare subito, col suo stato, fuso per identità (leadIdentityKey) coi lead messaggiati (niente doppioni). Nuovi: isLeadFunnelEvent (match LEAD-Call+FOLLOWUP), buildCalendarLeads (dedup per chiave). I lead-da-calendario senza messaggi sono ordinati per recency dell\'evento (in cima i nuovi). (APPS SCRIPT funnel-notify, richiede REDEPLOY manuale) Aggiunto lo stamp di INGRESSO (h=0) → mail "nuovo lead entrato" appena il lead entra; il funnel ora copre anche il calendario "FOLLOWUP" (CONFIG.CAL_MATCHES + helper funnelCalMatches_/funnelTitleMatches_). Precedente (v2.5.71) - Funnel checklist + parsing telefono. (1) UI: a lead "Confermato"/"No" (funnel congelato) TUTTE le checkbox completate restano BLU read-only e coerenti — prima l\'"Ingresso lead" restava blu/cliccabile mentre gli altri step si ingrigivano (incoerenza). Tolta l\'eccezione "ingresso" e l\'attributo disabled; read-only via CSS pointer-events:none + tabindex, con guardia anche in toggleLeadChecklistStep. Gli step NON completati restano neutri. (2) extractPhoneFromEvent ELASTICO: ora riconosce i numeri scritti in qualsiasi formato — (342) 354-2724, 342.354.2724, +39/0039/39 o senza prefisso — via nuovo helper normalizeItalianPhone. Precedente (v2.5.70) - FIX scope Apps Script Funnel Notify: SpreadsheetApp.openById richiede lo scope "spreadsheets" (pieno), non "spreadsheets.readonly" → in apps-script-funnel-notify/appsscript.json cambiato lo scope, altrimenti FunnelStore non riesce ad aprire il foglio ("Specified permissions are not sufficient"). Solo Apps Script: l\'app web non cambia comportamento. Precedente (v2.5.69) - Stato conferma SCOPED all\'appuntamento: TUTTI i lead entrano "pending", e se lo stesso lead ri-fissa (nuovo evento "LEAD - Call" = createdISO diverso) lo stato torna pending da solo → riparte un funnel di conferma fresco per quel nuovo appuntamento. La scelta manuale confermato/no vale solo per l\'appuntamento per cui è stata fatta. Tolto il default "no" sui lead pre-cutoff: la non-retroattività resta garantita SOLO dal cutoff lato Apps Script (eventi creati prima del cutoff non mandano mail). Precedente (v2.5.68) - Attivato il mirror Funnel: creato il Google Sheet "Massaggiatore - Funnel Lead" e cablato FUNNEL_SHEET_ID (stesso ID anche in apps-script-funnel-notify/Config.gs → SHEET_ID). Da qui il web rispecchia lo stato funnel sul foglio e l\'Apps Script può leggerlo a browser chiuso. Precedente (v2.5.67) - Funnel conferma a TRE STATI (Confermato/Pending/No) + T0 = CREAZIONE evento + non retroattivo. (1) T0 del funnel = data di CREAZIONE dell\'evento "LEAD - Call" (ingresso reale del lead), non più l\'orario di inizio appuntamento: stamp T+2/4/6h ora partono da quando il lead è entrato. (2) Il booleano "Confermato" diventa un controllo a 3 stati: Confermato e No congelano il funnel, solo Pending lo tiene attivo. L\'Apps Script invia l\'alert email (dante.consulenze@gmail.com) SOLO se lo stato è "pending". (3) NON retroattivo: cutoff FUNNEL_CUTOFF_ISO = momento del deploy; i lead creati prima partono "no" (zero mail indietro nel tempo), doppia barriera anche lato Apps Script. Sheet mirror: colonna confirmed→status, nuova colonna createdISO. Migrazione: vecchi LEAD_CONFIRMED:true → status "confermato". Precedente (2.5.66): Funnel Notify, notifiche EMAIL automatiche sul funnel lead.'
};

// ===== GITHUB AUTO-PUSH CONFIGURATION =====
// TOKEN RIMOSSO PER SICUREZZA
// Il token viene fornito manualmente quando necessario
const GITHUB_CONFIG = {
    enabled: false, // Disabilitato - push manuale con token fornito dall'utente
    token: '', // Nessun token salvato nel codice
    repo: 'MaNonQuelDante/Massaggiatore',
    branch: 'main',
    username: 'MaNonQuelDante'
};

// Funzione per decodificare token (usata da github-auto-push.js)
function getGitHubToken() {
    if (!GITHUB_CONFIG.enabled) return null;
    try {
        return atob(GITHUB_CONFIG.token);
    } catch (e) {
        console.error('❌ Errore decodifica token GitHub:', e);
        return null;
    }
}

// Esporta per uso globale
window.APP_CONFIG = APP_CONFIG;
window.GITHUB_CONFIG = GITHUB_CONFIG;
window.getGitHubToken = getGitHubToken;

console.log(`✅ ${APP_CONFIG.fullName} - Configuration loaded`);
console.log(`🔐 GitHub Auto-Push: ${GITHUB_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}`);
