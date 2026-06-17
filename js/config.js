/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.64',
    fullName: 'v2.5.64 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    lastUpdate: '2026-06-17 - Deep-link scheda lead da Google Calendar (auth-aware, mobile/desktop). Ogni lead riceve un codice ID alfanumerico stabile (L0001…) assegnato alla nascita (markLeadAsContacted) o in backfill al primo caricamento della sezione Lead, salvato in cloud (LEAD_CODES + LEAD_CODE_COUNTER su appDataFolder). Ogni card mostra il codice come badge ed è raggiungibile via URL ?id=Lxxxx. Negli eventi Calendar, accanto a 📱 WhatsApp / 📞 Chiama, viene iniettata la riga "📂 Scheda lead: …?id=Lxxxx" (idempotente: anche eventi vecchi con wa.me ma senza ?id= la ricevono al passaggio). Aprendo il link da qualsiasi device si atterra sempre sulla scheda, anche dopo login (evento auth-ready). Chiave identità lead centralizzata in leadIdentityKey, condivisa tra sezione Lead e Calendar.'
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
