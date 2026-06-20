/* ================================================================================
   GOOGLE CALENDAR SYNC - TESTmess v2.2.38
   
   CHANGELOG v2.2.38:
   - ✅ DROPDOWN HOME: Aggiunto filtro calendario nella sezione "Appuntamenti del Giorno"
   - ✅ SELEZIONE PERSISTENTE: Scelta calendario salvata in localStorage
   - ✅ FILTRO DINAMICO: Lead filtrati automaticamente per calendario selezionato
   - ✅ UX MIGLIORATA: Notifica quando si cambia filtro calendario
   
   CHANGELOG v2.2.37:
   - 🔧 FIX SINTASSI: Rimosso blocco try-catch duplicato (righe 261-269)
   - ✅ RISOLTO: Errore "Unexpected token '}'" che bloccava sync calendario
   - ✅ HAMBURGER MENU: Ora funziona correttamente (era bloccato dall'errore JS)
   
   CHANGELOG v2.2.29:
   - ✅ RANGE DATE PICKER: Sostituito "Carica Mesi Precedenti" con date picker custom
   - ✅ DEFAULT RANGE: Oggi + 14 giorni (modificabile)
   - ✅ FILTRO EVENTI "X": Esclusi automaticamente eventi con titolo "X"
   - ✅ CHECKBOX CALENDARI: Multi-select per filtrare quali calendari visualizzare
   - ✅ HOME/RUBRICA: Range fisso mese corrente + successivo (automatico)
   
   CHANGELOG v2.2.25:
   - ✅ EVENTI PASSATI: Carica ultimi 90 giorni + prossimi 30 giorni
   - ✅ MULTI-CALENDARIO AUTO: Tutti i calendari automaticamente (no hardcode)
   - ✅ INDICATORE CALENDARIO: Mostra "(Nome Calendario)" nel dropdown
   - ✅ FILTRO INTELLIGENTE: Solo calendari con pattern "SG -" o contenenti "Lead"
   - ✅ RANGE ESTESO: 120 giorni totali (90 passati + 30 futuri)
   
   CHANGELOG v2.2.2:
   - ✅ PULIZIA DROPDOWN: Rimossi metadati inutili (solo "HH:MM - Nome Cognome")
   - ✅ PARSING INTELLIGENTE: Separazione automatica Nome/Cognome con database nomi
   - ✅ AUTO-DETECT SERVIZIO: Estrae "SERVIZIO:" da description
   - ✅ AUTO-COMPILA SOCIETÀ: Stock Gain → SG - Lead, Finanza Efficace → FE - Lead
   ================================================================================ */

const STORAGE_KEYS_CALENDAR = {
    CALENDAR_EVENTS: 'sgmess_calendar_events',
    LAST_SYNC: 'sgmess_last_sync',
    CONTACTED_LEADS: 'sgmess_contacted_leads', // Lead a cui abbiamo già mandato messaggi
    LOADED_DAYS_BACK: 'sgmess_loaded_days_back', // Quanti giorni indietro abbiamo caricato
    SELECTED_CALENDARS: 'sgmess_selected_calendars', // Calendari selezionati per il filtro (sezione calendario)
    HOME_CALENDAR_FILTER: 'sgmess_home_calendar_filter', // (legacy) Calendario singolo selezionato nella home
    HOME_SELECTED_CALENDARS: 'sgmess_home_selected_calendars', // v2.5.40: Calendari spuntati nella home (multi-select, chiave separata da quella della pagina Calendario)
    AVAILABLE_CALENDARS: 'sgmess_available_calendars' // Lista calendari disponibili (v2.5.7)
};

let calendarSyncInterval = null;
let isLoadingMoreEvents = false; // Flag per evitare chiamate multiple
let availableCalendars = []; // Lista calendari disponibili
let isFormProgrammaticUpdate = false; // v2.5.19: Flag per evitare re-trigger del listener selectDay

// ===== AUTH GUARD (v2.5.45) =====
// True se c'è una sessione Google valida: token in memoria OPPURE token salvato
// non ancora scaduto. Il secondo caso copre il ripristino ASINCRONO all'avvio
// (maybeEnableButtons → tryRestoreSession gira dopo il DOMContentLoaded),
// così un utente GIÀ loggato vede subito i calendari senza un lampeggio del
// "lucchetto"; un utente NON loggato (o con token scaduto) non vede nulla.
function isGoogleAuthenticated() {
    if (window.accessToken) return true;
    try {
        const t = localStorage.getItem('google_access_token');
        const exp = parseInt(localStorage.getItem('google_token_expires_at') || '0', 10);
        return !!(t && Date.now() < exp);
    } catch (e) {
        return false;
    }
}

// ===== INIT CALENDAR SYNC =====
function initCalendarSync() {
    // Carica eventi salvati all'avvio
    loadSavedEvents();
    
    // Inizializza date picker con default (oggi + 14 giorni)
    initDateRangePicker();
    
    // Setup auto-refresh ogni 5 minuti quando autenticato
    if (calendarSyncInterval) {
        clearInterval(calendarSyncInterval);
    }
    
    calendarSyncInterval = setInterval(() => {
        if (window.accessToken) {
            syncCalendarEvents(true); // Silent sync
        }
    }, 5 * 60 * 1000); // 5 minuti
}

// ===== INIZIALIZZA DATE RANGE PICKER =====
function initDateRangePicker() {
    const startDateInput = document.getElementById('calendarStartDate');
    const endDateInput = document.getElementById('calendarEndDate');
    
    if (!startDateInput || !endDateInput) return;
    
    // Default: OGGI - 30 giorni (per vedere anche eventi passati recenti)
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - 30);
    const startDate = pastDate.toISOString().split('T')[0];
    
    // Default: oggi + 14 giorni
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 14);
    const endDate = futureDate.toISOString().split('T')[0];
    
    startDateInput.value = startDate;
    endDateInput.value = endDate;
    
    console.log('📅 Date range picker inizializzato:', startDate, '→', endDate);
}

// ===== FILTRA EVENTO "X" =====
function shouldSkipEvent(event) {
    if (!event || !event.summary) return false;
    
    // Filtra eventi con titolo "X" (case-insensitive, trim)
    const title = event.summary.trim().toLowerCase();
    return title === 'x';
}

// ===== GET RANGE DATE DA HOME/RUBRICA (mese corrente + successivo) =====
function getHomeRubricaDateRange() {
    const today = new Date();
    
    // Inizio mese corrente
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Fine mese successivo (ultimo giorno)
    const endDate = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    
    return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    };
}

// ===== SINCRONIZZA EVENTI =====
async function syncCalendarEvents(silent = false, loadMore = false) {
    if (!window.accessToken) {
        if (!silent) {
            showNotification('Connetti Google per sincronizzare il calendario', 'error');
        }
        return;
    }
    
    // Evita chiamate multiple simultanee
    if (isLoadingMoreEvents) {
        console.log('⏳ Caricamento già in corso, skip...');
        return;
    }
    
    isLoadingMoreEvents = true;
    
    try {
        if (!silent) {
            showNotification('🔄 Sincronizzazione calendario in corso...', 'info');
        }
        
        console.log('📅 Caricamento eventi calendario...');
        
        // VERIFICA che gapi.client.calendar sia inizializzato
        if (!gapi || !gapi.client || !gapi.client.calendar) {
            console.error('❌ GAPI Calendar non inizializzato');
            if (!silent) showNotification('Errore: Google Calendar API non disponibile', 'error');
            isLoadingMoreEvents = false;
            return;
        }
        
        // STEP 1: Carica tutti i calendari disponibili
        console.log('🔍 Caricamento lista calendari...');
        const calendarListResponse = await gapi.client.calendar.calendarList.list();
        const allCalendars = calendarListResponse.result.items || [];
        console.log(`✅ Trovati ${allCalendars.length} calendari totali`);
        
        // STEP 2: Usa TUTTI i calendari (rimosso filtro SG)
        // Prende tutti i calendari disponibili
        const targetCalendars = allCalendars;
        
        if (targetCalendars.length === 0) {
            console.warn('⚠️ Nessun calendario trovato');
            if (!silent) {
                showNotification('⚠️ Nessun calendario Google trovato', 'warning');
            }
            isLoadingMoreEvents = false;
            return;
        }
        
        console.log(`✅ Trovati ${targetCalendars.length} calendari:`, targetCalendars.map(c => c.summary));
        
        // Salva lista calendari disponibili globalmente
        availableCalendars = targetCalendars;
        
        // Salva calendari in localStorage per uso futuro (v2.5.7)
        localStorage.setItem(STORAGE_KEYS_CALENDAR.AVAILABLE_CALENDARS, JSON.stringify(targetCalendars));

        // v2.5.44: recupera da Drive la selezione calendari salvata (così non si perde
        // tra sessioni/dispositivi). Se presente, sovrascrive la copia locale prima di disegnare.
        try {
            if (window.DriveStorage && window.accessToken) {
                const driveSel = await window.DriveStorage.load('HOME_SELECTED_CALENDARS');
                if (Array.isArray(driveSel)) {
                    localStorage.setItem(STORAGE_KEYS_CALENDAR.HOME_SELECTED_CALENDARS, JSON.stringify(driveSel));
                }
            }
        } catch (e) { console.warn('⚠️ Drive pull selezione calendari fallito (uso locale):', e); }

        // Popola dropdown home con calendari
        populateHomeCalendarDropdown(targetCalendars);
        
        // STEP 3: Determina range temporale
        let timeMin, timeMax;
        
        // Se siamo nella sezione calendario, usa i date picker
        const startDateInput = document.getElementById('calendarStartDate');
        const endDateInput = document.getElementById('calendarEndDate');
        
        if (startDateInput && endDateInput && startDateInput.value && endDateInput.value) {
            // SEZIONE CALENDARIO: usa date picker custom
            timeMin = new Date(startDateInput.value + 'T00:00:00').toISOString();
            timeMax = new Date(endDateInput.value + 'T23:59:59').toISOString();
            console.log('📅 Range da date picker:', startDateInput.value, '→', endDateInput.value);
        } else {
            // HOME/RUBRICA: usa range fisso (ultimi 90 giorni + prossimi 90 giorni)
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 90);
            timeMin = pastDate.toISOString();
            
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 90);
            timeMax = futureDate.toISOString();
            console.log('📅 Range default (home/rubrica): -90gg → +90gg');
        }
        
        console.log('🔎 Richiesta eventi da', timeMin, 'a', timeMax);
        
        let allEvents = [];
        
        for (const calendar of targetCalendars) {
            console.log(`📥 Scaricamento eventi da: ${calendar.summary}`);
            
            const response = await gapi.client.calendar.events.list({
                'calendarId': calendar.id,
                'timeMin': timeMin,
                'timeMax': timeMax,
                'showDeleted': false,
                'singleEvents': true,
                'orderBy': 'startTime'
            });
            
            const events = response.result.items || [];
            console.log(`  ✅ ${events.length} eventi trovati in "${calendar.summary}"`);
            
            // Aggiungi informazione calendario a ogni evento
            const eventsWithCalendar = events.map(event => ({
                ...event,
                calendarName: calendar.summary,
                calendarId: calendar.id
            }));
            
            allEvents = allEvents.concat(eventsWithCalendar);
        }
        
        console.log(`✅ Totale eventi ricevuti: ${allEvents.length}`);
        
        // STEP 4: Filtra eventi "X"
        const filteredEvents = allEvents.filter(event => !shouldSkipEvent(event));
        const skippedCount = allEvents.length - filteredEvents.length;
        if (skippedCount > 0) {
            console.log(`🚫 Filtrati ${skippedCount} eventi con titolo "X"`);
        }
        
        // Salva eventi in localStorage
        // v2.5.58: PERSISTI created/updated. La events.list non usa fields mask, quindi
        // l'API ritorna SEMPRE event.created (timestamp ISO 8601 di creazione dell'evento,
        // ≈ ora di prenotazione lato Acuity). PRIMA veniva scartato qui nel .map() e perso
        // ovunque a valle (cache + dataset eventData del lead). created = ora di CREAZIONE
        // dell'evento, NON start (orario appuntamento) e NON updated (ultima modifica).
        const eventsData = filteredEvents.map(event => ({
            id: event.id,
            summary: event.summary || 'Senza titolo',
            description: event.description || '',
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || event.end.date,
            created: event.created || null,   // v2.5.58: ora di creazione evento (critico)
            updated: event.updated || null,   // v2.5.58: ultima modifica (per riferimento)
            attendees: event.attendees || [],
            location: event.location || '',
            calendarName: event.calendarName,
            calendarId: event.calendarId
        }));
        
        localStorage.setItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS, JSON.stringify(eventsData));
        localStorage.setItem(STORAGE_KEYS_CALENDAR.LAST_SYNC, new Date().toISOString());
        
        console.log('💾 Eventi salvati in localStorage');
        
        // Aggiorna UI
        updateDaySelector();
        updateLeadsList(); // Aggiorna lista lead per data corrente
        displayCalendarView(); // Aggiorna vista calendario
        
        if (!silent) {
            showNotification(`✅ ${filteredEvents.length} appuntamenti sincronizzati dai calendari SG`, 'success');
        }
        
        console.log(`✅ Sincronizzati ${filteredEvents.length} eventi dai calendari SG`);
        
        isLoadingMoreEvents = false;
        
    } catch (error) {
        console.error('❌ Errore sync calendario:', error);
        if (!silent) {
            showNotification('Errore sincronizzazione calendario', 'error');
        }
        isLoadingMoreEvents = false;
    }
}

// ===== RENDER CHECKBOX CALENDARI =====
function renderCalendarCheckboxes(calendars) {
    const container = document.getElementById('calendarFilterCheckboxes');
    if (!container) return;
    
    // Carica calendari selezionati da localStorage
    const selectedCalendarsJSON = localStorage.getItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS);
    let selectedCalendars = [];
    if (selectedCalendarsJSON) {
        try {
            selectedCalendars = JSON.parse(selectedCalendarsJSON);
        } catch (e) {
            selectedCalendars = [];
        }
    }
    
    // Se è il primo render, seleziona tutti i calendari di default
    if (selectedCalendars.length === 0) {
        selectedCalendars = calendars.map(c => c.id);
        localStorage.setItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS, JSON.stringify(selectedCalendars));
    }
    
    // Genera HTML checkbox
    let html = '';
    calendars.forEach(calendar => {
        const isChecked = selectedCalendars.includes(calendar.id);
        html += `
            <div style="margin-bottom: 8px;">
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input 
                        type="checkbox" 
                        class="calendar-checkbox" 
                        data-calendar-id="${calendar.id}"
                        ${isChecked ? 'checked' : ''}
                        style="margin-right: 8px;"
                    >
                    <span style="color: var(--gray-700);">${calendar.summary}</span>
                </label>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Event listeners per checkbox
    container.querySelectorAll('.calendar-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const calendarId = this.dataset.calendarId;
            
            // Aggiorna lista calendari selezionati
            let selectedCalendars = [];
            const savedJSON = localStorage.getItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS);
            if (savedJSON) {
                try {
                    selectedCalendars = JSON.parse(savedJSON);
                } catch (e) {
                    selectedCalendars = [];
                }
            }
            
            if (this.checked) {
                // Aggiungi calendario
                if (!selectedCalendars.includes(calendarId)) {
                    selectedCalendars.push(calendarId);
                }
            } else {
                // Rimuovi calendario
                selectedCalendars = selectedCalendars.filter(id => id !== calendarId);
            }
            
            // Salva
            localStorage.setItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS, JSON.stringify(selectedCalendars));
            
            // Aggiorna vista calendario
            displayCalendarView();
            
            console.log('📅 Calendari selezionati:', selectedCalendars.length);
        });
    });
}

// ===== GET CALENDARI SELEZIONATI =====
function getSelectedCalendars() {
    const selectedJSON = localStorage.getItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS);
    if (!selectedJSON) return [];
    
    try {
        return JSON.parse(selectedJSON);
    } catch (e) {
        return [];
    }
}

// ===== RENDER CHECKBOX CALENDARI =====
function renderCalendarCheckboxes(calendars) {
    const container = document.getElementById('calendarFilterCheckboxes');
    if (!container) return;
    
    // Carica selezione salvata
    const savedSelection = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS) || '[]');
    
    // Se prima volta, seleziona tutti
    const selectedCalendars = savedSelection.length > 0 ? savedSelection : calendars.map(c => c.id);
    
    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    
    calendars.forEach(calendar => {
        const isChecked = selectedCalendars.includes(calendar.id);
        html += `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input 
                    type="checkbox" 
                    class="calendar-checkbox" 
                    data-calendar-id="${calendar.id}"
                    ${isChecked ? 'checked' : ''}
                    style="cursor: pointer;"
                >
                <span style="color: var(--gray-800);">${calendar.summary}</span>
            </label>
        `;
    });
    
    html += '</div>';
    
    container.innerHTML = html;
    
    // Event listeners per checkbox
    container.querySelectorAll('.calendar-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const calendarId = this.dataset.calendarId;
            const isChecked = this.checked;
            
            // Aggiorna selezione
            let selectedCalendars = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS) || '[]');
            
            if (isChecked && !selectedCalendars.includes(calendarId)) {
                selectedCalendars.push(calendarId);
            } else if (!isChecked) {
                selectedCalendars = selectedCalendars.filter(id => id !== calendarId);
            }
            
            localStorage.setItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS, JSON.stringify(selectedCalendars));
            
            // Aggiorna vista calendario
            displayCalendarView();
            
            console.log('📅 Calendari selezionati aggiornati:', selectedCalendars.length);
        });
    });
    
    // Salva selezione iniziale se prima volta
    if (savedSelection.length === 0) {
        localStorage.setItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS, JSON.stringify(selectedCalendars));
    }
}

// ===== GET EVENTI FILTRATI PER CALENDARIO =====
function getFilteredEventsByCalendar() {
    const allEvents = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS) || '[]');
    const selectedCalendars = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.SELECTED_CALENDARS) || '[]');
    
    // Se nessun calendario selezionato, mostra tutti
    if (selectedCalendars.length === 0) {
        return allEvents.filter(event => !shouldSkipEvent(event));
    }
    
    // Filtra per calendari selezionati + escludi "X"
    return allEvents.filter(event => {
        return selectedCalendars.includes(event.calendarId) && !shouldSkipEvent(event);
    });
}

// ===== SALVA SELEZIONE CALENDARI HOME (v2.5.44: localStorage + Drive + report) =====
// Unico punto di salvataggio: scrive SEMPRE in locale (istantaneo) e prova Drive
// (se loggato). Drive non bloccante: se fallisce resta comunque la copia locale.
async function saveHomeSelectedCalendars(sel) {
    localStorage.setItem(STORAGE_KEYS_CALENDAR.HOME_SELECTED_CALENDARS, JSON.stringify(sel));
    try {
        if (window.DriveStorage && window.accessToken) {
            await window.DriveStorage.save('HOME_SELECTED_CALENDARS', sel);
        }
    } catch (e) { console.warn('⚠️ Drive save selezione calendari fallito (resta in locale):', e); }
    if (window.logActivity) window.logActivity('calendari_aggiornati', { count: sel.length });
}

// ===== POPOLA DROPDOWN CALENDARI NELLA HOME (v2.5.54: dropdown compatto a riga singola) =====
// Sostituisce la lista di checkbox sempre aperta con un trigger su singola riga
// (icona calendario + label della selezione + chevron) che apre un menù a tendina
// multi-select. Chiusura al click fuori.
// ⚠️ REGOLA: questa funzione NON scrive MAI in cloud/localStorage — fa solo lettura/render.
// Il salvataggio avviene SOLO su interazione utente (toggle checkbox o azioni
// "Seleziona/Deseleziona tutti"). Così distinguiamo "sto ancora caricando da Drive"
// da "l'utente ha scelto vuoto" e non sovrascriviamo per sbaglio una selezione reale
// che stava ancora arrivando dal cloud durante l'init.
function populateHomeCalendarDropdown(calendars) {
    const container = document.getElementById('homeCalendarFilterCheckboxes');
    if (!container) return;

    // 🔒 v2.5.45 PRIVACY: senza login Google NON mostrare i nomi dei calendari.
    // Prima i nomi (letti dalla cache localStorage) comparivano anche da sloggati.
    if (!isGoogleAuthenticated()) {
        container.innerHTML = '<p style="color: var(--gray-500, #6b7280); font-size: 0.9rem; margin: 0;">🔒 Effettua il login Google per vedere i tuoi calendari</p>';
        return;
    }

    // Carica selezione salvata (chiave dedicata HOME, separata dalla pagina Calendario).
    // v2.5.54: MAI default a "tutti". Se non c'è nulla di salvato si parte da selezione
    // VUOTA — nessun calendario, nessun evento mostrato finché l'utente non sceglie.
    // NESSUN salvataggio qui (vedi nota sopra: loading vs vuoto).
    let selected = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.HOME_SELECTED_CALENDARS) || 'null');
    if (!Array.isArray(selected)) selected = [];

    // Label del trigger in base alla selezione corrente
    function computeLabel(sel) {
        const chosen = calendars.filter(c => sel.includes(c.id));
        if (chosen.length === 0) return 'Nessun calendario';
        const joined = chosen.map(c => c.summary).join(', ');
        if (chosen.length <= 2 && joined.length <= 30) return joined;
        return `${chosen.length} calendari selezionati`;
    }

    // ----- Markup: trigger compatto su singola riga + menù a tendina -----
    let html = `
        <button type="button" class="cal-dropdown-trigger" id="homeCalDropdownTrigger" aria-expanded="false">
            <i class="fas fa-calendar-alt"></i>
            <span class="cal-dropdown-label">${computeLabel(selected)}</span>
            <i class="fas fa-chevron-down cal-dropdown-chevron"></i>
        </button>
        <div class="cal-dropdown-menu" id="homeCalDropdownMenu" hidden>
            <div class="cal-dropdown-actions">
                <button type="button" class="cal-dropdown-action" data-action="all">Seleziona tutti</button>
                <span class="cal-dropdown-sep">·</span>
                <button type="button" class="cal-dropdown-action" data-action="none">Deseleziona tutti</button>
            </div>
    `;
    calendars.forEach(calendar => {
        const isChecked = selected.includes(calendar.id);
        html += `
            <label class="cal-dropdown-item">
                <input type="checkbox" class="home-calendar-checkbox" data-calendar-id="${calendar.id}" ${isChecked ? 'checked' : ''}>
                <span>${calendar.summary}</span>
            </label>
        `;
    });
    html += '</div>';
    container.innerHTML = html;

    const trigger = document.getElementById('homeCalDropdownTrigger');
    const menu = document.getElementById('homeCalDropdownMenu');
    const labelEl = container.querySelector('.cal-dropdown-label');

    // Aggiorna la label del trigger leggendo lo stato attuale delle checkbox
    function refreshLabel() {
        const sel = Array.from(container.querySelectorAll('.home-calendar-checkbox'))
            .filter(cb => cb.checked).map(cb => cb.dataset.calendarId);
        if (labelEl) labelEl.textContent = computeLabel(sel);
    }

    // Aggiorna subito la lista appuntamenti/tendina lead della home
    async function applyHomeCalendarChange() {
        const selectDay = document.getElementById('selectDay');
        if (selectDay && selectDay.value && window.updateLeadSelectorByDate) {
            await window.updateLeadSelectorByDate(selectDay.value);
        }
    }

    // Apri/chiudi il menù a tendina
    function openMenu()  { if (menu) menu.hidden = false; if (trigger) { trigger.setAttribute('aria-expanded', 'true');  trigger.classList.add('open'); } }
    function closeMenu() { if (menu) menu.hidden = true;  if (trigger) { trigger.setAttribute('aria-expanded', 'false'); trigger.classList.remove('open'); } }

    if (trigger) {
        trigger.addEventListener('click', function() {
            if (menu && menu.hidden) openMenu(); else closeMenu();
        });
    }

    // Listener: checkbox singola calendario (QUI sì che si salva: è azione utente esplicita)
    container.querySelectorAll('.home-calendar-checkbox').forEach(cb => {
        cb.addEventListener('change', async function() {
            const sel = Array.from(container.querySelectorAll('.home-calendar-checkbox'))
                .filter(x => x.checked).map(x => x.dataset.calendarId);
            await saveHomeSelectedCalendars(sel); // locale + Drive + report
            refreshLabel();
            await applyHomeCalendarChange();
            console.log('📅 [HOME] Calendari spuntati:', sel.length);
        });
    });

    // Listener: azioni "Seleziona tutti / Deseleziona tutti" (azione, NON stato di default)
    container.querySelectorAll('.cal-dropdown-action').forEach(btn => {
        btn.addEventListener('click', async function() {
            const all = this.dataset.action === 'all';
            container.querySelectorAll('.home-calendar-checkbox').forEach(cb => { cb.checked = all; });
            const sel = all ? calendars.map(c => c.id) : [];
            await saveHomeSelectedCalendars(sel); // locale + Drive + report
            refreshLabel();
            await applyHomeCalendarChange();
            console.log('📅 [HOME] Azione calendari:', all ? 'tutti' : 'nessuno');
        });
    });

    // Chiudi al click fuori dal dropdown (listener globale registrato UNA sola volta,
    // così non si impila a ogni re-render; legge gli elementi correnti per id)
    if (!window.__homeCalDropdownOutsideBound) {
        document.addEventListener('click', function(e) {
            const root = document.getElementById('homeCalendarFilterCheckboxes');
            const m = document.getElementById('homeCalDropdownMenu');
            const t = document.getElementById('homeCalDropdownTrigger');
            if (!root || !m || m.hidden) return;
            if (!root.contains(e.target)) {
                m.hidden = true;
                if (t) { t.setAttribute('aria-expanded', 'false'); t.classList.remove('open'); }
            }
        });
        window.__homeCalDropdownOutsideBound = true;
    }

    console.log(`✅ Dropdown calendari home popolato (${calendars.length} calendari, ${selected.length} selezionati)`);
}

// ===== GET CALENDARI SELEZIONATI NELLA HOME (v2.5.40: multi-select) =====
// Ritorna un array di id selezionati, oppure null se mai impostato.
// v2.5.54: null/non-array NON significa più "tutti": il consumer lo tratta come
// selezione VUOTA (nessun evento). Mai default a tutti i calendari.
function getHomeSelectedCalendar() {
    const json = localStorage.getItem(STORAGE_KEYS_CALENDAR.HOME_SELECTED_CALENDARS);
    if (json === null) return null;
    try {
        const arr = JSON.parse(json);
        return Array.isArray(arr) ? arr : null;
    } catch (e) {
        return null;
    }
}

function loadSavedEvents() {
    const eventsJSON = localStorage.getItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS);
    if (eventsJSON) {
        const events = JSON.parse(eventsJSON);
        console.log(`📅 Caricati ${events.length} eventi dal cache`);
        updateDaySelector();
    }
    
    // v2.5.7: Carica anche lista calendari dal cache
    const calendarsJSON = localStorage.getItem(STORAGE_KEYS_CALENDAR.AVAILABLE_CALENDARS);
    if (calendarsJSON) {
        try {
            const calendars = JSON.parse(calendarsJSON);
            availableCalendars = calendars;
            populateHomeCalendarDropdown(calendars);
            console.log(`📅 Caricati ${calendars.length} calendari dal cache`);
        } catch (e) {
            console.warn('⚠️ Errore caricamento calendari da cache:', e);
        }
    }
}

// ===== IMPOSTA DATA CORRENTE NEL PICKER =====
function setTodayDate() {
    const selectDay = document.getElementById('selectDay');
    if (!selectDay) return;
    
    const today = new Date();
    const todayString = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    selectDay.value = todayString;
    
    console.log('📅 Data picker impostata su oggi:', todayString);
    
    // Carica automaticamente lead di oggi
    updateLeadSelectorByDate(todayString);
}

// ===== AGGIORNA DATE PICKER E INIZIALIZZA CON OGGI =====
function updateDaySelector() {
    setTodayDate();
}

// ===== AGGIORNA LISTA LEAD (ALIAS) =====
async function updateLeadsList() {
    const selectDay = document.getElementById('selectDay');
    if (selectDay && selectDay.value) {
        await updateLeadSelectorByDate(selectDay.value);
    }
}

// ===== AGGIORNA LEAD SELECTOR DA DATA PICKER =====
async function updateLeadSelectorByDate(dateString) {
    if (!dateString) return;
    
    const selectLead = document.getElementById('selectLead');
    if (!selectLead) return;
    
    // 🔒 AUTH GUARD: Blocca senza login
    if (!window.accessToken) {
        selectLead.innerHTML = '<option value="">🔒 Effettua il login Google per vedere i lead</option>';
        selectLead.disabled = true;
        return;
    }
    
    // ⏳ LOADING STATE — v2.5.42 FIX: NON svuotare una tendina già popolata.
    // Prima qui si faceva sempre innerHTML='⏳ Caricamento...' e POI si attendeva Drive
    // (getContactedLeads): durante quell'await i nomi SPARIVANO dalla tendina.
    // Ora mostriamo "Caricamento" solo al primissimo caricamento (lista ancora vuota);
    // se la lista è già piena, la lasciamo intatta e la sostituiamo in un colpo solo alla fine.
    const isFirstLoad = selectLead.options.length <= 1;
    if (isFirstLoad) {
        selectLead.innerHTML = '<option value="">⏳ Caricamento lead...</option>';
        selectLead.disabled = true;
    }

    const selectedDate = new Date(dateString + 'T00:00:00');
    
    // Carica TUTTI gli eventi salvati (non filtrati)
    const allEventsJSON = localStorage.getItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS);
    const allEvents = JSON.parse(allEventsJSON || '[]');
    
    console.log(`📊 Eventi totali in localStorage: ${allEvents.length}`);
    if (allEvents.length === 0) {
        console.warn('⚠️ NESSUN EVENTO nel localStorage! Sincronizzazione necessaria.');
    }
    
    // 🔥 CARICA LEAD CONTATTATI con fallback robusto
    let contactedLeads = [];
    try {
        if (window.DriveStorage && window.accessToken) {
            contactedLeads = await window.DriveStorage.getContactedLeads();
            console.log('✅ Lead contattati caricati da Drive:', contactedLeads.length);
        } else {
            // Fallback localStorage
            contactedLeads = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CONTACTED_LEADS) || '[]');
            console.log('⚠️ Lead contattati da localStorage (fallback):', contactedLeads.length);
        }
    } catch (error) {
        console.warn('⚠️ Errore caricamento lead contattati, uso localStorage:', error);
        contactedLeads = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CONTACTED_LEADS) || '[]');
    }
    
    // Ottieni calendari selezionati nella home (v2.5.54: multi-select; MAI default a tutti).
    // null/non-array (mai salvato) => nessun calendario selezionato => nessun evento mostrato.
    const homeCalendarFilter = getHomeSelectedCalendar();
    const homeSelected = Array.isArray(homeCalendarFilter) ? homeCalendarFilter : [];

    // Filtra eventi per la data selezionata + escludi "X" + filtra per calendari home spuntati
    const dayEvents = allEvents.filter(event => {
        const eventDate = new Date(event.start);
        const isCorrectDate = eventDate.toDateString() === selectedDate.toDateString();
        const isNotX = !shouldSkipEvent(event);

        // Solo i calendari spuntati. Selezione vuota = nessun evento (stato iniziale valido).
        const isSelectedCalendar = homeSelected.includes(event.calendarId);

        return isCorrectDate && isNotX && isSelectedCalendar;
    });
    
    console.log(`📅 Filtro applicato per ${dateString}:`);
    console.log(`   - Eventi dopo filtro data: ${allEvents.filter(e => new Date(e.start).toDateString() === selectedDate.toDateString()).length}`);
    console.log(`   - Eventi dopo esclusione "X": ${allEvents.filter(e => !shouldSkipEvent(e)).length}`);
    console.log(`   - Calendari selezionati: ${homeSelected.length} (${homeSelected.join(', ') || 'nessuno'})`);
    console.log(`   - Eventi finali per questo giorno: ${dayEvents.length}`);
    
    // Popola select - TUTTI I LEAD sempre visibili
    selectLead.innerHTML = '<option value="">-- Seleziona lead --</option>';
    
    if (dayEvents.length === 0) {
        console.warn(`⚠️ NESSUN EVENTO trovato per ${dateString}!`);
        console.warn(`   Possibili cause:`);
        console.warn(`   1. Nessun evento in questa data`);
        console.warn(`   2. Tutti gli eventi hanno titolo "X" (esclusi)`);
        console.warn(`   3. Filtro calendario esclude gli eventi`);
        console.warn(`   4. Eventi non sincronizzati dal Google Calendar`);
        selectLead.innerHTML = '<option value="">-- Nessun appuntamento per questo giorno --</option>';
        selectLead.disabled = true;
        return;
    }
    
    selectLead.disabled = false;
    
    // 🎯 TUTTI I LEAD (contattati e non) nello stesso elenco
    dayEvents.forEach((event, index) => {
        const eventTime = new Date(event.start).toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const leadName = extractNameFromEvent(event);
        const calendarLabel = event.calendarName ? ` (${event.calendarName})` : '';
        
        // Verifica se già contattato
        const isContacted = contactedLeads.some(contacted => 
            contacted.eventId === event.id || 
            (contacted.nome === leadName && 
             new Date(contacted.date).toDateString() === selectedDate.toDateString())
        );
        
        const option = document.createElement('option');
        option.value = index;
        option.dataset.eventId = event.id;
        option.dataset.eventData = JSON.stringify(event);
        option.dataset.isContacted = isContacted ? 'true' : 'false';
        
        if (isContacted) {
            // ✅ Lead GIÀ contattato - Verde con checkmark
            option.textContent = `✅ ${eventTime} - ${leadName}${calendarLabel}`;
            option.style.color = '#059669'; // Verde scuro
            option.style.fontWeight = '600';
        } else {
            // ❌ Lead NON contattato - Rosso con X
            option.textContent = `❌ ${eventTime} - ${leadName}${calendarLabel}`;
            option.style.color = '#DC2626'; // Rosso
            option.style.fontWeight = '400';
        }
        
        selectLead.appendChild(option);
    });
    
    const contactedCount = dayEvents.filter((e, i) => {
        const leadName = extractNameFromEvent(e);
        return contactedLeads.some(c => 
            c.eventId === e.id || 
            (c.nome === leadName && new Date(c.date).toDateString() === selectedDate.toDateString())
        );
    }).length;
    
    console.log(`✅ Trovati ${dayEvents.length} lead totali (${contactedCount} già contattati) per ${dateString}`);
}

// ===== MANTIENI FUNZIONE ORIGINALE PER COMPATIBILITÀ =====
async function updateLeadSelector(selectedDay) {
    const selectLead = document.getElementById('selectLead');
    if (!selectLead) return;
    
    // 🔒 AUTH GUARD: Blocca senza login
    if (!window.accessToken) {
        selectLead.innerHTML = '<option value="">🔒 Effettua il login Google per vedere i lead</option>';
        selectLead.disabled = true;
        return;
    }
    
    // ⏳ LOADING STATE
    selectLead.innerHTML = '<option value="">⏳ Caricamento lead...</option>';
    selectLead.disabled = true;
    
    // USA EVENTI FILTRATI (escludi "X" + filtra per calendario)
    const events = getFilteredEventsByCalendar();
    
    // 🔥 CARICA LEAD CONTATTATI con fallback robusto
    let contactedLeads = [];
    try {
        if (window.DriveStorage && window.accessToken) {
            contactedLeads = await window.DriveStorage.getContactedLeads();
            console.log('✅ Lead contattati caricati da Drive:', contactedLeads.length);
        } else {
            // Fallback localStorage
            contactedLeads = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CONTACTED_LEADS) || '[]');
            console.log('⚠️ Lead contattati da localStorage (fallback):', contactedLeads.length);
        }
    } catch (error) {
        console.warn('⚠️ Errore caricamento lead contattati, uso localStorage:', error);
        contactedLeads = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CONTACTED_LEADS) || '[]');
    }
    
    // Filtra eventi per il giorno selezionato
    const dayEvents = events.filter(event => {
        const eventDate = new Date(event.start);
        const dateKey = eventDate.toLocaleDateString('it-IT', { 
            weekday: 'long', 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        });
        return dateKey === selectedDay;
    });
    
    // Popola select - TUTTI I LEAD sempre visibili
    selectLead.innerHTML = '<option value="">-- Seleziona lead --</option>';
    
    if (dayEvents.length === 0) {
        selectLead.innerHTML = '<option value="">-- Nessun appuntamento per questo giorno --</option>';
        selectLead.disabled = true;
        return;
    }
    
    selectLead.disabled = false;
    
    // 🎯 TUTTI I LEAD (contattati e non) nello stesso elenco
    dayEvents.forEach((event, index) => {
        const eventTime = new Date(event.start).toLocaleTimeString('it-IT', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const leadName = extractNameFromEvent(event);
        const calendarLabel = event.calendarName ? ` (${event.calendarName})` : '';
        
        // Verifica se già contattato
        const isContacted = contactedLeads.some(contacted => 
            contacted.eventId === event.id || 
            (contacted.nome === leadName && contacted.date === event.start)
        );
        
        const option = document.createElement('option');
        option.value = index;
        option.dataset.eventId = event.id;
        option.dataset.eventData = JSON.stringify(event);
        option.dataset.isContacted = isContacted ? 'true' : 'false';
        
        if (isContacted) {
            // ✅ Lead GIÀ contattato - Verde con checkmark
            option.textContent = `✅ ${eventTime} - ${leadName}${calendarLabel}`;
            option.style.color = '#059669'; // Verde scuro
            option.style.fontWeight = '600';
        } else {
            // ❌ Lead NON contattato - Rosso con X
            option.textContent = `❌ ${eventTime} - ${leadName}${calendarLabel}`;
            option.style.color = '#DC2626'; // Rosso
            option.style.fontWeight = '400';
        }
        
        selectLead.appendChild(option);
    });
}

// ===== ESTRAI NOME DA EVENTO (PULITO) =====
function extractNameFromEvent(event) {
    let name = '';
    
    // PRIORITÀ 1: Attendee displayName
    if (event.attendees && event.attendees.length > 0) {
        const attendee = event.attendees[0];
        if (attendee.displayName) {
            name = attendee.displayName;
        } else if (attendee.email) {
            name = attendee.email.split('@')[0].replace(/[._]/g, ' ');
        }
    }
    
    // PRIORITÀ 2: Summary (titolo evento)
    if (!name && event.summary) {
        name = event.summary;
    }
    
    // PRIORITÀ 3: Fallback
    if (!name) {
        return 'Senza nome';
    }
    
    // PULIZIA PATTERN COMUNI
    name = name
        .replace(/(appuntamento con|call con|meeting con|videocall con|chiamata con|videochiamata con)/gi, '')
        .trim();
    
    // RIMUOVI METADATI (tutto dopo : o ( )
    // Esempio: "Fabio Marano: Hight Ticket (11-45K) (Dante)" → "Fabio Marano"
    name = name.split(':')[0].trim();  // Rimuovi tutto dopo ":"
    name = name.split('(')[0].trim();  // Rimuovi tutto dopo "("
    name = name.split('[')[0].trim();  // Rimuovi tutto dopo "["
    name = name.split('-')[0].trim();  // Rimuovi tutto dopo "-" (se solo metadati)
    
    // RIMUOVI SPAZI MULTIPLI
    name = name.replace(/\s+/g, ' ').trim();
    
    // CAPITALIZZAZIONE: "MARIO ROSSI" o "mario rossi" → "Mario Rossi"
    // v2.5.65: usa l'helper unico (gestisce De Luca, D'Angelo, Anna-Maria, accentate)
    name = (window.toTitleCaseNome ? window.toTitleCaseNome(name) : name);

    return name || 'Senza nome';
}

// ===== ESTRAI TELEFONO DA EVENTO =====
// v2.5.71: estrazione telefono ELASTICA. Le vecchie regex non reggevano formati comuni come
//   (342) 354-2724 → le parentesi/trattini spezzavano il match e nessun pattern accettava un
// mobile a 10 cifre senza prefisso scritto così. Ora tolleriamo i formati più disparati con cui un
// numero finisce nella descrizione/posizione dell'evento Google:
//   (342) 354-2724 · 342.354.2724 · 342 3542724 · +39 342 354 2724 · 0039 3423542724 · 393423542724
// Strategia: 1) se c'è un'etichetta (Telefono:/Tel:/Cell:/WhatsApp:…) prendo il blocco dopo e lo
// normalizzo (permissivo, accetta anche fissi). 2) altrimenti scorro i "blocchi" che sembrano un
// numero (cifre + separatori telefonici) e tengo il primo che normalizza a un mobile italiano.
function extractPhoneFromEvent(event) {
    const text = `${event.description || ''} ${event.location || ''}`;
    if (!text.trim()) return '';

    // 1) Numero ETICHETTATO: prendo il blocco "telefonico" subito dopo l'etichetta e lo normalizzo.
    const labeled = text.match(/(?:telefono|tel|phone|cell|cellulare|mobile|whats?app|wa)[\s.:]*([+(]?[0-9][0-9()\s.\-]{6,}[0-9])/i);
    if (labeled && labeled[1]) {
        const p = normalizeItalianPhone(labeled[1], true);
        if (p) return p;
    }

    // 2) Nessuna etichetta utile: scorro i blocchi che sembrano un numero e tengo il primo valido.
    //    Qui sono più rigido (solo mobile italiano canonico) per non pescare date/importi.
    const blocks = text.match(/[+(]?[0-9][0-9()\s.\-]{6,}[0-9]/g) || [];
    for (const b of blocks) {
        const p = normalizeItalianPhone(b, false);
        if (p) return p;
    }
    return '';
}

// v2.5.71: normalizza un pezzo di testo "telefonico" → "+39XXXXXXXXXX", oppure '' se non plausibile.
// Tollera +, 0039, prefisso 39, parentesi, trattini, punti e spazi. `labeled`=true (numero preso da
// un'etichetta esplicita) allenta i controlli e accetta anche i fissi; con false accetta SOLO il
// mobile italiano a 10 cifre che inizia per 3 (riduce i falsi positivi su numeri vaganti: date, ecc).
function normalizeItalianPhone(raw, labeled) {
    if (!raw) return '';
    const hadPlus = String(raw).trim().startsWith('+');
    let digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';
    let hadCC = false; // prefisso internazionale esplicito (+39 / 0039 / 39 davanti a un numero lungo)
    if (digits.startsWith('0039')) { digits = digits.slice(4); hadCC = true; }
    else if (hadPlus && digits.startsWith('39')) { digits = digits.slice(2); hadCC = true; }
    else if (digits.startsWith('39') && digits.length > 10) { digits = digits.slice(2); hadCC = true; }
    if (!digits) return '';

    // Mobile italiano canonico: 10 cifre, inizia per 3 → sempre valido.
    if (digits.length === 10 && digits.startsWith('3')) return '+39' + digits;
    // Con prefisso internazionale esplicito o numero etichettato: fidati di più (fissi inclusi).
    if ((hadCC || labeled) && digits.length >= 9 && digits.length <= 11) return '+39' + digits;
    return '';
}

// ===== COMPILA FORM DA EVENTO =====
function fillFormFromEvent(event) {
    // v2.5.19: Attiva flag per bloccare re-trigger del listener selectDay
    isFormProgrammaticUpdate = true;
    
    const leadName = extractNameFromEvent(event);
    const phone = extractPhoneFromEvent(event);
    
    // PARSING INTELLIGENTE NOME/COGNOME con database nomi
    const { firstName, lastName } = parseNameSurname(leadName);
    
    document.getElementById('nome').value = firstName;
    document.getElementById('cognome').value = lastName;
    document.getElementById('telefono').value = phone;
    
    // AUTO-DETECT SERVIZIO E SOCIETÀ
    const { servizio, societa } = extractServiceFromEvent(event);
    document.getElementById('servizio').value = servizio;
    document.getElementById('societaSelect').value = societa;
    
    // Compila giorno e orario dall'evento (v2.5.24: oggi/domani)
    // 🆕 v2.5.34: FIX - Usa event.start.dateTime o event.start.date, non event.start diretto
    const eventStartString = event.start.dateTime || event.start.date || event.start;
    const eventDate = new Date(eventStartString);
    
    console.log('📅 [v2.5.34] DEBUG giorno/orario:', { 
        eventStart: event.start,
        eventStartString,
        eventDate, 
        isValidDate: !isNaN(eventDate.getTime()) 
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const eventDateOnly = new Date(eventDate);
    eventDateOnly.setHours(0, 0, 0, 0);
    
    let giornoValue;
    if (eventDateOnly.getTime() === today.getTime()) {
        giornoValue = 'oggi';
    } else if (eventDateOnly.getTime() === tomorrow.getTime()) {
        giornoValue = 'domani';
    } else {
        const giorniSettimana = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
        giornoValue = giorniSettimana[eventDate.getDay()];
    }
    
    document.getElementById('giorno').value = giornoValue;
    console.log('📅 [v2.5.34] Giorno impostato:', giornoValue);
    
    const hours = eventDate.getHours();
    const minutes = eventDate.getMinutes();
    let orarioValue = hours.toString();
    if (minutes > 0) {
        orarioValue += `.${minutes.toString().padStart(2, '0')}`;
    }
    document.getElementById('orario').value = orarioValue;
    console.log('⏰ [v2.5.34] Orario impostato:', orarioValue, { hours, minutes });
    
    // 🆕 v2.5.33: Mostra bottone Google Meet SEMPRE + Check COMPLETO Meet
    // Check TUTTI i formati possibili per Meet:
    // 1. hangoutLink (legacy)
    // 2. conferenceData.entryPoints[].uri (nuovo)
    // 3. conferenceData.conferenceId (fallback)
    // 4. descrizione contiene "meet.google.com" (fallback sicuro)
    const hasMeetLegacy = !!event.hangoutLink;
    const hasMeetNew = !!(event.conferenceData && event.conferenceData.entryPoints && 
                         event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video'));
    const hasMeetId = !!(event.conferenceData && event.conferenceData.conferenceId);
    const hasMeetInDescription = !!(event.description && event.description.includes('meet.google.com'));
    
    const meetLink = event.hangoutLink || 
                   (event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri) ||
                   (hasMeetInDescription ? event.description.match(/https:\/\/meet\.google\.com\/[a-z\-]+/)?.[0] : null);
    
    const hasMeet = hasMeetLegacy || hasMeetNew || hasMeetId || hasMeetInDescription;
    
    console.log('🔍 [v2.5.33] DEBUG Meet check:', { 
        hasMeetLegacy, 
        hasMeetNew, 
        hasMeetId, 
        hasMeetInDescription,
        hasMeet,
        meetLink,
        eventId: event.id
    });
    
    const meetContainer = document.getElementById('googleMeetContainer');
    if (meetContainer) {
        if (hasMeet && meetLink) {
            // Meet esiste → link verde
            meetContainer.innerHTML = `
                <div class="google-meet-link">
                    <a href="${meetLink}" target="_blank" class="btn-meet">
                        <i class="fas fa-video"></i> Apri Google Meet
                    </a>
                    <button type="button" onclick="copyMeetLink('${meetLink}')" class="btn-meet btn-meet-copy" title="Copia solo il link Meet (pulito, per il cliente)">
                        <i class="fas fa-copy"></i> Copia link Meet
                    </button>
                </div>
            `;
            meetContainer.style.display = 'block';
            console.log('📹 [v2.5.33] Google Meet disponibile:', meetLink);
        } else if (hasMeet && !meetLink) {
            // Meet ID presente ma link mancante → nascondi bottone
            meetContainer.style.display = 'none';
            console.warn('⚠️ [v2.5.33] Meet presente ma link non trovato, bottone nascosto');
        } else {
            // Meet NON esiste → bottone blu "+ Aggiungi Meet"
            meetContainer.innerHTML = `
                <div class="google-meet-link">
                    <button onclick="addMeetToEventFromForm('${event.id}', '${event.calendarId || 'primary'}')" 
                            class="btn-meet btn-meet-add" 
                            id="addMeetBtnForm">
                        <i class="fas fa-video"></i> + Aggiungi Meet
                    </button>
                </div>
            `;
            meetContainer.style.display = 'block';
            console.log('📹 [v2.5.33] Bottone "+ Aggiungi Meet" mostrato (evento senza Meet)');
        }
    }
    
    // 🆕 v2.5.46: imposta la modalità videochiamata leggendo l'evento.
    // Regola: nell'evento i setter scrivono "Tipo di call: Whatsapp/Link".
    // Se contiene "whatsapp" → WA, qualsiasi altra cosa (o riga assente) → LINK.
    setMeetModeToggle(detectMeetMode(event));

    // ✨ NUOVO: Controllo genere SETTER (non lead) per {YY}
    if (window.checkSetterGenderFromEvent) {
        window.checkSetterGenderFromEvent(event);
    }
    
    // Aggiorna anteprima
    if (window.updatePreview) {
        updatePreview();
    }
    
    // v2.5.19: Resetta flag dopo 100ms (attende che tutti gli event listener siano processati)
    setTimeout(() => {
        isFormProgrammaticUpdate = false;
        console.log('🔓 Flag isFormProgrammaticUpdate resettato');
    }, 100);
    
    console.log('✅ Form compilato da evento:', leadName, '→', firstName, lastName, '|', servizio, '→', societa);
}

// ===== v2.5.46: RILEVA MODALITÀ VIDEOCHIAMATA DALL'EVENTO =====
// Legge SOLO la riga "Tipo di call: ..." scritta dai setter nell'evento.
// IMPORTANTE: non si fa un match generico su "whatsapp" perché l'app aggiunge
// da sola una riga "📱 WhatsApp: https://wa.me/..." ad OGNI evento col telefono
// (vedi addWhatsAppLinkToEvent) → un contains generico darebbe sempre falso
// positivo WhatsApp. Quindi si legge solo il valore dopo l'etichetta "Tipo di call".
function detectMeetMode(event) {
    const text = `${event.summary || ''}\n${event.description || ''}\n${event.location || ''}`;
    // "di" reso opzionale per tollerare "Tipo call:" oltre a "Tipo di call:"
    const match = text.match(/tipo(?:\s+di)?\s+call\s*:?\s*([^\n\r]*)/i);
    const value = match ? match[1] : '';
    const mode = /whatsapp/i.test(value) ? 'WA' : 'LINK';
    console.log('📞 [v2.5.46] Modalità rilevata:', mode, '| riga "Tipo di call":', value.trim() || '(assente)');
    return mode;
}

// ===== v2.5.46: IMPOSTA TOGGLE MODALITÀ VIDEOCHIAMATA =====
// Agisce SOLO sui bottoni Link/WhatsApp, mai sugli altri toggle (es. Assistente M/F).
function setMeetModeToggle(mode) {
    const btns = document.querySelectorAll('.toggle-btn[data-value="LINK"], .toggle-btn[data-value="WA"]');
    btns.forEach(btn => {
        if (btn.dataset.value === mode) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    if (window.updatePreview) window.updatePreview();
}
window.setMeetModeToggle = setMeetModeToggle;

// ===== v2.5.65: TITLE CASE UNIFICATO PER I NOMI =====
// "DANTE DAVIDE CIAVARELLA" / "dante davide ciavarella" → "Dante Davide Ciavarella".
// Gestisce particelle attaccate da spazio (De Luca), apostrofo (D'Angelo) e trattino
// (Anna-Maria), incluse le accentate minuscole. Helper UNICO usato ovunque si componga
// o salvi un nome (rinomina eventi Calendar, estrazione contatti, rubrica): scriviamo
// come persone normali, non in MAIUSCOLO da barbari.
function toTitleCaseNome(text) {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        // prima lettera di ogni "parola": a inizio stringa o dopo spazio / apostrofo / trattino
        .replace(/(^|[\s'’\-])([a-zà-ÿ])/g, (m, sep, ch) => sep + ch.toUpperCase());
}
window.toTitleCaseNome = toTitleCaseNome;

// ===== PARSING INTELLIGENTE NOME/COGNOME =====
function parseNameSurname(fullName) {
    if (!fullName || fullName === 'Senza nome') {
        return { firstName: '', lastName: '' };
    }
    
    const words = fullName.trim().split(/\s+/);
    
    // Caso semplice: una sola parola
    if (words.length === 1) {
        return { firstName: words[0], lastName: '' };
    }
    
    // Caso: due parole
    if (words.length === 2) {
        return { firstName: words[0], lastName: words[1] };
    }
    
    // Caso: tre o più parole → usa database nomi
    // Cerca quale parola è un nome italiano conosciuto
    const nomiMaschili = window.NOMI_MASCHILI || [];
    const nomiFemminili = window.NOMI_FEMMINILI || [];
    const tuttiNomi = [...nomiMaschili, ...nomiFemminili];
    
    let firstNameIndex = 0;
    
    for (let i = 0; i < words.length; i++) {
        const wordLower = words[i].toLowerCase();
        if (tuttiNomi.includes(wordLower)) {
            firstNameIndex = i;
            break;
        }
    }
    
    // Tutto prima dell'indice = nome, resto = cognome
    const firstName = words.slice(0, firstNameIndex + 1).join(' ');
    const lastName = words.slice(firstNameIndex + 1).join(' ');
    
    return { firstName, lastName };
}

// ===== ESTRAI SERVIZIO DA EVENTO =====
function extractServiceFromEvent(event) {
    const description = event.description || '';
    const calendarName = event.calendarName || '';
    
    console.log('🔍 [extractServiceFromEvent] Evento:', event.summary);
    console.log('   📅 Calendario:', calendarName);
    console.log('   📝 Description:', description ? description.substring(0, 100) : '(vuota)');
    
    // PRIORITÀ 1: Cerca pattern "SERVIZIO: Stock Gain" in description
    const serviceMatch = description.match(/SERVIZIO[:\s]+(.+?)(?:\n|$)/i);
    
    if (serviceMatch) {
        const servizioText = serviceMatch[1].trim().toLowerCase();
        console.log('   ✅ Trovato SERVIZIO in description:', servizioText);
        
        // Mapping servizio → società
        if (servizioText.includes('stock gain') || servizioText.includes('sg')) {
            return {
                servizio: 'Stock Gain',
                societa: 'SG - Lead'
            };
        } else if (servizioText.includes('finanza efficace') || servizioText.includes('fe')) {
            return {
                servizio: 'Finanza Efficace',
                societa: 'FE - Lead'
            };
        }
    }
    
    // PRIORITÀ 2: Inferisci da nome calendario
    const calendarLower = calendarName.toLowerCase();
    
    // Pattern Finanza Efficace
    if (calendarLower.includes('fe -') || 
        calendarLower.includes('finanza efficace') ||
        calendarLower.includes('fe lead')) {
        console.log('   ✅ Rilevato FE da calendario:', calendarName);
        return {
            servizio: 'Finanza Efficace',
            societa: 'FE - Lead'
        };
    }
    
    // Pattern Stock Gain (default per calendari SG)
    if (calendarLower.includes('sg -') || 
        calendarLower.includes('stock gain') ||
        calendarLower.includes('sg lead') ||
        calendarLower.includes('call consulenza') ||
        calendarLower.includes('call interne') ||
        calendarLower.includes('follow up')) {
        console.log('   ✅ Rilevato SG da calendario:', calendarName);
        return {
            servizio: 'Stock Gain',
            societa: 'SG - Lead'
        };
    }
    
    // Default: Finanza Efficace (v2.5.43: se l'evento non specifica il servizio
    // e il calendario non è riconosciuto, resta Finanza Efficace / FE - Lead)
    console.log('   ⚠️ Calendario non riconosciuto, default a Finanza Efficace');
    return {
        servizio: 'Finanza Efficace',
        societa: 'FE - Lead'
    };
}

// ===== RILEVA GENERE DA NOME SETTER (DEPRECATA - Ora usiamo Google Sheets) =====
// Questa funzione non viene più usata, il genere viene gestito da google-sheets-assistenti.js
function detectGenderFromName(name) {
    console.log('⚠️ detectGenderFromName deprecata - usa checkSetterGenderFromEvent');
}

// ===== MARCA LEAD COME CONTATTATO =====
async function markLeadAsContacted(eventId, nome, cognome, telefono, eventDate, calendarId, eventCreated) {
    const contactedEntry = {
        eventId: eventId,
        nome: nome,
        cognome: cognome || '',
        telefono: telefono || '',
        date: eventDate,                        // orario APPUNTAMENTO (start)
        eventCreated: eventCreated || null,     // v2.5.58: orario di CREAZIONE evento (prenotazione)
        timestamp: new Date().toISOString()     // quando l'ho contattato io
    };
    
    // 🔥 FIX v2.5.15: Salva PRIMA su localStorage (backup), POI prova Drive
    // 1. Carica array esistente
    let contactedLeads = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CONTACTED_LEADS) || '[]');
    
    // 2. Evita duplicati
    const exists = contactedLeads.some(lead => 
        lead.eventId === eventId || (lead.nome === nome && lead.date === eventDate)
    );
    
    if (!exists) {
        // 3. SALVA SEMPRE su localStorage (backup primario)
        contactedLeads.push(contactedEntry);
        localStorage.setItem(STORAGE_KEYS_CALENDAR.CONTACTED_LEADS, JSON.stringify(contactedLeads));
        console.log('💾 Lead salvato in localStorage (backup primario):', nome);

        // v2.5.44: report attività — traccia ogni lead contattato
        if (window.logActivity) window.logActivity('lead_contattato', { nome: nome, cognome: cognome || '', telefono: telefono || '', eventId: eventId, date: eventDate });
        
        // 4. PROVA a salvare anche su Drive (sync cloud)
        try {
            if (window.DriveStorage && window.accessToken) {
                await window.DriveStorage.saveContactedLead(contactedEntry);
                console.log('✅ Lead sincronizzato su Drive:', nome);
            } else {
                console.log('⚠️ Non loggato Google: dati SOLO su localStorage');
            }
        } catch (error) {
            console.warn('⚠️ Drive fallito (403?), dati comunque salvati su localStorage:', error.message);
        }

        // 4.bis 🆔 v2.5.64: assegna (alla nascita del lead) un codice ID stabile e salvalo in cloud.
        // Serve per il deep-link ?id=Lxxxx iniettato nell'evento Calendar. Un codice non si riusa mai:
        // se la _key è già nella mappa, riuso il codice esistente. La _key usa leadIdentityKey (la
        // STESSA della sezione Lead), così il codice creato qui si ritrova sulla card. Best-effort:
        // un errore non blocca il flusso (leadCode resta null → nessun link rotto in descrizione).
        let leadCode = null;
        try {
            if (window.DriveStorage && window.accessToken && window.leadIdentityKey && window.formatLeadCode) {
                const key = window.leadIdentityKey(telefono, nome, cognome);
                let codes = await window.DriveStorage.load('LEAD_CODES');
                if (!codes || typeof codes !== 'object') codes = {};
                if (codes[key]) {
                    leadCode = codes[key]; // già assegnato: non riassegnare mai
                } else {
                    const counterObj = await window.DriveStorage.load('LEAD_CODE_COUNTER');
                    let last = (counterObj && typeof counterObj.next === 'number') ? counterObj.next : Object.keys(codes).length;
                    last += 1;
                    leadCode = window.formatLeadCode(last);
                    codes[key] = leadCode;
                    await window.DriveStorage.save('LEAD_CODES', codes);
                    await window.DriveStorage.save('LEAD_CODE_COUNTER', { next: last });
                    window.leadCodeCounter = Math.max(window.leadCodeCounter || 0, last);
                    console.log('🆔 [v2.5.64] Codice lead assegnato:', leadCode, key);
                }
                window.leadCodes = codes; // tieni allineata la mappa in memoria della sezione Lead
            } else {
                // v2.5.77: diagnostica — perché leadCode resta null (→ niente riga "📂 Scheda lead").
                // Il colpevole più frequente è accessToken assente/scaduto (GIS dopo ~1h).
                console.warn('⚠️ [v2.5.77] leadCode NON assegnato (riga scheda assente nell\'evento). Prerequisiti:', {
                    DriveStorage: !!window.DriveStorage,
                    accessToken: !!window.accessToken,
                    leadIdentityKey: !!window.leadIdentityKey,
                    formatLeadCode: !!window.formatLeadCode
                });
            }
        } catch (error) {
            console.warn('⚠️ [v2.5.64] Assegnazione codice lead fallita (ignorata):', error.message);
        }

        // 5. 🆕 v2.5.24: Aggiungi link WhatsApp nella descrizione evento
        // 🆕 v2.5.27: Rinomina evento con solo Nome Cognome
        // 🆕 v2.5.64: passa leadCode → riga "📂 Scheda lead: …?id=Lxxxx"
        try {
            await addWhatsAppLinkToEvent(eventId, telefono, nome, cognome, calendarId, leadCode);
        } catch (error) {
            console.warn('⚠️ Non riesco ad aggiornare evento con link WhatsApp:', error.message);
        }
    } else {
        console.log('ℹ️ Lead già marcato come contattato:', nome);
    }
    
    // 6. 🔥 FIX v2.5.15: Refresh UI DOPO salvataggio
    const selectDay = document.getElementById('selectDay');
    if (selectDay && selectDay.value) {
        await updateLeadSelectorByDate(selectDay.value);
        console.log('🔄 UI aggiornata dopo salvataggio lead');
    }
}

// ===== v2.5.78: ESTRAE IL LINK GOOGLE MEET DA UN EVENTO =====
// Cerca nei posti possibili: hangoutLink (legacy), conferenceData.entryPoints video (nuovo),
// e come ultima spiaggia un meet.google.com già scritto nella descrizione. '' se non c'è Meet.
function extractMeetLink(ev) {
    if (!ev) return '';
    return ev.hangoutLink ||
        ev.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri ||
        (ev.description ? (ev.description.match(/https:\/\/meet\.google\.com\/[a-z\-]+/i)?.[0] || '') : '') ||
        '';
}
window.extractMeetLink = extractMeetLink;

// ===== v2.5.24: AGGIUNGI LINK WHATSAPP NELLA DESCRIZIONE EVENTO =====
// ===== v2.5.27: RINOMINA EVENTO CON SOLO NOME COGNOME =====
// ===== v2.5.31: FIX - Rename SEMPRE attivo (anche eventi già esistenti) =====
// ===== v2.5.78: + riga "🎥 Google Meet" nel blocco (copia/incolla al cliente) =====
async function addWhatsAppLinkToEvent(eventId, telefono, nome, cognome, calendarId, leadCode) {
    if (!window.gapi || !window.gapi.client || !window.gapi.client.calendar) {
        console.warn('⚠️ Google Calendar API non inizializzata');
        return;
    }
    
    // v2.5.77: il telefono NON è più un blocco totale. Senza numero saltiamo SOLO le
    // righe WhatsApp/chiamata, ma il rename del titolo e la riga "📂 Scheda lead" devono
    // comunque essere applicati (prima un return precoce li uccideva tutti insieme).
    const hasPhone = !!telefono;
    if (!hasPhone) {
        console.warn('⚠️ [v2.5.77] Nessun telefono: salto WhatsApp/chiamata, proseguo con titolo + scheda lead');
    }

    try {
        // Normalizza numero per WhatsApp (solo se c'è il telefono)
        let whatsappLink = '';
        let phoneLink = '';
        if (hasPhone) {
            // v2.5.77 FIX: era /^\\+/ (backslash di troppo) → il "+" iniziale NON veniva
            // rimosso e usciva "wa.me/+39…" malformato. Ora come la gemella corretta sotto.
            let phoneClean = telefono.replace(/\s+/g, '').replace(/^\+/, '');
            if (!phoneClean.startsWith('39') && phoneClean.length === 10) {
                phoneClean = '39' + phoneClean;
            }
            // Genera link WhatsApp + link chiamata telefonica classica (tel:)
            whatsappLink = `https://wa.me/${phoneClean}`;
            phoneLink = `tel:+${phoneClean}`;
        }

        // 1. Ottieni evento corrente
        // v2.5.42 FIX: usa il calendario reale dell'evento (era hardcoded 'primary',
        // quindi su calendari SG non-primary la get/patch falliva con 404 e il rename +
        // link WhatsApp non venivano mai applicati).
        const calId = calendarId || 'primary';
        const event = await window.gapi.client.calendar.events.get({
            calendarId: calId,
            eventId: eventId
        });
        
        const currentDescription = event.result.description || '';

        // v2.5.64: link diretto alla scheda lead nell'app (?id=Lxxxx). Solo se ho il codice (niente
        // link rotti se leadCode manca). origin+pathname reali → funziona su qualsiasi dominio/host.
        const appLink = leadCode ? `${window.location.origin}${window.location.pathname}?id=${leadCode}` : '';
        const schedaLine = appLink ? `📂 Scheda lead: ${appLink}` : '';

        // v2.5.78: link Google Meet (se l'evento ce l'ha) → riga "🎥 Google Meet" nel blocco,
        // così Dante copia/incolla al cliente in un colpo solo (numero, WhatsApp, scheda, Meet).
        const meetLink = extractMeetLink(event.result);
        const meetLine = meetLink ? `🎥 Google Meet: ${meetLink}` : '';

        // 2. Controlla cosa manca già nella descrizione
        // v2.5.77: il link WhatsApp si aggiunge SOLO se ho il telefono. Scheda/Meet no:
        // dipendono solo dall'avere il dato, così entrano anche su lead senza numero.
        const needsWhatsAppLink = hasPhone && !currentDescription.includes('wa.me/');
        // v2.5.64: anche eventi vecchi (già con wa.me ma SENZA ?id=) ricevono la riga scheda al passaggio.
        const needsLeadLink = !!appLink && !currentDescription.includes('?id=');
        // v2.5.78: idem per il Meet — se l'evento ha un link e la descrizione non lo contiene.
        const needsMeetLink = !!meetLink && !currentDescription.includes(meetLink);

        // 3. 🆕 v2.5.27: Calcola nuovo titolo evento (solo Nome Cognome)
        // v2.5.65: Title Case in SCRITTURA (no MAIUSCOLO) → "Dante Davide Ciavarella"
        // v2.5.77: rename indipendente dal telefono, ma solo se newTitle non è vuoto
        // (un nome assente non deve azzerare il titolo dell'evento).
        const newTitle = toTitleCaseNome(cognome ? `${nome} ${cognome}` : nome);
        const currentTitle = event.result.summary || '';
        const needsTitleUpdate = !!newTitle && currentTitle !== newTitle;

        // 4. Prepara aggiornamenti
        const updates = {};

        if (needsWhatsAppLink) {
            // 🆕 v2.5.78: primo inserimento del blocco contatti IN CIMA (WhatsApp + chiamata
            // + scheda + Meet). Scheda/Meet solo se mancano davvero, per non duplicarle.
            const lines = [`📱 WhatsApp: ${whatsappLink}`, `📞 Chiama: ${phoneLink}`];
            if (needsLeadLink && schedaLine) lines.push(schedaLine);
            if (needsMeetLink && meetLine) lines.push(meetLine);
            updates.description = lines.join('\n') + (currentDescription ? '\n\n' + currentDescription : '');
            console.log('📱 [v2.5.78] Blocco contatti in cima:', lines);
        } else if (needsLeadLink || needsMeetLink) {
            // v2.5.78: wa.me già presente (o lead senza telefono): aggiungo in cima SOLO le righe
            // mancanti (scheda e/o Meet). Idempotente, niente duplicati.
            const lines = [];
            if (needsLeadLink && schedaLine) lines.push(schedaLine);
            if (needsMeetLink && meetLine) lines.push(meetLine);
            updates.description = lines.join('\n') + '\n' + currentDescription;
            console.log('📂 [v2.5.78] Righe aggiunte a evento esistente:', lines);
        }

        if (needsTitleUpdate) {
            updates.summary = newTitle;
            console.log('✏️ Rinomino evento:', currentTitle, '→', newTitle);
        }
        
        // 5. Aggiorna evento solo se necessario
        if (Object.keys(updates).length > 0) {
            await window.gapi.client.calendar.events.patch({
                calendarId: calId,
                eventId: eventId,
                resource: updates
            });

            console.log('✅ Evento Google Calendar aggiornato:', updates);
        } else {
            console.log('ℹ️ Evento già aggiornato, nessuna modifica necessaria');
        }
        
    } catch (error) {
        console.error('❌ Errore aggiornamento evento:', error);
        // v2.5.77: prima il fallimento restava SOLO in console (il chiamante logga warn).
        // Lo rendiamo visibile: tipicamente è il token Google scaduto/revocato (401/403),
        // perciò l'evento resta senza link/titolo e Dante non se ne accorgeva.
        const code = error?.result?.error?.code || error?.status;
        if (code === 401 || code === 403) {
            showNotification('⚠️ Link non iniettati nell\'evento — riconnetti Google e riprova', 'error');
        } else {
            showNotification('⚠️ Evento non aggiornato (link/titolo). Dettagli nella console.', 'error');
        }
        throw error;
    }
}

// ===== v2.5.31: CONTROLLA E CORREGGI TITOLO EVENTO (quando selezioni lead) =====
// ===== v2.5.32: AGGIUNGI ANCHE WHATSAPP LINK SE MANCANTE =====
async function ensureEventTitleCorrect(event) {
    if (!window.gapi || !window.gapi.client || !window.gapi.client.calendar) {
        return; // API non pronta, skip silenzioso
    }
    
    if (!event || !event.id) {
        return; // Evento invalido
    }
    
    try {
        // Estrai nome e cognome dal nome lead
        let leadName = (event.summary || '').trim();
        if (!leadName || leadName === 'Senza nome') {
            return; // Skip se nome vuoto
        }
        
        // 🆕 v2.5.33: Rimuovi tutto dopo ":" (es. "ARTURO ALVARI: Finanza..." → "ARTURO ALVARI")
        if (leadName.includes(':')) {
            leadName = leadName.split(':')[0].trim();
            console.log('🔪 [v2.5.33] Rimosso testo dopo ":", nuovo nome:', leadName);
        }
        
        // 🆕 v2.5.33: Rimuovi tutto dopo " - " (es. "Mario Rossi - SG Lead" → "Mario Rossi")
        if (leadName.includes(' - ')) {
            leadName = leadName.split(' - ')[0].trim();
            console.log('🔪 [v2.5.33] Rimosso testo dopo " - ", nuovo nome:', leadName);
        }
        
        // 🆕 v2.5.33: Rimuovi tutto tra parentesi (es. "Mario Rossi (Dante)" → "Mario Rossi")
        leadName = leadName.replace(/\s*\([^)]*\)/g, '').trim();
        
        // Parsing nome/cognome (stesso algoritmo di fillFormFromEvent)
        const { firstName, lastName } = parseNameSurname(leadName);
        // v2.5.65: Title Case in SCRITTURA (no MAIUSCOLO) → "Dante Davide Ciavarella"
        const newTitle = toTitleCaseNome(lastName ? `${firstName} ${lastName}` : firstName);
        
        console.log('✏️ [v2.5.33] Parsing:', { original: event.summary, cleaned: leadName, newTitle });
        
        // Controlla se titolo è già corretto (v2.5.77: solo se newTitle non è vuoto,
        // così un parsing che restituisce stringa vuota non azzera mai il titolo)
        const titleNeedsUpdate = !!newTitle && event.summary !== newTitle;

        // 🆕 v2.5.32: Controlla se manca WhatsApp link
        const telefono = document.getElementById('telefono')?.value.trim();
        const hasPhone = !!telefono;
        let whatsappNeedsUpdate = false;
        let leadLinkNeedsUpdate = false;
        let meetLinkNeedsUpdate = false;

        // v2.5.64: codice ID lead (read-only dalla mappa in memoria popolata dalla sezione Lead /
        // da markLeadAsContacted). Qui NON creo codici nuovi: se non c'è ancora, salto la riga scheda
        // (verrà aggiunta al primo contatto). Stessa leadIdentityKey usata ovunque.
        // v2.5.77: NON richiedo più il telefono per la chiave — leadIdentityKey cade su "nome:" quando
        // il numero manca, ESATTAMENTE come fa markLeadAsContacted → il codice si ritrova lo stesso.
        const leadKey = window.leadIdentityKey ? window.leadIdentityKey(telefono, firstName, lastName) : null;
        const leadCode = (leadKey && window.leadCodes) ? (window.leadCodes[leadKey] || null) : null;
        const appLink = leadCode ? `${window.location.origin}${window.location.pathname}?id=${leadCode}` : '';
        const schedaLine = appLink ? `📂 Scheda lead: ${appLink}` : '';

        // v2.5.78: link Google Meet (dal cache; rifinito col dato fresco dopo il get).
        let meetLink = extractMeetLink(event);

        // v2.5.77: leggo la descrizione UNA volta sola (prima c'erano DUE events.get ridondanti).
        // v2.5.78: fetch anche se c'è solo il Meet (oltre a telefono/scheda).
        let currentDescription = '';
        if (hasPhone || appLink || meetLink) {
            const currentEvent = await window.gapi.client.calendar.events.get({
                calendarId: event.calendarId || 'primary',
                eventId: event.id
            });
            currentDescription = currentEvent.result.description || '';
            meetLink = extractMeetLink(currentEvent.result) || meetLink;
            whatsappNeedsUpdate = hasPhone && !currentDescription.includes('wa.me/');
            leadLinkNeedsUpdate = !!appLink && !currentDescription.includes('?id=');
            meetLinkNeedsUpdate = !!meetLink && !currentDescription.includes(meetLink);
            console.log('📱 [v2.5.78] Check descrizione:', { hasPhone, hasWa: !whatsappNeedsUpdate, needsScheda: leadLinkNeedsUpdate, needsMeet: meetLinkNeedsUpdate });
        }
        const meetLine = meetLink ? `🎥 Google Meet: ${meetLink}` : '';

        // Se nulla da aggiornare, skip
        if (!titleNeedsUpdate && !whatsappNeedsUpdate && !leadLinkNeedsUpdate && !meetLinkNeedsUpdate) {
            return;
        }

        // Prepara aggiornamenti
        const updates = {};

        if (titleNeedsUpdate) {
            updates.summary = newTitle;
            console.log('✏️ [v2.5.32] Titolo evento da correggere:', event.summary, '→', newTitle);
        }

        if (whatsappNeedsUpdate) {
            // Telefono presente e wa.me mancante → WhatsApp + chiamata (+ scheda + Meet) in cima.
            let phoneClean = telefono.replace(/\s+/g, '').replace(/^\+/, '');
            if (!phoneClean.startsWith('39') && phoneClean.length === 10) {
                phoneClean = '39' + phoneClean;
            }
            const whatsappLink = `https://wa.me/${phoneClean}`;
            const phoneLink = `tel:+${phoneClean}`;
            const lines = [`📱 WhatsApp: ${whatsappLink}`, `📞 Chiama: ${phoneLink}`];
            if (leadLinkNeedsUpdate && schedaLine) lines.push(schedaLine);
            if (meetLinkNeedsUpdate && meetLine) lines.push(meetLine);
            updates.description = lines.join('\n') + (currentDescription ? '\n\n' + currentDescription : '');
            console.log('📱 [v2.5.78] Blocco contatti in cima:', lines);
        } else if (leadLinkNeedsUpdate || meetLinkNeedsUpdate) {
            // v2.5.78: wa.me già presente (o lead senza telefono) → aggiungo in cima SOLO le righe
            // mancanti (scheda e/o Meet). Idempotente, niente duplicati.
            const lines = [];
            if (leadLinkNeedsUpdate && schedaLine) lines.push(schedaLine);
            if (meetLinkNeedsUpdate && meetLine) lines.push(meetLine);
            updates.description = lines.join('\n') + '\n' + currentDescription;
            console.log('📂 [v2.5.78] Righe aggiunte a evento esistente:', lines);
        }

        // Aggiorna evento
        if (Object.keys(updates).length > 0) {
            await window.gapi.client.calendar.events.patch({
                calendarId: event.calendarId || 'primary',
                eventId: event.id,
                resource: updates
            });
            
            console.log('✅ [v2.5.32] Evento aggiornato:', updates);
            
            // 🔄 Aggiorna evento nel localStorage cache
            const allEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
            const eventIndex = allEvents.findIndex(e => e.id === event.id);
            if (eventIndex !== -1) {
                if (updates.summary) {
                    allEvents[eventIndex].summary = updates.summary;
                }
                if (updates.description) {
                    allEvents[eventIndex].description = updates.description;
                }
                localStorage.setItem('calendarEvents', JSON.stringify(allEvents));
            }
        }
        
    } catch (error) {
        console.warn('⚠️ [v2.5.32] Non riesco a correggere evento:', error.message);
    }
}

// ===== v2.5.58: FORMATTA ORA DI CREAZIONE EVENTO =====
// created = timestamp ISO 8601 di quando l'evento è stato creato nel calendario Google
// (≈ ora di prenotazione lato Acuity, sync server-side, latenza max qualche secondo).
// Ritorna stringa "gg/mm/aaaa hh:mm" o '' se non disponibile.
function formatEventCreated(created) {
    if (!created) return '';
    const d = new Date(created);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('it-IT') + ' ' +
        d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
window.formatEventCreated = formatEventCreated;

// ===== VISUALIZZA CALENDARIO =====
async function displayCalendarView() {
    const calendarView = document.getElementById('calendarView');
    if (!calendarView) return;

    // 🔒 v2.5.45 PRIVACY: senza login NON mostrare gli eventi (titoli = nomi clienti)
    // letti dalla cache. Da sloggati la pagina Calendario resta vuota.
    if (!isGoogleAuthenticated()) {
        calendarView.innerHTML = '<p class="placeholder-text">🔒 Effettua il login Google per vedere il calendario</p>';
        return;
    }

    // USA EVENTI FILTRATI (escludi "X" + filtra per calendario)
    const events = getFilteredEventsByCalendar();
    
    // 🔥 CARICA LEAD CONTATTATI con fallback robusto
    let contactedLeads = [];
    try {
        if (window.DriveStorage && window.accessToken) {
            contactedLeads = await window.DriveStorage.getContactedLeads();
        } else {
            contactedLeads = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CONTACTED_LEADS) || '[]');
        }
    } catch (error) {
        console.warn('⚠️ Errore caricamento lead contattati per calendario:', error);
        contactedLeads = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CONTACTED_LEADS) || '[]');
    }
    
    const selectedCalendars = getSelectedCalendars();
    
    // Filtra eventi "X" e calendari selezionati
    const filteredEvents = events.filter(event => {
        const isNotX = !shouldSkipEvent(event);
        const isSelectedCalendar = selectedCalendars.length === 0 || selectedCalendars.includes(event.calendarId);
        return isNotX && isSelectedCalendar;
    });
    
    if (filteredEvents.length === 0) {
        calendarView.innerHTML = '<p class="placeholder-text">Nessun evento sincronizzato. Connetti Google e sincronizza.</p>';
        return;
    }
    
    // Raggruppa eventi per giorno
    const eventsByDay = {};
    
    filteredEvents.forEach(event => {
        const eventDate = new Date(event.start);
        const dateKey = eventDate.toLocaleDateString('it-IT', { 
            weekday: 'long', 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        });
        
        if (!eventsByDay[dateKey]) {
            eventsByDay[dateKey] = [];
        }
        
        // Controlla se il lead è stato contattato
        const isContacted = contactedLeads.some(contacted => 
            contacted.eventId === event.id
        );
        
        eventsByDay[dateKey].push({
            ...event,
            contacted: isContacted
        });
    });
    
    // Genera HTML
    let html = '<div class="calendar-days">';
    
    Object.keys(eventsByDay).sort((a, b) => {
        const dateA = eventsByDay[a][0].start;
        const dateB = eventsByDay[b][0].start;
        return new Date(dateA) - new Date(dateB);
    }).forEach(dateKey => {
        const dayEvents = eventsByDay[dateKey];
        const totalEvents = dayEvents.length;
        const contactedEvents = dayEvents.filter(e => e.contacted).length;
        const pendingEvents = totalEvents - contactedEvents;
        
        html += `
            <div class="calendar-day-card">
                <div class="calendar-day-header">
                    <h4>${dateKey}</h4>
                    <div class="calendar-day-stats">
                        <span class="stat-pending">${pendingEvents} da contattare</span>
                        <span class="stat-contacted">${contactedEvents} contattati</span>
                    </div>
                </div>
                <div class="calendar-events-list">
        `;
        
        dayEvents.sort((a, b) => new Date(a.start) - new Date(b.start)).forEach(event => {
            const eventTime = new Date(event.start).toLocaleTimeString('it-IT', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            const leadName = extractNameFromEvent(event);
            const statusClass = event.contacted ? 'contacted' : 'pending';
            const statusIcon = event.contacted ? 'fa-check-circle' : 'fa-clock';
            const statusText = event.contacted ? 'Contattato' : 'Da contattare';
            // v2.5.58: ora di creazione evento (prenotazione) — dato critico, ora persistito
            const createdStr = formatEventCreated(event.created);
            
            // v2.5.30: Bottone Meet SEMPRE visibile (passati, presenti, futuri)
            const existingMeet = event.hangoutLink || 
                (event.conferenceData && event.conferenceData.entryPoints && 
                 event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video') 
                 ? event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video').uri : null);
            
            let meetBtn = '';
            if (existingMeet) {
                // Meet esiste → link verde + bottone "copia link nudo" (v2.5.77)
                meetBtn = `<a href="${existingMeet}" target="_blank" class="event-meet-btn event-meet-btn--exists" title="Apri Google Meet">
                    <i class="fab fa-google"></i> Meet
                </a>
                <button type="button" class="event-meet-btn event-meet-btn--copy" onclick="copyMeetLink('${existingMeet}')" title="Copia solo il link Meet (pulito, per il cliente)">
                    <i class="fas fa-copy"></i> Copia link
                </button>`;
            } else {
                // Meet NON esiste → bottone blu "+ Meet" (SEMPRE, anche passati)
                meetBtn = `<button class="event-meet-btn event-meet-btn--add" 
                    onclick="addMeetToEvent('${event.id}', '${event.calendarId}', this)" 
                    title="Aggiungi Google Meet a questo evento">
                    <i class="fas fa-video"></i> + Meet
                </button>`;
            }
            
            html += `
                <div class="calendar-event-item ${statusClass}">
                    <div class="event-time">
                        <i class="fas fa-clock"></i> ${eventTime}
                    </div>
                    <div class="event-name">
                        <i class="fas fa-user"></i> ${leadName}
                    </div>
                    ${createdStr ? `<div class="event-created" style="font-size: 0.8em; color: var(--gray-500);" title="Quando l'evento è stato creato/prenotato">
                        <i class="fas fa-calendar-plus"></i> Creato: ${createdStr}
                    </div>` : ''}
                    <div class="event-status">
                        <i class="fas ${statusIcon}"></i> ${statusText}
                    </div>
                    <div class="event-meet">${meetBtn}</div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    calendarView.innerHTML = html;
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', function() {
    // Init calendar sync
    initCalendarSync();
    
    // Bottone sincronizza manuale
    const syncBtn = document.getElementById('syncCalendarBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => syncCalendarEvents(false));
    }
    
    
    // Bottone refresh lead (ricarica lead senza sincronizzare calendario)
    const refreshLeadsBtn = document.getElementById('refreshLeadsBtn');
    if (refreshLeadsBtn) {
        refreshLeadsBtn.addEventListener('click', async () => {
            const selectDay = document.getElementById('selectDay');
            if (selectDay && selectDay.value) {
                await updateLeadSelectorByDate(selectDay.value);
                showNotification('Lista lead aggiornata!', 'success');
            } else {
                updateDaySelector();
                showNotification('Calendario aggiornato con data odierna!', 'success');
            }
        });
    }
    
    // Cambio giorno (date picker)
    const selectDay = document.getElementById('selectDay');
    if (selectDay) {
        selectDay.addEventListener('change', async function() {
            // v2.5.19: SKIP se aggiornamento programmatico (fillFormFromEvent in corso)
            if (isFormProgrammaticUpdate) {
                console.log('⏭️ SKIP updateLeadSelectorByDate – Aggiornamento programmatico del form in corso');
                return;
            }
            
            const selectedDate = this.value; // Format: YYYY-MM-DD
            if (selectedDate) {
                await updateLeadSelectorByDate(selectedDate);
            } else {
                const selectLead = document.getElementById('selectLead');
                selectLead.innerHTML = '<option value="">-- Seleziona una data --</option>';
                selectLead.disabled = true;
            }
        });
    }
    
    // v2.5.40: il filtro calendario della home è ora a checkbox multi-select.
    // I listener (checkbox singole + master "Tutti") sono dentro populateHomeCalendarDropdown().
    
    // Cambio lead
    const selectLead = document.getElementById('selectLead');
    if (selectLead) {
        selectLead.addEventListener('change', async function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.dataset.eventData) {
                const event = JSON.parse(selectedOption.dataset.eventData);
                fillFormFromEvent(event);

                // 🆕 v2.5.31: Controlla e correggi titolo evento (rename SEMPRE)
                await ensureEventTitleCorrect(event);
            } else {
                // 🆕 v2.5.46: nessun lead selezionato (es. "-- Seleziona lead --")
                // → torna al default "Link".
                setMeetModeToggle('LINK');
            }
        });
    }
});

// ===== AGGIUNGI GOOGLE MEET A EVENTO (v2.5.23) =====
async function addMeetToEvent(eventId, calendarId, btnEl) {
    // Guard se gapi non pronto
    if (!window.accessToken || !gapi?.client?.calendar) {
        showNotification('❌ Connetti Google prima di aggiungere Meet', 'error');
        return;
    }
    
    // Feedback visivo immediato
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
    }
    
    try {
        // requestId univoco con timestamp per evitare errori 400 su retry
        const requestId = eventId.replace(/[^a-z0-9]/gi, '') + Date.now();
        
        const response = await gapi.client.calendar.events.patch({
            calendarId: calendarId,
            eventId: eventId,
            conferenceDataVersion: 1,
            resource: {
                conferenceData: {
                    createRequest: {
                        requestId: requestId,
                        conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                }
            }
        });
        
        const updatedEvent = response.result;
        
        // Google genera il link in modo asincrono — può servire qualche secondo
        // Estraiamo subito hangoutLink se disponibile
        const meetLink = updatedEvent.hangoutLink || 
            (updatedEvent.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri);
        
        // Aggiorna localStorage immediatamente senza aspettare sync completa
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS) || '[]');
            const idx = saved.findIndex(e => e.id === eventId);
            if (idx >= 0) {
                saved[idx].conferenceData = updatedEvent.conferenceData || null;
                saved[idx].hangoutLink = updatedEvent.hangoutLink || null;
                localStorage.setItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS, JSON.stringify(saved));
            }
        } catch(lsErr) {
            console.warn('⚠️ Impossibile aggiornare localStorage:', lsErr);
        }
        
        if (meetLink) {
            showNotification(`✅ Google Meet aggiunto! Fireflies userà il titolo "${updatedEvent.summary || 'evento'}"`, 'success');
            // Rendi il bottone un link diretto
            if (btnEl) {
                const container = btnEl.parentElement;
                container.innerHTML = `<a href="${meetLink}" target="_blank" class="event-meet-btn event-meet-btn--exists" title="Apri Google Meet">
                    <i class="fab fa-google"></i> Meet
                </a>
                <button type="button" class="event-meet-btn event-meet-btn--copy" onclick="copyMeetLink('${meetLink}')" title="Copia solo il link Meet (pulito, per il cliente)">
                    <i class="fas fa-copy"></i> Copia link
                </button>`;
            }
            // v2.5.78: metti il link Meet anche nella descrizione (blocco da copiare al cliente)
            await prependMeetLinkToEvent(eventId, calendarId, meetLink);
        } else {
            // Link non ancora pronto — aggiorna dopo 3 secondi
            showNotification('⏳ Meet creato, link in generazione...', 'info');
            if (btnEl) {
                btnEl.innerHTML = '<i class="fas fa-check"></i> Creato';
                btnEl.style.opacity = '0.6';
            }
            setTimeout(async () => {
                try {
                    const r2 = await gapi.client.calendar.events.get({ calendarId, eventId });
                    const link2 = r2.result.hangoutLink || 
                        r2.result.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri;
                    if (link2) {
                        // Aggiorna localStorage
                        const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS) || '[]');
                        const idx = saved.findIndex(e => e.id === eventId);
                        if (idx >= 0) {
                            saved[idx].hangoutLink = r2.result.hangoutLink || null;
                            saved[idx].conferenceData = r2.result.conferenceData || null;
                            localStorage.setItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS, JSON.stringify(saved));
                        }
                        // v2.5.78: link Meet anche nella descrizione (blocco da copiare al cliente)
                        await prependMeetLinkToEvent(eventId, calendarId, link2);
                        displayCalendarView();
                        showNotification('✅ Link Meet pronto!', 'success');
                    }
                } catch(e) { console.warn('⚠️ Retry get event:', e); }
            }, 3000);
        }
        
        // Aggiorna la vista calendario per riflettere il cambio
        await displayCalendarView();
        
    } catch (err) {
        console.error('❌ Errore addMeetToEvent:', err);
        const msg = err?.result?.error?.message || err.message || 'Errore sconosciuto';
        showNotification('❌ Errore aggiunta Meet: ' + msg, 'error');
        // Ripristina bottone
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = '<i class="fas fa-video"></i> + Meet';
        }
    }
}

// ===== v2.5.30: WRAPPER PER AGGIUNGERE MEET DAL FORM =====
async function addMeetToEventFromForm(eventId, calendarId) {
    const btn = document.getElementById('addMeetBtnForm');
    
    // Chiama la funzione esistente
    await addMeetToEvent(eventId, calendarId, btn);
    
    // Dopo 3.5 secondi, ricarica evento per aggiornare form con Meet appena creato
    setTimeout(async () => {
        try {
            if (window.accessToken && gapi?.client?.calendar) {
                const response = await gapi.client.calendar.events.get({
                    calendarId: calendarId,
                    eventId: eventId
                });
                
                // Aggiorna localStorage
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS) || '[]');
                const idx = saved.findIndex(e => e.id === eventId);
                if (idx >= 0) {
                    saved[idx] = response.result;
                    localStorage.setItem(STORAGE_KEYS_CALENDAR.CALENDAR_EVENTS, JSON.stringify(saved));
                }
                
                // Ri-popola il form con evento aggiornato
                fillFormFromEvent(response.result);
                console.log('✅ Form aggiornato con Meet appena creato');
            }
        } catch (e) {
            console.warn('⚠️ Non riesco ad aggiornare form:', e);
        }
    }, 3500);
}

// ===== v2.5.78: METTE IL LINK MEET NELLA DESCRIZIONE (blocco contatti) =====
// Chiamata appena creato un Meet: aggiunge "🎥 Google Meet: <url>" in cima alla descrizione,
// così il blocco da copiare/incollare al cliente è completo (numero, WhatsApp, scheda, Meet).
// Idempotente: se il link è già nella descrizione non fa nulla.
async function prependMeetLinkToEvent(eventId, calendarId, meetLink) {
    if (!meetLink || !window.gapi?.client?.calendar) return;
    try {
        const calId = calendarId || 'primary';
        const ev = await window.gapi.client.calendar.events.get({ calendarId: calId, eventId });
        const desc = ev.result.description || '';
        if (desc.includes(meetLink)) return; // già presente, niente da fare
        const newDesc = `🎥 Google Meet: ${meetLink}` + (desc ? '\n' + desc : '');
        await window.gapi.client.calendar.events.patch({
            calendarId: calId, eventId, resource: { description: newDesc }
        });
        console.log('🎥 [v2.5.78] Link Meet aggiunto alla descrizione evento');
    } catch (e) {
        console.warn('⚠️ [v2.5.78] Link Meet non aggiunto alla descrizione:', e.message);
    }
}
window.prependMeetLinkToEvent = prependMeetLinkToEvent;

// ===== v2.5.77: COPIA SOLO IL LINK MEET (niente "pippone" di Google) =====
// Il bottone "Copia invito" di Google Calendar incolla SEMPRE un blocco fisso (orario,
// fuso, "Informazioni per partecipare", link…) generato da Google: NON è modificabile via
// API, non è nella nostra description. Questo invece mette negli appunti SOLO l'URL nudo
// (https://meet.google.com/xxx-xxxx-xxx), pronto da incollare pulito al cliente.
async function copyMeetLink(url) {
    if (!url) {
        showNotification('❌ Nessun link Meet da copiare', 'error');
        return;
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
        } else {
            // Fallback per contesti senza Clipboard API (http non sicuro, browser vecchi)
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        showNotification('✅ Link Meet copiato', 'success');
    } catch (err) {
        console.error('❌ Copia link Meet fallita:', err);
        showNotification('❌ Impossibile copiare il link Meet', 'error');
    }
}
window.copyMeetLink = copyMeetLink;

// ===== ESPORTA FUNZIONI =====
window.syncCalendarEvents = syncCalendarEvents;
window.updateDaySelector = updateDaySelector;
window.updateLeadSelector = updateLeadSelector;
window.updateLeadSelectorByDate = updateLeadSelectorByDate;
window.displayCalendarView = displayCalendarView;
window.setTodayDate = setTodayDate;
window.updateLeadsList = updateLeadsList;
window.getFilteredEventsByCalendar = getFilteredEventsByCalendar;
window.renderCalendarCheckboxes = renderCalendarCheckboxes;
window.markLeadAsContacted = markLeadAsContacted;
window.loadSavedEvents = loadSavedEvents; // v2.5.7: Export per caricare da cache
window.addMeetToEvent = addMeetToEvent; // v2.5.23: Aggiungi Google Meet a evento
window.addMeetToEventFromForm = addMeetToEventFromForm; // v2.5.30: Wrapper per form

console.log('✅ Google Calendar module v2.5.34 caricato - HOTFIX ORARIO/GIORNO');
