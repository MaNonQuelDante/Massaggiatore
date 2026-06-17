/* ================================================================================
   RUBRICA - TESTmess v2.5.8
   
   Gestisce l'elenco dei contatti NON ancora salvati in rubrica Google.
   Mostra una sezione laterale con i nominativi da salvare.
   
   CHANGELOG v2.5.8:
   - 🐛 FIX CRITICO: mostraNotifica → showNotification (era undefined)
   - 🐛 FIX CRITICO: Export showNotification in main.js
   - ✅ Auto-logout forzato su errore 401 (token scaduto)
   - ✅ Messaggio notifica ora funziona correttamente
   
   CHANGELOG v2.5.6:
   - 🐛 FIX CRITICO: Corretto syncSavedContactsFromGoogle() - ora usa API corretta
   - 🐛 FIX CRITICO: markContactAsSaved() ora SALVA DAVVERO in Google Contacts
   - 🐛 FIX CRITICO: saveContactToGoogle() unificato con normalizzazione corretta
   - ✅ Spinner e disable pulsanti durante salvataggio (no doppio click)
   - ✅ Error handling specifico (401, 403, 409, 429, 500)
   - ✅ Cache ridotta a 10 minuti (era 1 ora)
   - ✅ Auto-refresh UI dopo ogni operazione
   
   CHANGELOG v2.3.1:
   - ✅ Auth Guard: Blocca tutti i dati senza login Google
   - ✅ Scan 12 mesi da Google Drive + Calendar API (non localStorage)
   - ✅ Rate limiting + retry logic con exponential backoff
   - ✅ Token validation prima di ogni chiamata API
   - ✅ Paginazione contatti (primi 100 + "mostra altri")
   - ✅ Disabilita pulsante durante scan (no doppio click)
   - ✅ Error handling robusto (fallback localStorage se Drive fail)
   ================================================================================ */

const STORAGE_KEYS_RUBRICA = {
    SAVED_CONTACTS: 'sgmess_saved_contacts', // Cache dei contatti già salvati
    LAST_RUBRICA_SYNC: 'sgmess_last_rubrica_sync',
    SCAN_CACHE: 'sgmess_rubrica_scan_cache', // Cache risultati scan
    SCAN_CACHE_TIMESTAMP: 'sgmess_rubrica_scan_timestamp',
    DATE_RANGE_START: 'sgmess_rubrica_date_start', // v2.5.22: Data inizio filtro
    DATE_RANGE_END: 'sgmess_rubrica_date_end' // v2.5.22: Data fine filtro
};

// Config
const RUBRICA_CONFIG = {
    MAX_CALENDARS: 10, // Max calendari da processare (tutti)
    MAX_EVENTS_PER_CALENDAR: 2500,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_BASE: 1000, // ms
    CACHE_DURATION: 10 * 60 * 1000, // 10 minuti in ms (ridotto da 1 ora)
    CONTACTS_PER_PAGE: 100,
    DEFAULT_DAYS_BACK: 7, // v2.5.22: Default giorni indietro
    DEFAULT_DAYS_FORWARD: 10, // v2.5.22: Default giorni avanti
    MAX_DAYS_RANGE: 180 // v2.5.22: Max range selezionabile (90 + 90)
};

// Flag per prevenire doppi scan
let isScanningContacts = false;

// ===== INIZIALIZZAZIONE =====
function initRubrica() {
    console.log('📒 Rubrica module v2.5.65 initialized - Ricerca nome/numero (tendina) + cache auto-sync multi-device + write-back + verifica lead non in rubrica');

    // Inizializza date picker con valori default (no-op se il DOM è stato rimosso)
    initDateRangePicker();

    // Event listener per pulsante sincronizza rubrica
    const syncBtn = document.getElementById('syncRubricaBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            await syncSavedContactsFromGoogle();
        });
    }

    // Event listener per pulsante applica filtro date (no-op se rimosso)
    const applyFilterBtn = document.getElementById('applyDateFilterBtn');
    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', async () => {
            await applyDateRangeFilter();
        });
    }

    // Event listener per cambio date (aggiorna contatore giorni) (no-op se rimosso)
    const dateStartInput = document.getElementById('rubricaDateStart');
    const dateEndInput = document.getElementById('rubricaDateEnd');

    if (dateStartInput && dateEndInput) {
        dateStartInput.addEventListener('change', updateDateRangeInfo);
        dateEndInput.addEventListener('change', updateDateRangeInfo);
    }

    // v2.5.58: form "Aggiungi numero" (Nome / Cognome / Numero / FE-SG / Società)
    const addForm = document.getElementById('rubricaAddForm');
    if (addForm) {
        addForm.addEventListener('submit', handleRubricaAddSubmit);
    }

    // v2.5.65: il campo "Altro" (società libera) si mostra solo se Tipo lead = ALTRO
    const tipoSel = document.getElementById('rubricaAddTipo');
    if (tipoSel) {
        tipoSel.addEventListener('change', updateSocietaFieldVisibility);
        updateSocietaFieldVisibility(); // stato iniziale
    }

    // v2.5.58: verifica se un numero è già in rubrica (retrocompat: se l'input esiste ancora)
    const verifyBtn = document.getElementById('rubricaVerifyBtn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', verifyNumberInRubrica);
    }
    const verifyInput = document.getElementById('rubricaVerifyInput');
    if (verifyInput) {
        verifyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); verifyNumberInRubrica(); }
        });
    }

    // v2.5.65: RICERCA unificata (nome O numero), tendina stile Google People
    const searchInput = document.getElementById('rubricaSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => renderRubricaSearchResults(searchInput.value));
        // chiudi la tendina cliccando fuori
        document.addEventListener('click', (e) => {
            const box = document.getElementById('rubricaSearchResults');
            if (box && !box.contains(e.target) && e.target !== searchInput) {
                box.style.display = 'none';
            }
        });
        // click su un risultato → apri la scheda lead
        const resultsBox = document.getElementById('rubricaSearchResults');
        if (resultsBox) {
            resultsBox.addEventListener('click', (e) => {
                const item = e.target.closest('.rubrica-search-item');
                if (!item) return;
                openLeadFromRubrica({
                    nome: item.dataset.nome || '',
                    telefono: item.dataset.telefono || '',
                    societa: item.dataset.societa || '',
                    resourceName: item.dataset.resource || ''
                });
                resultsBox.style.display = 'none';
            });
        }
    }

    // v2.5.65: bottone "Verifica lead non in rubrica" (RICOLLEGATA la funzione persa)
    const checkUnsavedBtn = document.getElementById('rubricaCheckUnsavedBtn');
    if (checkUnsavedBtn) {
        checkUnsavedBtn.addEventListener('click', renderUnsavedLeadsCheck);
    }

    // v2.5.65: handler delegati per i bottoni "Aggiorna"/"Ignora" della lista da-aggiornare
    const unsavedBox = document.getElementById('rubricaUnsavedList');
    if (unsavedBox) {
        unsavedBox.addEventListener('click', handleUnsavedListClick);
    }

    // v2.5.65: auto-sync cache se vuota/vecchia (subito se loggato, altrimenti su auth-ready)
    autoSyncRubricaIfStale();
    window.addEventListener('auth-ready', autoSyncRubricaIfStale);
}

// ===== v2.5.65: MOSTRA/NASCONDI CAMPO "ALTRO" (società libera) =====
function updateSocietaFieldVisibility() {
    const tipo = (document.getElementById('rubricaAddTipo')?.value || '').toUpperCase();
    const wrap = document.getElementById('rubricaAddSocietaWrap');
    if (wrap) wrap.style.display = (tipo === 'ALTRO') ? 'block' : 'none';
}
window.updateSocietaFieldVisibility = updateSocietaFieldVisibility;

// ===== v2.5.58: DERIVA "FE - Lead" / "SG - Lead" DAL TIPO LEAD =====
// Accetta 'FE'/'SG' (dal selettore) oppure il valore servizio ('Finanza Efficace'/'Stock Gain').
function societaFromTipoLead(tipo) {
    const t = (tipo || '').toString().toUpperCase();
    if (t.includes('ALTRO')) return ''; // v2.5.65: "Altro" → società libera (la decide il chiamante)
    if (t.includes('FE') || t.includes('FINANZA')) return 'FE - Lead';
    if (t.includes('SG') || t.includes('STOCK')) return 'SG - Lead';
    return 'SG - Lead'; // fallback storico
}
window.societaFromTipoLead = societaFromTipoLead;

// ===== v2.5.58: SUBMIT FORM "AGGIUNGI NUMERO" =====
async function handleRubricaAddSubmit(e) {
    if (e) e.preventDefault();

    // v2.5.65: normalizzo nome/cognome a Title Case in scrittura (no MAIUSCOLO barbaro)
    const nome = capitalizeNome((document.getElementById('rubricaAddNome')?.value || '').trim());
    const cognome = capitalizeNome((document.getElementById('rubricaAddCognome')?.value || '').trim());
    const telefono = (document.getElementById('rubricaAddTelefono')?.value || '').trim();
    const tipo = document.getElementById('rubricaAddTipo')?.value || 'SG';
    const societaInput = (document.getElementById('rubricaAddSocieta')?.value || '').trim();

    if (!window.accessToken) {
        showNotification('Connetti Google per salvare in rubrica', 'error');
        return;
    }
    if (!nome) {
        showNotification('⚠️ Inserisci almeno il nome', 'error');
        return;
    }
    // Riusa la validazione numero esistente
    if (!formatPhoneForGoogle(telefono)) {
        showNotification('❌ Numero di telefono non valido', 'error');
        return;
    }

    // v2.5.65: Società dalle opzioni FE/SG - Lead, oppure campo "Altro" libero.
    let societa;
    if ((tipo || '').toUpperCase() === 'ALTRO') {
        if (!societaInput) {
            showNotification('⚠️ Con "Altro" scrivi cosa mettere nel campo Società', 'error');
            return;
        }
        societa = societaInput;
    } else {
        societa = societaFromTipoLead(tipo);
    }

    const btn = document.getElementById('rubricaAddBtn');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...'; }

    const success = await saveContactToGoogle({ nome, cognome, telefono, societa });

    if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }

    if (success) {
        // Pulisci il form (lascia il selettore FE/SG com'è)
        ['rubricaAddNome', 'rubricaAddCognome', 'rubricaAddTelefono', 'rubricaAddSocieta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }
}
window.handleRubricaAddSubmit = handleRubricaAddSubmit;

// ===== v2.5.58: VERIFICA NUMERO IN RUBRICA =====
function verifyNumberInRubrica() {
    const input = document.getElementById('rubricaVerifyInput');
    const result = document.getElementById('rubricaVerifyResult');
    if (!input || !result) return;

    const phone = (input.value || '').trim();
    if (!phone) {
        result.innerHTML = '<span style="color: var(--gray-500);">Inserisci un numero da verificare.</span>';
        return;
    }
    if (!normalizeForComparison(phone)) {
        result.innerHTML = '<span style="color: var(--error-color);"><i class="fas fa-times-circle"></i> Numero non valido.</span>';
        return;
    }

    const check = isPhoneInRubrica(phone);
    if (check.present) {
        const soc = check.savedContact && check.savedContact.societa ? ` · ${check.savedContact.societa}` : '';
        const nome = check.savedContact && check.savedContact.nome ? ` (${check.savedContact.nome})` : '';
        result.innerHTML = `<span style="color: var(--success-color);"><i class="fas fa-check-circle"></i> Già in rubrica${nome}${soc}</span>`;
    } else {
        result.innerHTML = '<span style="color: var(--warning-color);"><i class="fas fa-exclamation-circle"></i> NON presente in rubrica. Usa il form sopra per aggiungerlo.</span>';
    }
}
window.verifyNumberInRubrica = verifyNumberInRubrica;

// ===== INIZIALIZZA DATE RANGE PICKER =====
function initDateRangePicker() {
    const dateStartInput = document.getElementById('rubricaDateStart');
    const dateEndInput = document.getElementById('rubricaDateEnd');
    
    if (!dateStartInput || !dateEndInput) return;
    
    // Leggi date salvate o usa default
    const savedStart = localStorage.getItem(STORAGE_KEYS_RUBRICA.DATE_RANGE_START);
    const savedEnd = localStorage.getItem(STORAGE_KEYS_RUBRICA.DATE_RANGE_END);
    
    const today = new Date();
    
    // Data inizio: oggi - 7 giorni (default ottimale per performance)
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - RUBRICA_CONFIG.DEFAULT_DAYS_BACK);
    
    // Data fine: oggi + 10 giorni
    const defaultEnd = new Date(today);
    defaultEnd.setDate(defaultEnd.getDate() + RUBRICA_CONFIG.DEFAULT_DAYS_FORWARD);
    
    // Imposta valori (usa salvati se esistono, altrimenti default)
    dateStartInput.value = savedStart || defaultStart.toISOString().split('T')[0];
    dateEndInput.value = savedEnd || defaultEnd.toISOString().split('T')[0];
    
    // Imposta limiti min/max
    const minDate = new Date(today);
    minDate.setDate(minDate.getDate() - 90);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 90);
    
    dateStartInput.min = minDate.toISOString().split('T')[0];
    dateStartInput.max = maxDate.toISOString().split('T')[0];
    dateEndInput.min = minDate.toISOString().split('T')[0];
    dateEndInput.max = maxDate.toISOString().split('T')[0];
    
    // Aggiorna info range
    updateDateRangeInfo();
    
    console.log(`📅 Date picker inizializzato: ${dateStartInput.value} → ${dateEndInput.value}`);
}

// ===== AGGIORNA INFO RANGE GIORNI =====
function updateDateRangeInfo() {
    const dateStartInput = document.getElementById('rubricaDateStart');
    const dateEndInput = document.getElementById('rubricaDateEnd');
    const dateRangeDays = document.getElementById('dateRangeDays');
    
    if (!dateStartInput || !dateEndInput || !dateRangeDays) return;
    
    const start = new Date(dateStartInput.value);
    const end = new Date(dateEndInput.value);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        dateRangeDays.textContent = '0';
        return;
    }
    
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    dateRangeDays.textContent = diffDays;
    
    // Warning se range troppo grande
    if (diffDays > RUBRICA_CONFIG.MAX_DAYS_RANGE) {
        dateRangeDays.parentElement.style.color = 'var(--error-color)';
        dateRangeDays.parentElement.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Range troppo grande: ${diffDays} giorni (max ${RUBRICA_CONFIG.MAX_DAYS_RANGE})`;
    } else {
        dateRangeDays.parentElement.style.color = 'var(--gray-600)';
        dateRangeDays.parentElement.innerHTML = `<i class="fas fa-info-circle"></i> Range: <span id="dateRangeDays">${diffDays}</span> giorni`;
    }
}

// ===== APPLICA FILTRO DATE =====
async function applyDateRangeFilter() {
    const dateStartInput = document.getElementById('rubricaDateStart');
    const dateEndInput = document.getElementById('rubricaDateEnd');
    
    if (!dateStartInput || !dateEndInput) return;
    
    const start = new Date(dateStartInput.value);
    const end = new Date(dateEndInput.value);
    
    // Validazione
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        showNotification('⚠️ Seleziona date valide', 'error');
        return;
    }
    
    if (start > end) {
        showNotification('⚠️ Data inizio deve essere prima della data fine', 'error');
        return;
    }
    
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > RUBRICA_CONFIG.MAX_DAYS_RANGE) {
        showNotification(`⚠️ Range troppo grande (${diffDays} giorni, max ${RUBRICA_CONFIG.MAX_DAYS_RANGE})`, 'error');
        return;
    }
    
    // Salva date in localStorage
    localStorage.setItem(STORAGE_KEYS_RUBRICA.DATE_RANGE_START, dateStartInput.value);
    localStorage.setItem(STORAGE_KEYS_RUBRICA.DATE_RANGE_END, dateEndInput.value);
    
    console.log(`✅ Filtro applicato: ${dateStartInput.value} → ${dateEndInput.value} (${diffDays} giorni)`);
    showNotification(`✅ Filtro applicato: ${diffDays} giorni`, 'success');
    
    // Ricarica contatti con nuovo filtro
    await renderRubricaList();
}

// ===== UTILITY: SLEEP =====
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== UTILITY: VALIDA TOKEN =====
function checkTokenValidity() {
    if (!window.accessToken) {
        throw new Error('TOKEN_EXPIRED');
    }
    return true;
}

// ===== UTILITY: RETRY LOGIC =====
async function retryWithBackoff(fn, retries = RUBRICA_CONFIG.RETRY_ATTEMPTS) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            
            const delay = RUBRICA_CONFIG.RETRY_DELAY_BASE * Math.pow(2, i);
            console.warn(`⚠️ Retry ${i + 1}/${retries} dopo ${delay}ms...`);
            await sleep(delay);
        }
    }
}

// ===== OTTIENI CONTATTI NON SALVATI (CON CACHE) =====
async function getUnsavedContacts(forceRefresh = false) {
    // 🔒 AUTH GUARD: Blocca senza login
    if (!window.accessToken) {
        console.warn('⚠️ Nessun accessToken, login richiesto');
        return [];
    }
    
    // Previeni scan simultanei
    if (isScanningContacts) {
        console.warn('⚠️ Scan già in corso, attendere...');
        return [];
    }
    
    // Controlla cache (1 ora)
    if (!forceRefresh) {
        const cachedData = localStorage.getItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE);
        const cacheTimestamp = parseInt(localStorage.getItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE_TIMESTAMP) || '0');
        
        if (cachedData && (Date.now() - cacheTimestamp) < RUBRICA_CONFIG.CACHE_DURATION) {
            console.log('📦 Uso cache rubrica (valida per altri ' + Math.round((RUBRICA_CONFIG.CACHE_DURATION - (Date.now() - cacheTimestamp)) / 60000) + ' min)');
            const parsed = JSON.parse(cachedData);
            // v2.5.23: Supporta vecchio formato (array) e nuovo (object con unsaved/toUpdate)
            if (Array.isArray(parsed)) {
                return { unsaved: parsed, toUpdate: [] }; // Vecchio formato
            }
            return parsed; // Nuovo formato
        }
    }
    
    isScanningContacts = true;
    
    try {
        // 1. Carica cronologia messaggi DA GOOGLE DRIVE (con fallback localStorage)
        let cronologia = [];
        if (window.DriveStorage && window.accessToken) {
            try {
                checkTokenValidity();
                const driveData = await window.DriveStorage.load(STORAGE_KEYS.CRONOLOGIA);
                if (driveData) {
                    cronologia = driveData;
                    console.log(`📂 Caricati ${cronologia.length} messaggi da Drive`);
                }
            } catch (e) {
                if (e.message === 'TOKEN_EXPIRED') {
                    console.error('❌ Token scaduto, rifare login');
                    if (window.showNotification) {
                        showNotification('⚠️ Sessione scaduta, rifare login Google', 'error');
                    }
                    return [];
                }
                console.warn('⚠️ Drive fallito, uso localStorage fallback:', e);
                // Fallback localStorage (solo session corrente)
                const localCronologia = localStorage.getItem(STORAGE_KEYS.CRONOLOGIA);
                if (localCronologia) {
                    cronologia = JSON.parse(localCronologia);
                    console.log(`📂 Fallback localStorage: ${cronologia.length} messaggi`);
                }
            }
        } else {
            // 🔥 FIX v2.5.14: Se non loggato, usa localStorage comunque
            const localCronologia = localStorage.getItem(STORAGE_KEYS.CRONOLOGIA);
            if (localCronologia) {
                cronologia = JSON.parse(localCronologia);
                console.log(`📂 Caricati ${cronologia.length} messaggi da localStorage (offline)`);
            }
        }
        
        // 2. Carica TUTTI gli eventi calendario degli ultimi 12 mesi DA GOOGLE CALENDAR API
        let calendarEvents = [];
        if (window.accessToken && window.gapi && window.gapi.client && window.gapi.client.calendar) {
            try {
                checkTokenValidity();
                
                // v2.5.22: Usa date range da localStorage o default
                const savedStart = localStorage.getItem(STORAGE_KEYS_RUBRICA.DATE_RANGE_START);
                const savedEnd = localStorage.getItem(STORAGE_KEYS_RUBRICA.DATE_RANGE_END);
                
                let timeMin, timeMax;
                
                if (savedStart && savedEnd) {
                    // Usa range salvato
                    timeMin = new Date(savedStart).toISOString();
                    timeMax = new Date(savedEnd + 'T23:59:59').toISOString(); // Fine giornata
                    console.log(`📅 Caricamento eventi calendario con filtro: ${savedStart} → ${savedEnd}`);
                } else {
                    // Fallback: oggi - 7 giorni → oggi + 10 giorni
                    const now = new Date();
                    const startDate = new Date();
                    startDate.setDate(startDate.getDate() - RUBRICA_CONFIG.DEFAULT_DAYS_BACK);
                    const endDate = new Date();
                    endDate.setDate(endDate.getDate() + RUBRICA_CONFIG.DEFAULT_DAYS_FORWARD);
                    
                    timeMin = startDate.toISOString();
                    timeMax = endDate.toISOString();
                    console.log(`📅 Caricamento eventi calendario (default range: -${RUBRICA_CONFIG.DEFAULT_DAYS_BACK} / +${RUBRICA_CONFIG.DEFAULT_DAYS_FORWARD} giorni)`);
                }
                
                // Ottieni lista calendari con retry
                const calendarListResponse = await retryWithBackoff(async () => {
                    return await window.gapi.client.calendar.calendarList.list();
                });
                
                const calendars = calendarListResponse.result.items || [];
                console.log(`📆 Trovati ${calendars.length} calendari`);
                
                // Limita a max calendari configurati
                const calendarsToProcess = calendars.slice(0, RUBRICA_CONFIG.MAX_CALENDARS);
                
                // Per ogni calendario, carica eventi con retry
                for (const calendar of calendarsToProcess) {
                    try {
                        checkTokenValidity(); // Verifica prima di ogni chiamata
                        
                        const eventsResponse = await retryWithBackoff(async () => {
                            return await window.gapi.client.calendar.events.list({
                                calendarId: calendar.id,
                                timeMin: timeMin,
                                timeMax: timeMax,
                                maxResults: RUBRICA_CONFIG.MAX_EVENTS_PER_CALENDAR,
                                singleEvents: true,
                                orderBy: 'startTime'
                            });
                        });
                        
                        const events = eventsResponse.result.items || [];
                        
                        // Aggiungi nome calendario a ogni evento
                        events.forEach(event => {
                            calendarEvents.push({
                                ...event,
                                calendarName: calendar.summary,
                                start: event.start.dateTime || event.start.date
                            });
                        });
                        
                        console.log(`  ✅ ${calendar.summary}: ${events.length} eventi`);
                    } catch (err) {
                        console.warn(`⚠️ Skip calendario ${calendar.summary}:`, err.message);
                        // Continua con altri calendari anche se uno fallisce
                    }
                }
                
                console.log(`📅 TOTALE: ${calendarEvents.length} eventi ultimi 12 mesi`);
            } catch (e) {
                if (e.message === 'TOKEN_EXPIRED') {
                    console.error('❌ Token scaduto durante scan calendario');
                    if (window.showNotification) {
                        showNotification('⚠️ Sessione scaduta, rifare login Google', 'error');
                    }
                    return [];
                }
                console.error('❌ Errore caricamento eventi calendario:', e);
            }
        }
        
        // 3. Carica cache contatti salvati E crea Map per O(1) lookup
        const savedContactsJSON = localStorage.getItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS);
        let savedContacts = {};
        const savedNumbersSet = new Set(); // v2.5.22: Set per confronto veloce
        
        if (savedContactsJSON) {
            try {
                savedContacts = JSON.parse(savedContactsJSON);
                // Popola Set con numeri normalizzati per confronto
                Object.keys(savedContacts).forEach(phone => {
                    const normalized = normalizeForComparison(phone);
                    if (normalized) savedNumbersSet.add(normalized);
                });
                console.log(`📞 Caricati ${savedNumbersSet.size} numeri già salvati (Set per confronto veloce)`);
            } catch (e) {
                console.error('❌ Errore parsing saved contacts:', e);
            }
        }
        
        // 4. Estrai contatti unici dalla cronologia
        const uniqueContacts = {};
        const contactsToUpdate = {}; // v2.5.23: NUOVO - contatti con incongruenze
        
        cronologia.forEach(entry => {
            const phone = normalizePhone(entry.telefono);
            if (!phone) return; // Skip se non c'è telefono
            
            // v2.5.22: Usa normalizeForComparison per check duplicati (+39 agnostic)
            const phoneForComparison = normalizeForComparison(phone);
            const isDuplicate = savedNumbersSet.has(phoneForComparison);
            
            // Se non è già salvato E non è già nella lista
            if (!isDuplicate && !uniqueContacts[phoneForComparison]) {
                uniqueContacts[phoneForComparison] = {
                    nome: entry.nome || '',
                    cognome: entry.cognome || '',
                    telefono: entry.telefono,
                    societa: entry.societa || '',
                    servizio: entry.servizio || '',
                    timestamp: entry.timestamp || new Date().toISOString(),
                    source: 'cronologia'
                };
            }
            // v2.5.23: NUOVO - Se è già salvato, verifica incongruenze società
            else if (isDuplicate) {
                const savedContact = savedContacts[phone] || savedContacts[phoneForComparison];
                if (savedContact && savedContact.societa !== undefined) {
                    const updateCheck = needsSocietaUpdate(savedContact.societa, entry.societa);
                    if (updateCheck.needsUpdate) {
                        contactsToUpdate[phoneForComparison] = {
                            nome: entry.nome || savedContact.nome || '',
                            cognome: entry.cognome || '',
                            telefono: entry.telefono,
                            societaSalvata: savedContact.societa || '',
                            societaEvento: entry.societa || '',
                            servizio: entry.servizio || '',
                            timestamp: entry.timestamp || new Date().toISOString(),
                            source: 'cronologia',
                            updateReason: updateCheck.reason,
                            updatePriority: updateCheck.priority,
                            resourceName: savedContact.resourceName // Per update Google
                        };
                    }
                }
            }
        });
        
        // 5. Estrai contatti dagli eventi calendario
        calendarEvents.forEach(event => {
            // Estrai dati dall'evento
            const contactData = extractContactFromEvent(event);
            if (!contactData) return; // Skip se non riesce a estrarre
            
            const phone = normalizePhone(contactData.telefono);
            if (!phone) return; // Skip se non c'è telefono
            
            // v2.5.22: Usa normalizeForComparison per check duplicati (+39 agnostic)
            const phoneForComparison = normalizeForComparison(phone);
            const isDuplicate = savedNumbersSet.has(phoneForComparison);
            
            // Se non è già salvato E non è già nella lista
            if (!isDuplicate && !uniqueContacts[phoneForComparison]) {
                uniqueContacts[phoneForComparison] = {
                    nome: contactData.nome || '',
                    cognome: contactData.cognome || '',
                    telefono: contactData.telefono,
                    societa: contactData.societa || '',
                    servizio: contactData.servizio || '',
                    timestamp: event.start || new Date().toISOString(),
                    source: 'calendario',
                    calendarName: event.calendarName || ''
                };
            }
            // v2.5.23: NUOVO - Se è già salvato, verifica incongruenze società
            else if (isDuplicate && !contactsToUpdate[phoneForComparison]) { // Evita duplicati cronologia
                const savedContact = savedContacts[phone] || savedContacts[phoneForComparison];
                if (savedContact && savedContact.societa !== undefined) {
                    const updateCheck = needsSocietaUpdate(savedContact.societa, contactData.societa);
                    if (updateCheck.needsUpdate) {
                        contactsToUpdate[phoneForComparison] = {
                            nome: contactData.nome || savedContact.nome || '',
                            cognome: contactData.cognome || '',
                            telefono: contactData.telefono,
                            societaSalvata: savedContact.societa || '',
                            societaEvento: contactData.societa || '',
                            servizio: contactData.servizio || '',
                            timestamp: event.start || new Date().toISOString(),
                            source: 'calendario',
                            calendarName: event.calendarName || '',
                            updateReason: updateCheck.reason,
                            updatePriority: updateCheck.priority,
                            resourceName: savedContact.resourceName // Per update Google
                        };
                    }
                }
            }
        });
        
        // 6. Converti in array e ordina per timestamp (più recenti prima)
        const unsavedArray = Object.values(uniqueContacts);
        unsavedArray.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // v2.5.23: Ordina contatti da aggiornare per priorità
        const toUpdateArray = Object.values(contactsToUpdate);
        const priorityOrder = { 'ALTA': 1, 'MEDIA': 2, 'BASSA': 3 };
        toUpdateArray.sort((a, b) => {
            const priorityDiff = priorityOrder[a.updatePriority] - priorityOrder[b.updatePriority];
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });
        
        // Salva in cache (ENTRAMBE le liste)
        const cacheData = {
            unsaved: unsavedArray,
            toUpdate: toUpdateArray // v2.5.23: NUOVO
        };
        localStorage.setItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE, JSON.stringify(cacheData));
        localStorage.setItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE_TIMESTAMP, Date.now().toString());
        
        console.log('═════════════════════════════════════════════════');
        console.log(`📒 RUBRICA SCAN COMPLETO (v2.5.23):`);
        console.log(`   📂 Cronologia Drive: ${cronologia.length} messaggi`);
        console.log(`   📅 Eventi Calendario: ${calendarEvents.length} eventi`);
        console.log(`   🆕 Contatti da salvare: ${unsavedArray.length}`);
        console.log(`   ⚠️ Contatti da aggiornare: ${toUpdateArray.length}`);
        if (toUpdateArray.length > 0) {
            console.log(`      - Priorità ALTA: ${toUpdateArray.filter(c => c.updatePriority === 'ALTA').length}`);
            console.log(`      - Priorità MEDIA: ${toUpdateArray.filter(c => c.updatePriority === 'MEDIA').length}`);
            console.log(`      - Priorità BASSA: ${toUpdateArray.filter(c => c.updatePriority === 'BASSA').length}`);
        }
        console.log('═════════════════════════════════════════════════');
        
        // v2.5.23: Restituisci ENTRAMBE le liste
        return {
            unsaved: unsavedArray,
            toUpdate: toUpdateArray
        };
        
    } finally {
        isScanningContacts = false;
    }
}

// ===== HELPER: CAPITALIZZA NOME =====
// v2.5.65: delega all'helper Title Case UNIFICATO (google-calendar.js) così la
// normalizzazione è identica ovunque (De Luca, D'Angelo, Anna-Maria, accentate).
function capitalizeNome(text) {
    if (!text) return '';
    if (window.toTitleCaseNome) return window.toTitleCaseNome(text);
    // Fallback (se google-calendar.js non è caricato): comportamento storico
    return text.toLowerCase().split(' ').map(word => {
        if (word.length === 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

// ===== ESTRAI CONTATTO DA EVENTO CALENDARIO =====
function extractContactFromEvent(event) {
    if (!event || !event.summary) return null;
    
    // Pattern per estrarre informazioni da eventi tipo:
    // "15:30 - Mario Rossi (Stock Gain)"
    // "Mario Rossi - Call consulenza"
    
    let nome = '';
    let cognome = '';
    let telefono = '';
    let servizio = '';
    let societa = '';
    
    // 1. Estrai nome dal summary (rimuovi orario se presente)
    let nameText = event.summary.replace(/^\d{1,2}:\d{2}\s*-\s*/, ''); // Rimuovi "15:30 - "
    nameText = nameText.replace(/\s*\([^)]*\)\s*$/, ''); // Rimuovi "(Stock Gain)" finale
    
    // 🔴 FIX v2.5.10: Rimuovi description/note dal nome (es: "Nome: Note" → "Nome")
    nameText = nameText.split(':')[0].trim(); // Prendi solo la parte prima di ":"
    nameText = nameText.trim();
    
    // 2. Split nome e cognome usando database nomi italiani
    if (window.splitNomeCognome) {
        const split = window.splitNomeCognome(nameText);
        nome = split.nome;
        cognome = split.cognome;
    } else {
        // Fallback: primo spazio
        const parts = nameText.split(' ');
        nome = parts[0] || '';
        cognome = parts.slice(1).join(' ') || '';
    }
    
    // 3. Estrai telefono dalla description
    if (event.description) {
        // Pattern: "Telefono: +39 333 1234567" o "Tel: 3331234567"
        const phoneMatch = event.description.match(/(?:telefono|tel|phone|cellulare)[\s:]*([+\d\s\-()]{8,})/i);
        if (phoneMatch) {
            telefono = phoneMatch[1].trim();
        }
        
        // Estrai servizio
        const serviceMatch = event.description.match(/(?:servizio|service)[\s:]*([^\n]+)/i);
        if (serviceMatch) {
            servizio = serviceMatch[1].trim();
        }
    }
    
    // 4. Determina società e servizio usando la funzione condivisa
    if (window.extractServiceFromEvent) {
        const serviceData = window.extractServiceFromEvent(event);
        servizio = serviceData.servizio;
        societa = serviceData.societa;
    } else {
        // Fallback se funzione non disponibile (non dovrebbe mai succedere)
        if (event.calendarName) {
            if (event.calendarName.includes('Stock Gain') || event.calendarName.includes('SG')) {
                societa = 'SG - Lead';
                if (!servizio) servizio = 'Stock Gain';
            } else if (event.calendarName.includes('Finanza Efficace') || event.calendarName.includes('FE')) {
                societa = 'FE - Lead';
                if (!servizio) servizio = 'Finanza Efficace';
            }
        }
    }
    
    // Se non ha telefono, cerca nell'attendees
    if (!telefono && event.attendees && event.attendees.length > 0) {
        event.attendees.forEach(attendee => {
            if (attendee.email && attendee.email.includes('@')) {
                // Cerca numero nel nome dell'attendee
                const phoneMatch = (attendee.displayName || attendee.email).match(/([+\d\s\-()]{8,})/);
                if (phoneMatch && !telefono) {
                    telefono = phoneMatch[1].trim();
                }
            }
        });
    }
    
    // Ritorna solo se abbiamo almeno nome e telefono
    if (nome && telefono) {
        return {
            nome: capitalizeNome(nome),
            cognome: capitalizeNome(cognome),
            telefono,
            servizio,
            societa
        };
    }
    
    return null;
}

// ===== NORMALIZZA NUMERO TELEFONO (UNIFICATO) =====
function normalizePhone(phone) {
    if (!phone) return null;
    
    // Rimuovi TUTTI i caratteri non numerici (spazi, +, -, (, ), ecc)
    let cleaned = phone.replace(/[^\d]/g, '');
    
    // Rimuovi prefisso 00 se presente (es: 00393331234567 → 393331234567)
    if (cleaned.startsWith('00')) {
        cleaned = cleaned.substring(2);
    }
    
    // Se ha 10 cifre e inizia con 3, aggiungi prefisso Italia 39
    if (cleaned.length === 10 && cleaned.startsWith('3')) {
        cleaned = '39' + cleaned;
    }
    
    // Valida lunghezza finale (minimo 10 cifre)
    return cleaned.length >= 10 ? cleaned : null;
}

// ===== NORMALIZZA PER CONFRONTO DUPLICATI (v2.5.22) =====
// Rimuove prefisso +39 in modo che +393331234567 === 3331234567
function normalizeForComparison(phone) {
    if (!phone) return null;
    
    // Rimuovi tutti i caratteri non numerici
    let cleaned = phone.replace(/[^\d]/g, '');
    
    // Rimuovi prefisso 00 se presente
    if (cleaned.startsWith('00')) {
        cleaned = cleaned.substring(2);
    }
    
    // CRITICO: Rimuovi prefisso 39 per confronto locale
    // +393331234567 → 3331234567
    // 393331234567 → 3331234567
    if (cleaned.startsWith('39') && cleaned.length > 10) {
        cleaned = cleaned.substring(2);
    }
    
    // Valida lunghezza (minimo 9 cifre dopo rimozione prefisso)
    return cleaned.length >= 9 ? cleaned : null;
}

// ===== FORMATTA TELEFONO PER GOOGLE (con +) =====
function formatPhoneForGoogle(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;

    // Aggiungi + se non c'è già
    return normalized.startsWith('+') ? normalized : '+' + normalized;
}

// ===== v2.5.58: È GIÀ IN RUBRICA? (dedup pre-salvataggio automatico) =====
// Confronta il numero contro la cache SAVED_CONTACTS usando la STESSA logica di
// getUnsavedContacts: normalizeForComparison (agnostico al prefisso +39) sia sulla
// chiave del numero in arrivo sia su tutte le chiavi in cache.
// Ritorna { present: bool, savedContact: {…}|null, key: string|null }.
function isPhoneInRubrica(phone) {
    const target = normalizeForComparison(phone);
    if (!target) return { present: false, savedContact: null, key: null };

    const savedContactsJSON = localStorage.getItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS);
    if (!savedContactsJSON) return { present: false, savedContact: null, key: null };

    let savedContacts = {};
    try {
        savedContacts = JSON.parse(savedContactsJSON);
    } catch (e) {
        console.error('❌ Errore parsing saved contacts (isPhoneInRubrica):', e);
        return { present: false, savedContact: null, key: null };
    }

    for (const key of Object.keys(savedContacts)) {
        if (normalizeForComparison(key) === target) {
            return { present: true, savedContact: savedContacts[key], key };
        }
    }
    return { present: false, savedContact: null, key: null };
}

// ===== VERIFICA INCONGRUENZA SOCIETÀ (v2.5.23) =====
// Restituisce {needsUpdate: bool, reason: string, priority: string}
function needsSocietaUpdate(savedSocieta, eventSocieta) {
    const saved = (savedSocieta || '').trim();
    const event = (eventSocieta || '').trim();
    
    // 1. Se rubrica è vuota → SERVE UPDATE
    if (!saved || saved === '') {
        return { 
            needsUpdate: true, 
            reason: 'Campo società vuoto', 
            priority: 'MEDIA',
            savedValue: '(vuoto)',
            eventValue: event || '(nessuna info)'
        };
    }
    
    // 2. Formati vecchi (Stock Gain, Finanza Efficace)
    const oldFormats = ['Stock Gain', 'Finanza Efficace', 'stock gain', 'finanza efficace', 'STOCK GAIN', 'FINANZA EFFICACE'];
    if (oldFormats.some(old => saved.toLowerCase() === old.toLowerCase())) {
        return { 
            needsUpdate: true, 
            reason: 'Formato vecchio (pre-2024)', 
            priority: 'MEDIA',
            savedValue: saved,
            eventValue: event || 'SG - Lead / FE - Lead'
        };
    }
    
    // 3. Refusi comuni (senza trattino, maiuscolo sbagliato, etc)
    const refusi = [
        'SG Lead', 'SG lead', 'sg lead', 'sg - lead',
        'FE Lead', 'FE lead', 'fe lead', 'fe - lead',
        'SG-Lead', 'FE-Lead', 'Sg - Lead', 'Fe - Lead'
    ];
    if (refusi.some(refuso => saved === refuso)) {
        return { 
            needsUpdate: true, 
            reason: 'Refuso formato (maiuscolo/trattino)', 
            priority: 'BASSA',
            savedValue: saved,
            eventValue: event
        };
    }
    
    // 4. Verifica servizio diverso (SG vs FE) → PRIORITÀ ALTA
    const savedService = saved.includes('SG') ? 'SG' : saved.includes('FE') ? 'FE' : null;
    const eventService = event.includes('SG') ? 'SG' : event.includes('FE') ? 'FE' : null;
    
    if (savedService && eventService && savedService !== eventService) {
        return { 
            needsUpdate: true, 
            reason: `⚠️ SERVIZIO DIVERSO: ${savedService} ≠ ${eventService}`, 
            priority: 'ALTA',
            savedValue: saved,
            eventValue: event
        };
    }
    
    // 5. Società generica vs specifica
    const genericFormats = ['SG - Lead', 'FE - Lead'];
    const isGenericSaved = genericFormats.includes(saved);
    const isGenericEvent = genericFormats.includes(event);
    
    if (isGenericSaved && !isGenericEvent && event) {
        return { 
            needsUpdate: true, 
            reason: 'Disponibile versione più specifica', 
            priority: 'BASSA',
            savedValue: saved + ' (generico)',
            eventValue: event + ' (specifico)'
        };
    }
    
    // 6. Formato non riconosciuto (text random)
    const validPatterns = ['SG', 'FE', 'Stock', 'Finanza'];
    const hasValidPattern = validPatterns.some(pattern => saved.includes(pattern));
    
    if (!hasValidPattern && event) {
        return { 
            needsUpdate: true, 
            reason: 'Formato non riconosciuto (testo casuale)', 
            priority: 'ALTA',
            savedValue: saved,
            eventValue: event
        };
    }
    
    // 7. Tutto OK
    return { needsUpdate: false };
}

// ===== MARCA CONTATTO COME GIÀ SALVATO (SENZA SALVARE IN GOOGLE) =====
// Questa funzione NON salva in Google, solo marca nel cache locale
async function markContactAsAlreadySaved(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    
    // Carica cache
    const savedContactsJSON = localStorage.getItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS);
    let savedContacts = {};
    if (savedContactsJSON) {
        try {
            savedContacts = JSON.parse(savedContactsJSON);
        } catch (e) {
            console.error('❌ Errore parsing saved contacts:', e);
        }
    }
    
    // Aggiungi contatto con timestamp
    savedContacts[normalized] = {
        savedAt: new Date().toISOString(),
        manuallyMarked: true // Flag per distinguere da sync Google
    };
    
    // Salva
    localStorage.setItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS, JSON.stringify(savedContacts));
    console.log(`✅ Contatto ${normalized} marcato come già salvato (solo cache locale)`);
    
    // Invalida cache scan
    localStorage.removeItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE);
    localStorage.removeItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE_TIMESTAMP);
    
    // Aggiorna UI
    await renderRubricaList();
}

// ===== RIMUOVI CONTATTO DA SALVATI (per annullare) =====
async function unmarkContactAsSaved(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    
    const savedContactsJSON = localStorage.getItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS);
    let savedContacts = {};
    if (savedContactsJSON) {
        try {
            savedContacts = JSON.parse(savedContactsJSON);
        } catch (e) {
            console.error('❌ Errore parsing saved contacts:', e);
        }
    }
    
    delete savedContacts[normalized];
    localStorage.setItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS, JSON.stringify(savedContacts));
    console.log(`🔄 Contatto ${normalized} rimosso da salvati`);
    
    // Invalida cache scan
    localStorage.removeItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE);
    localStorage.removeItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE_TIMESTAMP);
    
    await renderRubricaList();
}

// ===== SINCRONIZZA CON GOOGLE CONTACTS (API CORRETTA) =====
// v2.5.65: options.silent = true → niente notifiche/spinner UI (usato dall'auto-sync
// in background al primo load su un dispositivo nuovo). Gli errori restano in console.
async function syncSavedContactsFromGoogle(options = {}) {
    const silent = !!options.silent;
    if (!window.accessToken) {
        if (!silent) showNotification('Connetti Google per sincronizzare la rubrica', 'error');
        return;
    }

    // Disabilita pulsante durante sync
    const syncBtn = document.getElementById('syncRubricaBtn');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizzazione...';
    }

    try {
        checkTokenValidity();
        if (!silent) showNotification('🔄 Sincronizzazione rubrica Google in corso...', 'info');
        console.log('📇 Sincronizzazione rubrica Google...' + (silent ? ' (auto, silenziosa)' : ''));
        
        // ✅ CORRETTO: Usa gapi.client.request con URL diretto
        // API: https://people.googleapis.com/v1/people/me/connections
        // v2.5.23: Aggiungi organizations per controllo società
        const response = await retryWithBackoff(async () => {
            return await gapi.client.request({
                'path': 'https://people.googleapis.com/v1/people/me/connections',
                'method': 'GET',
                'params': {
                    'resourceName': 'people/me',
                    'pageSize': 1000,
                    'personFields': 'names,phoneNumbers,organizations' // ✅ AGGIUNTO organizations
                }
            });
        });
        
        const connections = response.result.connections || [];
        console.log(`✅ Trovati ${connections.length} contatti in Google`);
        
        // Estrai numeri di telefono normalizzati + società
        const savedContacts = {};
        connections.forEach(person => {
            if (person.phoneNumbers) {
                // Estrai società (organization)
                let societa = '';
                if (person.organizations && person.organizations.length > 0) {
                    societa = person.organizations[0].name || '';
                }
                
                // Estrai nome completo
                let nomeCompleto = '';
                if (person.names && person.names.length > 0) {
                    nomeCompleto = person.names[0].displayName || '';
                }
                
                person.phoneNumbers.forEach(phoneObj => {
                    const normalized = normalizePhone(phoneObj.value);
                    if (normalized) {
                        savedContacts[normalized] = {
                            savedAt: new Date().toISOString(),
                            fromGoogle: true,
                            societa: societa, // ✅ NUOVO: salva società
                            nome: nomeCompleto, // ✅ NUOVO: salva nome
                            resourceName: person.resourceName // ✅ NUOVO: per update
                        };
                    }
                });
            }
        });
        
        // Salva in localStorage
        localStorage.setItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS, JSON.stringify(savedContacts));
        localStorage.setItem(STORAGE_KEYS_RUBRICA.LAST_RUBRICA_SYNC, new Date().toISOString());
        
        // Invalida cache scan
        localStorage.removeItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE);
        localStorage.removeItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE_TIMESTAMP);
        
        console.log(`💾 ${Object.keys(savedContacts).length} contatti sincronizzati`);
        if (!silent) showNotification(`✅ Rubrica sincronizzata: ${Object.keys(savedContacts).length} contatti`, 'success');

        // Aggiorna UI
        await renderRubricaList();

    } catch (error) {
        console.error('❌ Errore sync rubrica completo:', error);

        // In modalità silenziosa NON mostro popup/forzature logout: solo log.
        if (silent) {
            console.warn('⚠️ Auto-sync rubrica fallito (silenzioso):', error && error.status);
        } else if (error.message === 'TOKEN_EXPIRED') {
            showNotification('⚠️ Sessione scaduta, rifare login Google', 'error');
            // Forza logout
            if (window.handleSignoutClick) {
                setTimeout(() => window.handleSignoutClick(), 1500);
            }
        } else if (error.status === 401) {
            showNotification('❌ Token scaduto - Rifare login', 'error');
            // Forza logout
            if (window.handleSignoutClick) {
                setTimeout(() => window.handleSignoutClick(), 1500);
            }
        } else if (error.status === 403) {
            showNotification('❌ ERRORE 403: Abilita People API su Google Cloud Console', 'error');
            console.error('🔴 ISTRUZIONI: https://console.cloud.google.com/apis/library/people.googleapis.com → ABILITA');
        } else if (error.status === 429) {
            showNotification('⏳ Troppi tentativi, riprova tra qualche minuto', 'error');
        } else {
            showNotification('❌ Errore sincronizzazione rubrica Google', 'error');
        }
    } finally {
        // Re-abilita pulsante
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sincronizza Ora';
        }
    }
}

// ===== SALVA CONTATTO IN GOOGLE CONTACTS (CORRETTO) =====
async function saveContactToGoogle(contactData) {
    if (!window.accessToken) {
        showNotification('Connetti Google per salvare in rubrica', 'error');
        return false;
    }
    
    try {
        checkTokenValidity();
        console.log('💾 Salvataggio contatto in Google Contacts...', contactData);
        
        // Normalizza e formatta telefono con prefisso +
        const formattedPhone = formatPhoneForGoogle(contactData.telefono);
        if (!formattedPhone) {
            showNotification('❌ Numero di telefono non valido', 'error');
            return false;
        }
        
        // Costruisci oggetto contatto per People API
        const contact = {
            names: [{
                givenName: contactData.nome,
                familyName: contactData.cognome || ''
            }],
            phoneNumbers: [{
                value: formattedPhone,
                type: 'mobile'
            }]
        };
        
        // Aggiungi società come organizzazione se presente
        if (contactData.societa) {
            contact.organizations = [{
                name: contactData.societa
                // NON aggiungere title (qualifica) - non serve
            }];
        }
        
        // ✅ CORRETTO: Usa gapi.client.request con URL diretto
        const response = await retryWithBackoff(async () => {
            return await gapi.client.request({
                'path': 'https://people.googleapis.com/v1/people:createContact',
                'method': 'POST',
                'body': contact
            });
        });
        
        console.log('✅ Contatto salvato in Google:', response);

        // Marca come salvato nel cache locale (DOPO conferma Google)
        const normalized = normalizePhone(contactData.telefono);
        const savedContactsJSON = localStorage.getItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS);
        let savedContacts = {};
        if (savedContactsJSON) {
            try {
                savedContacts = JSON.parse(savedContactsJSON);
            } catch (e) {
                console.error('❌ Errore parsing saved contacts:', e);
            }
        }

        // v2.5.65: SALVA anche nome/società/resourceName (prima si perdevano e la
        // ricerca per nome non trovava il contatto finché non rifacevi un sync completo).
        // Stessa forma usata da syncSavedContactsFromGoogle, così la cache resta omogenea.
        const nomeCompleto = `${contactData.nome || ''} ${contactData.cognome || ''}`.trim();
        savedContacts[normalized] = {
            savedAt: new Date().toISOString(),
            fromGoogle: true,
            nome: nomeCompleto,
            societa: contactData.societa || '',
            resourceName: (response && response.result && response.result.resourceName) || ''
        };

        localStorage.setItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS, JSON.stringify(savedContacts));
        
        // Invalida cache scan
        localStorage.removeItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE);
        localStorage.removeItem(STORAGE_KEYS_RUBRICA.SCAN_CACHE_TIMESTAMP);
        
        showNotification(`✅ ${contactData.nome} salvato in rubrica Google`, 'success');
        
        // Aggiorna UI
        await renderRubricaList();
        
        return true;
        
    } catch (error) {
        console.error('❌ Errore salvataggio contatto completo:', error);
        
        // Error handling specifico
        if (error.message === 'TOKEN_EXPIRED') {
            showNotification('⚠️ Sessione scaduta, rifare login Google', 'error');
            // Forza logout
            if (window.handleSignoutClick) {
                setTimeout(() => window.handleSignoutClick(), 1500);
            }
        } else if (error.status === 401) {
            showNotification('❌ Token scaduto - Rifare login', 'error');
            // Forza logout
            if (window.handleSignoutClick) {
                setTimeout(() => window.handleSignoutClick(), 1500);
            }
        } else if (error.status === 403) {
            showNotification('❌ ERRORE 403: Devi abilitare le API su Google Cloud Console', 'error');
            console.error('🔴 ISTRUZIONI PER RISOLVERE 403:');
            console.error('1️⃣ Vai su: https://console.cloud.google.com/apis/library/people.googleapis.com');
            console.error('2️⃣ Clicca "ABILITA" sulla People API');
            console.error('3️⃣ Vai su: https://console.cloud.google.com/apis/library/sheets.googleapis.com');
            console.error('4️⃣ Clicca "ABILITA" sulla Sheets API');
            console.error('5️⃣ Vai su: https://console.cloud.google.com/apis/library/drive.googleapis.com');
            console.error('6️⃣ Clicca "ABILITA" sulla Drive API');
            console.error('7️⃣ Disconnetti e riconnetti Google su TESTmess');
            console.error('✅ Dopo questi passaggi, il salvataggio funzionerà!');
        } else if (error.status === 409) {
            showNotification('ℹ️ Contatto già esistente in rubrica', 'info');
            // Marca comunque come salvato nel cache locale
            await markContactAsAlreadySaved(contactData.telefono);
            return true; // Consideriamo successo
        } else if (error.status === 429) {
            showNotification('⏳ Troppi tentativi, riprova tra qualche minuto', 'error');
        } else {
            showNotification('❌ Errore salvataggio in rubrica Google', 'error');
        }
        return false;
    }
}


// ===== v2.5.23: HELPER per renderizzare contatto da aggiornare =====
function renderContactToUpdate(contact) {
    const priorityColors = {
        'ALTA': 'var(--error-color)',
        'MEDIA': 'var(--warning-color)',
        'BASSA': 'var(--info-color)'
    };
    const color = priorityColors[contact.updatePriority] || 'var(--gray-600)';
    
    return `
        <div class="rubrica-item" style="padding: 12px; border: 2px solid ${color}; border-radius: 8px; margin-bottom: 10px; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: var(--gray-800); margin-bottom: 6px;">
                        <i class="fas fa-user"></i>
                        ${contact.nome} ${contact.cognome || ''}
                    </div>
                    <div style="font-size: 0.9em; color: var(--gray-600); margin-bottom: 4px;">
                        <i class="fas fa-phone"></i> ${contact.telefono}
                    </div>
                    <div style="font-size: 0.85em; margin-top: 8px; padding: 8px; background: #f8f9fa; border-left: 3px solid ${color}; border-radius: 4px;">
                        <div style="font-weight: 500; color: ${color}; margin-bottom: 4px;">
                            <i class="fas fa-exclamation-circle"></i> ${contact.updateReason}
                        </div>
                        <div style="display: flex; gap: 16px; margin-top: 6px;">
                            <div style="flex: 1;">
                                <div style="font-size: 0.8em; color: var(--gray-500); margin-bottom: 2px;">In Rubrica:</div>
                                <div style="font-weight: 500; color: var(--error-color);">
                                    ❌ ${contact.societaSalvata || '(vuoto)'}
                                </div>
                            </div>
                            <div style="flex: 1;">
                                <div style="font-size: 0.8em; color: var(--gray-500); margin-bottom: 2px;">Nell'Evento:</div>
                                <div style="font-weight: 500; color: var(--success-color);">
                                    ✅ ${contact.societaEvento || '(nessuna info)'}
                                </div>
                            </div>
                        </div>
                    </div>
                    ${contact.source ? `
                        <div style="font-size: 0.8em; color: var(--gray-400); margin-top: 6px;">
                            <i class="fas fa-${contact.source === 'calendario' ? 'calendar' : 'history'}"></i> 
                            ${contact.source === 'calendario' ? 'Da calendario' : 'Da cronologia'}
                            ${contact.calendarName ? ` (${contact.calendarName})` : ''}
                        </div>
                    ` : ''}
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-left: 12px;">
                    <button 
                        type="button" 
                        class="btn btn-sm btn-success update-contact-btn"
                        data-phone="${contact.telefono}"
                        data-nome="${contact.nome}"
                        data-cognome="${contact.cognome || ''}"
                        data-societa="${contact.societaEvento || ''}"
                        data-servizio="${contact.servizio || ''}"
                        data-resource="${contact.resourceName || ''}"
                        title="Aggiorna con dati corretti"
                        style="white-space: nowrap;"
                    >
                        <i class="fas fa-sync"></i> Aggiorna
                    </button>
                    <button 
                        type="button" 
                        class="btn btn-sm btn-secondary ignore-update-btn"
                        data-phone="${contact.telefono}"
                        title="Ignora (lascia così)"
                        style="white-space: nowrap;"
                    >
                        <i class="fas fa-times"></i> Ignora
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ===== RENDER LISTA RUBRICA (v2.5.58: PANNELLO DI VERIFICA) =====
// La vecchia lista "contatti da salvare" (con i ✓) è stata RIMOSSA: ora i contatti
// si salvano in automatico all'invio del messaggio (vedi checkAndSaveContact in main.js)
// oppure manualmente col form "Aggiungi numero". Questa funzione mostra solo lo stato
// della rubrica (quanti contatti, ultimo sync) e serve a VERIFICARE, non più a salvare.
async function renderRubricaList() {
    const container = document.getElementById('rubricaList');
    if (!container) return;

    // 🔒 AUTH GUARD: Blocca senza login
    if (!window.accessToken) {
        container.innerHTML = `
            <div class="info-state" style="text-align: center; padding: 40px 20px;">
                <i class="fas fa-lock" style="font-size: 64px; color: var(--gray-400); margin-bottom: 20px;"></i>
                <h3 style="color: var(--gray-800); margin-bottom: 12px;">Login richiesto</h3>
                <p style="color: var(--gray-600);">
                    Effettua il login Google per gestire la rubrica.
                </p>
            </div>
        `;
        return;
    }

    // Conta i contatti in cache (SAVED_CONTACTS) e leggi l'ultimo sync
    let savedCount = 0;
    const savedContactsJSON = localStorage.getItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS);
    if (savedContactsJSON) {
        try {
            savedCount = Object.keys(JSON.parse(savedContactsJSON)).length;
        } catch (e) {
            console.error('❌ Errore parsing saved contacts (render):', e);
        }
    }

    const lastSync = localStorage.getItem(STORAGE_KEYS_RUBRICA.LAST_RUBRICA_SYNC);
    let syncText = 'Mai sincronizzato — premi "Sincronizza Ora" per leggere i contatti da Google.';
    if (lastSync) {
        const d = new Date(lastSync);
        syncText = `Ultimo sync: ${d.toLocaleDateString('it-IT')} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
    }

    container.innerHTML = `
        <div class="rubrica-header" style="padding: 14px; background: var(--gray-100); border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                <i class="fas fa-address-book" style="color: var(--primary-color);"></i>
                <strong style="color: var(--gray-800);">${savedCount} contatti in rubrica (cache locale)</strong>
            </div>
            <small style="color: var(--gray-600);">${syncText}</small>
            <p style="margin-top: 12px; margin-bottom: 0; font-size: 0.9em; color: var(--gray-600);">
                <i class="fas fa-info-circle"></i>
                I contatti dei lead vengono salvati <strong>in automatico</strong> quando invii un messaggio.
                Qui puoi verificare un numero o aggiungerne uno a mano.
            </p>
        </div>
    `;
}

// ===== v2.5.65: AUTO-SYNC CACHE SE VUOTA O VECCHIA (multi-dispositivo) =====
// La cache contatti vive in localStorage: da un dispositivo NUOVO è vuota finché non
// premi "Sincronizza Ora" → la ricerca non trovava niente. Qui la popoliamo da sola in
// background appena c'è il token (al load e all'evento auth-ready), se è vuota o più
// vecchia di FRESHNESS. Niente lag in uso normale: parte una sola volta e in silenzio.
const RUBRICA_CACHE_FRESHNESS_MS = 60 * 60 * 1000; // 1 ora
let autoSyncRubricaInFlight = false;

async function autoSyncRubricaIfStale() {
    if (!window.accessToken) return; // niente token: si ritenta su auth-ready
    if (autoSyncRubricaInFlight) return;

    const savedJSON = localStorage.getItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS);
    let count = 0;
    try { count = savedJSON ? Object.keys(JSON.parse(savedJSON)).length : 0; } catch (e) { count = 0; }

    const lastSync = parseInt(
        new Date(localStorage.getItem(STORAGE_KEYS_RUBRICA.LAST_RUBRICA_SYNC) || 0).getTime()
    ) || 0;
    const stale = (Date.now() - lastSync) > RUBRICA_CACHE_FRESHNESS_MS;

    if (count > 0 && !stale) {
        console.log('📇 [v2.5.65] Cache rubrica fresca, niente auto-sync');
        return;
    }

    autoSyncRubricaInFlight = true;
    console.log(`📇 [v2.5.65] Auto-sync rubrica (cache ${count === 0 ? 'vuota' : 'vecchia'})...`);
    try {
        await syncSavedContactsFromGoogle({ silent: true });
    } finally {
        autoSyncRubricaInFlight = false;
    }
}
window.autoSyncRubricaIfStale = autoSyncRubricaIfStale;

// ===== v2.5.65: RICERCA CONTATTI (stile Google People: per NOME o per NUMERO) =====
// Stessa logica usata dalla tendina e dalla verifica: match su displayName (substring,
// case/accent-insensitive) OPPURE su numero (normalizeForComparison). Legge dalla cache
// SAVED_CONTACTS (popolata dall'auto-sync), quindi è istantanea e offline.
function stripAccents(s) {
    return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function searchRubricaContacts(query, limit = 12) {
    const q = stripAccents((query || '').trim().toLowerCase());
    if (!q) return [];

    const savedJSON = localStorage.getItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS);
    if (!savedJSON) return [];
    let saved = {};
    try { saved = JSON.parse(savedJSON); } catch (e) { return []; }

    const qDigits = q.replace(/\D/g, '');
    const results = [];
    for (const phone of Object.keys(saved)) {
        const c = saved[phone] || {};
        const nome = c.nome || '';
        const nameMatch = stripAccents(nome.toLowerCase()).includes(q);
        const phoneMatch = qDigits.length >= 3 &&
            (normalizeForComparison(phone) || '').includes(qDigits);
        if (nameMatch || phoneMatch) {
            results.push({
                nome: nome || '(senza nome)',
                telefono: phone,
                societa: c.societa || '',
                resourceName: c.resourceName || ''
            });
        }
    }
    // Ordina: prima chi inizia col testo cercato, poi alfabetico
    results.sort((a, b) => {
        const an = stripAccents(a.nome.toLowerCase());
        const bn = stripAccents(b.nome.toLowerCase());
        const aStarts = an.startsWith(q) ? 0 : 1;
        const bStarts = bn.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return an.localeCompare(bn);
    });
    return results.slice(0, limit);
}
window.searchRubricaContacts = searchRubricaContacts;

// ===== v2.5.65: APRI SCHEDA LEAD DA UN RISULTATO RUBRICA =====
// Riusa la logica di deep-link esistente (sezione Lead + focusLeadCard). La card lead ha
// id="lead-card-<leadIdentityKey>" e data-lead-code. Provo prima per telefono (chiave
// identità lead), poi per codice. Se il lead non è nella lista (es. solo in rubrica, mai
// contattato) mostro un toast onesto invece di un link rotto.
async function openLeadFromRubrica(contact) {
    if (!contact) return;
    try {
        if (window.showPage) await window.showPage('lead');
        document.querySelectorAll('.sidebar-link').forEach(l =>
            l.classList.toggle('active', l.dataset.page === 'lead'));

        // 1) prova per telefono via leadIdentityKey (stessa usata dalle card)
        let card = null;
        if (window.leadIdentityKey && contact.telefono) {
            const key = window.leadIdentityKey(contact.telefono, contact.nome, '');
            const id = 'lead-card-' + encodeURIComponent(key);
            try {
                const sel = (window.CSS && CSS.escape) ? CSS.escape(id) : id;
                card = document.getElementById(id) || document.querySelector('#' + sel);
            } catch (e) { card = document.getElementById(id); }
        }

        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('lead-card-highlight');
            setTimeout(() => card.classList.remove('lead-card-highlight'), 2500);
        } else if (window.showLeadToast) {
            window.showLeadToast((contact.nome || 'Contatto') + ': in rubrica ma non tra i lead contattati');
        }
    } catch (e) {
        console.warn('⚠️ [v2.5.65] openLeadFromRubrica fallito:', e);
    }
}
window.openLeadFromRubrica = openLeadFromRubrica;

// ===== v2.5.65: AGGIORNA UN CONTATTO ESISTENTE SU GOOGLE PEOPLE (write-back) =====
// Se modifichi un lead già in rubrica, la modifica deve finire su Google People, non
// restare solo locale (sparirebbe al sync successivo). Usa people.updateContact: serve
// l'etag fresco → prima un GET del contatto, poi PATCH con updatePersonFields.
async function updateContactInGoogle(resourceName, data) {
    if (!window.accessToken) {
        showNotification('Connetti Google per aggiornare il contatto', 'error');
        return false;
    }
    if (!resourceName) {
        console.warn('⚠️ updateContactInGoogle: resourceName mancante');
        return false;
    }
    try {
        checkTokenValidity();

        // 1) GET per ottenere etag aggiornato (obbligatorio per updateContact)
        const getResp = await retryWithBackoff(async () => {
            return await gapi.client.request({
                'path': `https://people.googleapis.com/v1/${resourceName}`,
                'method': 'GET',
                'params': { 'personFields': 'names,organizations,phoneNumbers' }
            });
        });
        const etag = getResp.result.etag;

        // 2) Costruisci il body e la lista dei campi da aggiornare
        const body = { etag };
        const fields = [];
        if (data.nome !== undefined || data.cognome !== undefined) {
            body.names = [{
                givenName: capitalizeNome(data.nome || ''),
                familyName: capitalizeNome(data.cognome || '')
            }];
            fields.push('names');
        }
        if (data.societa !== undefined) {
            body.organizations = [{ name: data.societa || '' }];
            fields.push('organizations');
        }
        if (fields.length === 0) return false;

        // 3) PATCH updateContact
        await retryWithBackoff(async () => {
            return await gapi.client.request({
                'path': `https://people.googleapis.com/v1/${resourceName}:updateContact`,
                'method': 'PATCH',
                'params': { 'updatePersonFields': fields.join(',') },
                'body': body
            });
        });

        // 4) Aggiorna anche la cache locale (resta coerente fino al prossimo sync)
        const savedJSON = localStorage.getItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS);
        if (savedJSON) {
            try {
                const saved = JSON.parse(savedJSON);
                for (const phone of Object.keys(saved)) {
                    if (saved[phone] && saved[phone].resourceName === resourceName) {
                        if (body.names) saved[phone].nome = `${body.names[0].givenName} ${body.names[0].familyName}`.trim();
                        if (body.organizations) saved[phone].societa = body.organizations[0].name;
                    }
                }
                localStorage.setItem(STORAGE_KEYS_RUBRICA.SAVED_CONTACTS, JSON.stringify(saved));
            } catch (e) { /* cache best-effort */ }
        }

        console.log('✅ [v2.5.65] Contatto aggiornato su Google People:', resourceName, fields);
        showNotification('✅ Contatto aggiornato in rubrica Google', 'success');
        return true;
    } catch (error) {
        console.error('❌ [v2.5.65] Errore updateContact:', error);
        if (error.status === 403) {
            showNotification('❌ Abilita People API su Google Cloud Console', 'error');
        } else if (error.status === 401) {
            showNotification('❌ Token scaduto - Rifare login', 'error');
        } else {
            showNotification('❌ Errore aggiornamento contatto', 'error');
        }
        return false;
    }
}
window.updateContactInGoogle = updateContactInGoogle;

// ===== v2.5.65: HELPER ESCAPE HTML (anti-injection nei render) =====
function escapeHtmlRubrica(s) {
    return (s || '').toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== v2.5.65: RENDER TENDINA RICERCA (nome o numero) =====
function renderRubricaSearchResults(query) {
    const box = document.getElementById('rubricaSearchResults');
    if (!box) return;

    const q = (query || '').trim();
    if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }

    const results = searchRubricaContacts(q);
    if (results.length === 0) {
        const isNumber = !!normalizeForComparison(q);
        box.innerHTML = `<div class="rubrica-search-empty" style="padding: 10px 12px; color: var(--gray-600);">
            <i class="fas fa-info-circle"></i> Nessun contatto trovato${isNumber ? ' — non in rubrica. Usa il form sopra per aggiungerlo.' : ''}
        </div>`;
        box.style.display = 'block';
        return;
    }

    box.innerHTML = results.map(c => {
        const soc = c.societa ? ` · ${escapeHtmlRubrica(c.societa)}` : '';
        return `<div class="rubrica-search-item"
                    data-nome="${escapeHtmlRubrica(c.nome)}"
                    data-telefono="${escapeHtmlRubrica(c.telefono)}"
                    data-societa="${escapeHtmlRubrica(c.societa)}"
                    data-resource="${escapeHtmlRubrica(c.resourceName)}"
                    style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--gray-200); display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight: 600; color: var(--gray-800);">
                    <i class="fas fa-user" style="color: var(--primary-color);"></i> ${escapeHtmlRubrica(c.nome)}
                </span>
                <span style="font-size: 0.88em; color: var(--gray-600);">
                    <i class="fas fa-phone"></i> ${escapeHtmlRubrica(c.telefono)}${soc}
                    <span style="margin-left: 6px; color: var(--primary-color);"><i class="fas fa-arrow-right"></i> apri scheda</span>
                </span>
            </div>`;
    }).join('');
    box.style.display = 'block';
}
window.renderRubricaSearchResults = renderRubricaSearchResults;

// ===== v2.5.65: RICOLLEGATA — VERIFICA QUALI LEAD DEGLI EVENTI NON SONO IN RUBRICA =====
// Era la "funzione persa": getUnsavedContacts esisteva ancora ma nessun bottone la
// richiamava. Qui la ricolleghiamo: scansiona eventi/cronologia e mostra i lead i cui
// numeri NON sono in rubrica (così sai se si sono salvati tutti) + quelli con società da
// correggere. La logica sotto è la stessa di prima, solo riagganciata alla UI.
async function renderUnsavedLeadsCheck() {
    const container = document.getElementById('rubricaUnsavedList');
    if (!container) return;

    if (!window.accessToken) {
        container.innerHTML = '<p style="color: var(--gray-600);">Connetti Google per verificare.</p>';
        return;
    }

    const btn = document.getElementById('rubricaCheckUnsavedBtn');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifica in corso...'; }
    container.innerHTML = '<p style="color: var(--gray-600);"><i class="fas fa-spinner fa-spin"></i> Scansione eventi e rubrica…</p>';

    try {
        const { unsaved = [], toUpdate = [] } = await getUnsavedContacts(true) || {};

        let html = `<div style="margin-bottom: 12px; padding: 10px 12px; background: var(--gray-100); border-radius: 8px;">
            <strong>${unsaved.length}</strong> lead negli eventi <strong>non sono in rubrica</strong>${toUpdate.length ? ` · <strong>${toUpdate.length}</strong> da aggiornare` : ''}.
        </div>`;

        if (unsaved.length === 0 && toUpdate.length === 0) {
            html += '<p style="color: var(--success-color);"><i class="fas fa-check-circle"></i> Tutti i lead degli eventi sono già in rubrica. 🎉</p>';
        }

        // Lead da SALVARE (non presenti in rubrica)
        unsaved.forEach(c => {
            const nomeCompleto = `${escapeHtmlRubrica(c.nome)} ${escapeHtmlRubrica(c.cognome || '')}`.trim();
            const soc = c.societa ? ` · ${escapeHtmlRubrica(c.societa)}` : '';
            html += `<div class="rubrica-item" style="padding: 12px; border: 2px solid var(--warning-color); border-radius: 8px; margin-bottom: 10px; background: white; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                <div>
                    <div style="font-weight: 600; color: var(--gray-800);"><i class="fas fa-user"></i> ${nomeCompleto || '(senza nome)'}</div>
                    <div style="font-size: 0.9em; color: var(--gray-600);"><i class="fas fa-phone"></i> ${escapeHtmlRubrica(c.telefono)}${soc}</div>
                </div>
                <button type="button" class="btn btn-sm btn-success save-unsaved-btn"
                    data-nome="${escapeHtmlRubrica(c.nome)}" data-cognome="${escapeHtmlRubrica(c.cognome || '')}"
                    data-telefono="${escapeHtmlRubrica(c.telefono)}" data-societa="${escapeHtmlRubrica(c.societa || '')}"
                    style="white-space: nowrap;"><i class="fas fa-save"></i> Salva</button>
            </div>`;
        });

        // Contatti già in rubrica ma con società da correggere (riusa renderContactToUpdate)
        toUpdate.forEach(c => { html += renderContactToUpdate(c); });

        container.innerHTML = html;
    } catch (e) {
        console.error('❌ [v2.5.65] Verifica lead non in rubrica fallita:', e);
        container.innerHTML = '<p style="color: var(--error-color);">Errore durante la verifica. Riprova.</p>';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHTML; }
    }
}
window.renderUnsavedLeadsCheck = renderUnsavedLeadsCheck;

// ===== v2.5.65: HANDLER DELEGATI per la lista "verifica lead non in rubrica" =====
async function handleUnsavedListClick(e) {
    const saveBtn = e.target.closest('.save-unsaved-btn');
    const updateBtn = e.target.closest('.update-contact-btn');
    const ignoreBtn = e.target.closest('.ignore-update-btn');

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        const ok = await saveContactToGoogle({
            nome: saveBtn.dataset.nome || '',
            cognome: saveBtn.dataset.cognome || '',
            telefono: saveBtn.dataset.telefono || '',
            societa: saveBtn.dataset.societa || ''
        });
        if (ok) {
            const card = saveBtn.closest('.rubrica-item');
            if (card) card.remove();
        } else {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Salva';
        }
        return;
    }

    if (updateBtn) {
        const resource = updateBtn.dataset.resource || '';
        if (!resource) {
            showNotification('⚠️ resourceName mancante: rifai "Sincronizza Ora" e riprova', 'error');
            return;
        }
        updateBtn.disabled = true;
        updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        const ok = await updateContactInGoogle(resource, {
            nome: updateBtn.dataset.nome || '',
            cognome: updateBtn.dataset.cognome || '',
            societa: updateBtn.dataset.societa || ''
        });
        if (ok) {
            const card = updateBtn.closest('.rubrica-item');
            if (card) card.remove();
        } else {
            updateBtn.disabled = false;
            updateBtn.innerHTML = '<i class="fas fa-sync"></i> Aggiorna';
        }
        return;
    }

    if (ignoreBtn) {
        const card = ignoreBtn.closest('.rubrica-item');
        if (card) card.remove();
    }
}
window.handleUnsavedListClick = handleUnsavedListClick;

// ===== ESPORTA FUNZIONI GLOBALI =====
window.initRubrica = initRubrica;
window.getUnsavedContacts = getUnsavedContacts;
window.renderRubricaList = renderRubricaList;
window.markContactAsAlreadySaved = markContactAsAlreadySaved; // Rinominato
window.saveContactToGoogle = saveContactToGoogle;
window.syncSavedContactsFromGoogle = syncSavedContactsFromGoogle;
window.normalizePhone = normalizePhone;
window.normalizeForComparison = normalizeForComparison; // v2.5.58
window.formatPhoneForGoogle = formatPhoneForGoogle;
window.isPhoneInRubrica = isPhoneInRubrica; // v2.5.58: dedup pre-salvataggio automatico
