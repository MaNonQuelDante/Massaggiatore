/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.67',
    fullName: 'v2.5.67 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    // v2.5.66: ID del Google Sheet "Funnel Lead" (mirror dello stato funnel per l'Apps Script
    // "Funnel Notify" che manda email a browser chiuso). VUOTO = mirror spento (nessuna scrittura).
    // Incolla qui l'ID dall'URL del foglio (.../spreadsheets/d/<ID>/edit) e lo STESSO ID in
    // apps-script-funnel-notify/Config.gs → CONFIG.SHEET_ID.
    FUNNEL_SHEET_ID: '',
    // v2.5.67: CUTOFF del funnel di conferma. Il funnel (3 stati + email) vale SOLO per i lead
    // il cui evento "LEAD - Call" è stato CREATO da questo istante in poi. Tutto ciò che è stato
    // creato prima → stato di default "no" (funnel chiuso, niente mail): non retroattivo.
    // Valore ISO FISSO = momento del deploy di questa migrazione (NON Date.now() runtime).
    // DEVE essere identico a CONFIG.FUNNEL_CUTOFF_ISO in apps-script-funnel-notify/Config.gs.
    FUNNEL_CUTOFF_ISO: '2026-06-19T11:52:00+02:00',
    lastUpdate: '2026-06-19 - Funnel conferma a TRE STATI (Confermato/Pending/No) + T0 = CREAZIONE evento + non retroattivo. (1) T0 del funnel = data di CREAZIONE dell\'evento "LEAD - Call" (ingresso reale del lead), non più l\'orario di inizio appuntamento: stamp T+2/4/6h ora partono da quando il lead è entrato. (2) Il booleano "Confermato" diventa un controllo a 3 stati: Confermato e No congelano il funnel, solo Pending lo tiene attivo. L\'Apps Script invia l\'alert email (dante.consulenze@gmail.com) SOLO se lo stato è "pending". (3) NON retroattivo: cutoff FUNNEL_CUTOFF_ISO = momento del deploy; i lead creati prima partono "no" (zero mail indietro nel tempo), doppia barriera anche lato Apps Script. Sheet mirror: colonna confirmed→status, nuova colonna createdISO. Migrazione: vecchi LEAD_CONFIRMED:true → status "confermato". Precedente (2.5.66): Funnel Notify, notifiche EMAIL automatiche sul funnel lead.'
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
