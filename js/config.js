/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.66',
    fullName: 'v2.5.66 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    // v2.5.66: ID del Google Sheet "Funnel Lead" (mirror dello stato funnel per l'Apps Script
    // "Funnel Notify" che manda email a browser chiuso). VUOTO = mirror spento (nessuna scrittura).
    // Incolla qui l'ID dall'URL del foglio (.../spreadsheets/d/<ID>/edit) e lo STESSO ID in
    // apps-script-funnel-notify/Config.gs → CONFIG.SHEET_ID.
    FUNNEL_SHEET_ID: '',
    lastUpdate: '2026-06-17 - Funnel Notify: notifiche EMAIL automatiche sul funnel lead (base estensibile per WhatsApp/SMS). Nuovo Apps Script SEPARATO (apps-script-funnel-notify/, il Twilio resta intatto): trigger 5 min sugli eventi "LEAD - Call", email a dante.consulenze@gmail.com agli stamp T0+2h/+4h/+6h, anche a browser chiuso; STOP del funnel quando il lead è "Confermato" nella UI. Architettura notifier intercambiabili { id, isEnabled, send } con scheduling + anti-duplicato (PropertiesService) centralizzati. Lo stato funnel vive su Drive appDataFolder (non leggibile da Apps Script), quindi il web lo rispecchia in un Google Sheet dedicato (js/funnel-sheet-sync.js, scope spreadsheets già presente): righe leadKey/telefono/nome/codice/confirmed/t0ISO aggiornate al load sezione Lead e al toggle Confermato. Tolleranza 3h, fail-safe finché SHEET_ID è vuoto. Precedente (2.5.65): Rubrica con ricerca stile Google People (nome o numero), cache multi-dispositivo, write-back People, Title Case eventi, verifica lead non in rubrica.'
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
