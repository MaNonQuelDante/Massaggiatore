/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.59',
    fullName: 'v2.5.59 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    lastUpdate: '2026-06-16 - Sezione Lead. (1) FIX persistenza spunte funnel-conferma: DRIVE_FILES non mappava LEAD_CHECKLIST/LEAD_BINDINGS → save/load fallivano in silenzio e le spunte si perdevano al reload; ora salvate in modo permanente in appDataFolder (testmess_lead_checklist.json / testmess_lead_bindings.json). leadKey già stabile (tel: cifre normalizzate). (2) Telefono in cima alla card mostrato con prefisso: 393394865982 → "+39 339 486 5982" (normalizza prima, niente +39 duplicato). (3) Footer card: rimosso il nome servizio ("Finanza Efficace"/"Stock Gain"), resta solo il tag FE - Lead / SG - Lead. (4) Bottone WhatsApp sulla riga "Inviare a Gruppo NoShow" → wa.me/393755588371 con testo precompilato (solo valori, uno per riga: nome cognome / data-ora appuntamento / telefono / nome assistente / primo nome account Google).'
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
