/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.62',
    fullName: 'v2.5.62 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    lastUpdate: '2026-06-17 - Evento Calendar: sotto la riga "📱 WhatsApp: <link>" in cima alla descrizione viene ora aggiunta, a capo, una riga "📞 Chiama: tel:+<numero>" per far partire una telefonata classica (non WhatsApp). Modifica applicata a entrambi i blocchi di js/google-calendar.js che costruiscono la descrizione. Per il check !includes("wa.me/") il link chiamata compare solo sugli eventi NUOVI (quelli che hanno già la riga WhatsApp non vengono ritoccati). Su mobile tel:+39... è cliccabile e avvia la chiamata.'
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
