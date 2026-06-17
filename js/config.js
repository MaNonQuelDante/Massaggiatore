/* ================================================================================
   TESTmess - VERSION CONFIG
   ================================================================================ */

// Configurazione centralizzata della versione
const APP_CONFIG = {
    name: 'TESTmess',
    version: '2.5.65',
    fullName: 'v2.5.65 by Dante',
    description: 'Stock Gain Messenger',
    author: 'Dante',
    lastUpdate: '2026-06-17 - Rubrica: (1) RICERCA unificata stile Google People — cerchi per NOME o per NUMERO e una tendina mostra tutti i match (accent-insensitive, es. "nicol" → Nicola e Nicolò); clic su un risultato apre la scheda lead (riusa il deep-link sezione Lead). (2) Cache contatti SEMPRE fresca e multi-dispositivo: auto-sync silenzioso in background se la cache è vuota o vecchia >1h (al load e su auth-ready), così da un device nuovo trovi subito i numeri; saveContactToGoogle ora salva anche nome/società/resourceName (prima si perdevano). (3) Write-back: updateContactInGoogle aggiorna il contatto su Google People (people.updateContact con etag), non solo in locale. (4) Salvataggio: opzioni "FE - Lead" / "SG - Lead" + "Altro…" con campo libero. (5) Casing: helper Title Case UNICO (toTitleCaseNome) — niente più titoli evento in MAIUSCOLO, "DANTE DAVIDE CIAVARELLA" → "Dante Davide Ciavarella" (De Luca, D\'Angelo, Anna-Maria gestiti), in scrittura su Calendar. (6) RICOLLEGATA la verifica "lead non in rubrica" (getUnsavedContacts) con bottone dedicato + azioni Salva/Aggiorna/Ignora.'
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
