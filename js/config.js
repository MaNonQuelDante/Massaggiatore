/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.61',
    fullName: 'v2.5.61 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    lastUpdate: '2026-06-17 - Sezione Lead, 3 interventi collegati: (1) flag "Appuntamento confermato" per card lead che CONGELA il funnel (step scrivere/sollecitare/chiamata/noshow disabilitati ma visibili, orari barrati; ingresso resta attivo; tag verde; bottone Gruppo NoShow nascosto) — memo/conferma lettura/riscontro/riconferma NON toccati. (2) Barra in cima con contatore live confermati/non confermati + filtro Tutti/Non confermati/Confermati (in memoria, non persistito). (3) Le spunte del funnel popolano il log della card con timestamp CONGELATO alla prima spunta (riusato a ogni ri-spunto, mai Date.now()); "ingresso" usa T0 dell\'evento "LEAD - Call". Persistenza: leadChecklistState INVARIATO (zero migrazione), due nuovi file Drive affiancati testmess_lead_confirmed.json e testmess_lead_checklist_times.json.'
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
