/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.58',
    fullName: 'v2.5.58 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    lastUpdate: '2026-06-16 - TASK 1: salvataggio AUTOMATICO del contatto in Google Contacts ad ogni invio messaggio (se il numero NON è già in rubrica, dedup su SAVED_CONTACTS). organizations.name = "FE - Lead"/"SG - Lead". Rimossa la vecchia lista "contatti da salvare"; nuovo form "Aggiungi numero" (Nome/Cognome/Numero/FE-SG/Società) + verifica numero in rubrica. FIX: checkAndSaveContact passava chiavi sbagliate (firstName/lastName/phone/company) a saveContactToGoogle → il salvataggio automatico non aveva mai funzionato. TASK 2: il campo created (ora di creazione evento Calendar ≈ prenotazione Acuity) ora viene PERSISTITO: prima il .map() di syncCalendar lo scartava. Aggiunto created/updated nella cache eventi, propagato nel record lead-contattato (eventCreated) e mostrato nella card calendario.'
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
