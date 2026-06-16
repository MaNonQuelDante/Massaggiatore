/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.51',
    fullName: 'v2.5.51 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    lastUpdate: '2026-06-16 - FIX LOGIN PERSISTENTE (il vero bug): il token ripristinato da localStorage non veniva passato a gapi.client, quindi People/Calendar/Drive partivano senza autorizzazione → 401 → l\'app lo scambiava per token morto e rifaceva login + permessi a OGNI reload. Aggiunta setGapiToken() che aggancia il token a gapi.client nel ripristino sessione, nel login fresco e lo scollega al logout. Ora i reload entro l\'ora sono silenziosi e dopo l\'ora si rinnova senza popup.'
};

// ===== GITHUB AUTO-PUSH CONFIGURATION =====
// TOKEN RIMOSSO PER SICUREZZA
// Il token viene fornito manualmente quando necessario
const GITHUB_CONFIG = {
    enabled: false, // Disabilitato - push manuale con token fornito dall'utente
    token: '', // Nessun token salvato nel codice
    repo: 'DanteManonquello/sgfemassdante',
    branch: 'main',
    username: 'DanteManonquello'
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
