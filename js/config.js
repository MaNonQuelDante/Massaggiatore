/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.63',
    fullName: 'v2.5.63 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    lastUpdate: '2026-06-17 - Sezione Lead, fix date funnel. L\'"📥 Ingresso lead" nel log ora usa lo STAMP DI CREAZIONE dell\'evento "LEAD - Call" (createdAt = quando Google Calendar ha rilevato il nuovo evento = ingresso reale del lead), NON più l\'orario dell\'appuntamento. Il giorno+ora dell\'APPUNTAMENTO (t0) è stato spostato accanto al nome nell\'header della card ("Nome Cognome · 📅 gg/mm hh:mm"). buildLeadCallIndex ora propaga event.created; findLeadT0Auto/bestLeadSuggestion/resolveLeadT0 restituiscono anche createdAt (retrocompatibili: t0 e suggestion invariati). Fallback ingresso al primo messaggio se il created manca.'
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
