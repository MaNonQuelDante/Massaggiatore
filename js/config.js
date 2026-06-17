/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.60',
    fullName: 'v2.5.60 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    lastUpdate: '2026-06-17 - Aggiunto componente Reminder Lead (apps-script-reminder/): Google Apps Script SEPARATO dall\'app web (non caricato da index.html), gira su trigger ogni 5 min e manda reminder WhatsApp via Twilio quando un evento Calendar "LEAD - Call" supera le soglie T0+2h/+4h/+6h (Scrivere/Sollecitare/Sollecitare via chiamata). Dedup via PropertiesService, tolleranza 3h, setter solo da fonti esplicite o NOSETTER, credenziali solo in Script Properties. STATO: architettura pronta, Twilio ancora da creare (placeholder). Nessuna modifica alla web app: solo nuovo sorgente versionato nel progetto.'
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
