/* ================================================================================
   TESTmess v2.5.58 - Salvataggio rubrica AUTOMATICO ad ogni invio messaggio: se il
   numero NON è già in rubrica (dedup su SAVED_CONTACTS via isPhoneInRubrica) il contatto
   viene salvato direttamente in Google Contacts, senza passare dalla lista "da salvare".
   organizations.name = "FE - Lead"/"SG - Lead". Rimosso il gate shouldSaveContact()
   (deprecato). FIX: checkAndSaveContact passava chiavi sbagliate a saveContactToGoogle.
   Inoltre: created dell'evento Calendar propagato nel record lead-contattato (eventCreated).
   ================================================================================ */

// ===== STORAGE KEYS (per compatibilità con DriveStorage) =====
const STORAGE_KEYS = {
    CRONOLOGIA: 'CRONOLOGIA',
    LAST_MESSAGE: 'LAST_MESSAGE',
    TEMPLATES: 'TEMPLATES',
    OPERATOR_NAME: 'OPERATOR_NAME',
    LEAD_CHECKLIST: 'LEAD_CHECKLIST', // v2.5.55: stato checkbox funnel-conferma per lead (cloud/Drive)
    LEAD_BINDINGS: 'LEAD_BINDINGS',   // v2.5.57: aggancio manuale lead↔evento "LEAD - Call" (cloud/Drive)
    LEAD_CONFIRMED: 'LEAD_CONFIRMED',           // v2.5.61 (LEGACY): flag booleano "Confermato". Tenuto solo per migrazione → LEAD_STATUS.
    LEAD_STATUS: 'LEAD_STATUS',                  // v2.5.67: stato conferma a 3 valori per lead "confermato"|"pending"|"no" (cloud/Drive)
    LEAD_CHECKLIST_TIMES: 'LEAD_CHECKLIST_TIMES', // v2.5.61: timestamp congelato 1ª spunta step funnel (cloud/Drive)
    LEAD_CODES: 'LEAD_CODES',                     // v2.5.64: mappa _key→codice ID lead (cloud/Drive)
    LEAD_CODE_COUNTER: 'LEAD_CODE_COUNTER'        // v2.5.64: counter codici lead { next: <ultimo assegnato> }
};

// ===== STORAGE WRAPPER (Google Drive o localStorage fallback) =====
async function getStorageItem(key) {
    // TEMPLATES: SEMPRE localStorage (non Drive)
    if (key === STORAGE_KEYS.TEMPLATES) {
        return localStorage.getItem(STORAGE_KEYS.TEMPLATES);
    }
    
    // Altri dati: usa Drive se loggato
    if (window.DriveStorage && window.accessToken) {
        const data = await window.DriveStorage.load(key);
        return data ? JSON.stringify(data) : null;
    }
    
    // Altrimenti null (no fallback per cronologia)
    return null;
}

async function setStorageItem(key, value) {
    // TEMPLATES: SEMPRE localStorage (non Drive)
    if (key === STORAGE_KEYS.TEMPLATES) {
        localStorage.setItem(STORAGE_KEYS.TEMPLATES, value);
        return;
    }
    
    // Altri dati: usa Drive se loggato
    if (window.DriveStorage && window.accessToken) {
        try {
            const data = JSON.parse(value);
            await window.DriveStorage.save(key, data);
        } catch (error) {
            console.error(`❌ Errore salvataggio ${key}:`, error);
        }
    }
    
    // Altrimenti silent fail (no localStorage)
}

// ===== INIZIALIZZAZIONE =====
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 TESTmess v2.5.34 inizializzato - HOTFIX ORARIO/GIORNO');
    
    setupSidebar();
    setupNavigation();
    setupClickDoctor(); // v2.5.75: rete di sicurezza contro overlay fantasma che bloccano i click
    await setupEventListeners();
    await loadTemplates();
    await updatePreview();
    await loadLastMessageIndicator();
    await initDefaultDay();
    
    // Imposta data corrente nel date picker calendario
    if (window.setTodayDate) {
        window.setTodayDate();
    }
    
    // Carica eventi e calendari salvati da cache (v2.5.7)
    if (window.loadSavedEvents) {
        window.loadSavedEvents();
    }
    
    // Inizializza nuovi moduli v2.2.27
    if (window.initRubrica) {
        window.initRubrica();
    }
    if (window.initGitHubAutoPush) {
        window.initGitHubAutoPush();
    }
    
    // 🔔 Inizializza Dolce Paranoia
    await renderDolceParanoiaList();
    
    // Migrazione dati (se primo login)
    if (window.DriveStorage && window.accessToken) {
        setTimeout(() => window.DriveStorage.migrate(), 2000);
    }
    
    // Focus campo nome
    document.getElementById('nome').focus();

    // v2.5.64: DEEP-LINK scheda lead da Google Calendar (?id=Lxxxx). Aprendo il link da qualsiasi
    // device si atterra SEMPRE sulla card del lead: se già loggati subito, altrimenti appena auth
    // è pronta. Il parametro NON viene consumato finché il focus non riesce, così se l'utente logga
    // dopo si ritenta al prossimo evento auth-ready.
    const wantedCode = new URLSearchParams(location.search).get('id');
    if (wantedCode) {
        const runDeepLinkFocus = async () => {
            try {
                // evidenzia la voce di menu "lead" per coerenza UI
                document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.page === 'lead'));
                await showPage('lead'); // carica e renderizza i lead (richiede auth)
                const ok = focusLeadCard(wantedCode);
                if (ok) window.removeEventListener('auth-ready', runDeepLinkFocus); // riuscito: smetti di ritentare
            } catch (e) {
                console.warn('⚠️ [v2.5.64] Deep-link focus fallito:', e);
            }
        };
        if (window.isAuthReady) {
            runDeepLinkFocus(); // già loggato: vai subito
        } else {
            window.addEventListener('auth-ready', runDeepLinkFocus); // aspetta il login, poi ritenta
        }
    }
});

// ===== SIDEBAR =====
function setupSidebar() {
    const hamburger = document.getElementById('hamburgerBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const closeBtn = document.getElementById('closeSidebar');
    
    hamburger.addEventListener('click', () => {
        sidebar.classList.add('active');
        overlay.classList.add('active');
    });
    
    const closeSidebar = () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    };
    
    closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
}

// ===== v2.5.75: CLICK DOCTOR — rete di sicurezza anti "non clicco da nessuna parte" =====
// Sintomo ricorrente: un elemento fixed/absolute a (quasi) tutto schermo ma INVISIBILE (opacity≈0
// o visibility:hidden lasciato attivo) resta sopra la pagina e mangia OGNI click. Nessun controllo
// vero è mai così (grande + invisibile + che cattura i click): se lo trovo al primo punto del click
// è per forza un overlay fantasma → lo neutralizzo (pointer-events:none), lo NOMINO con un toast
// visibile (così sappiamo subito il colpevole, senza aprire la console) e lo loggo. Non rido il
// click: l'utente ri-clicca e ora passa. Difensivo e a prova di errore: non deve MAI rompere l'app.
function setupClickDoctor() {
    document.addEventListener('pointerdown', (e) => {
        try {
            const x = e.clientX, y = e.clientY;
            let el = document.elementFromPoint(x, y);
            let hops = 0;
            while (el && el !== document.body && el !== document.documentElement && hops++ < 6) {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                const big = r.width >= window.innerWidth * 0.5 && r.height >= window.innerHeight * 0.5;
                const invisible = parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden';
                const floating = cs.position === 'fixed' || cs.position === 'absolute';
                if (big && invisible && floating && cs.pointerEvents !== 'none') {
                    el.style.pointerEvents = 'none';
                    const sel = el.id ? '#' + el.id
                        : (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : el.tagName.toLowerCase());
                    console.error('🩺 [Click Doctor] Overlay fantasma che bloccava i click NEUTRALIZZATO:', sel, el);
                    if (window.showLeadToast) window.showLeadToast('Sbloccato overlay fantasma: ' + sel + ' — ri-clicca');
                    return;
                }
                el = el.parentElement;
            }
        } catch (_) { /* il doctor non deve mai far esplodere l'app */ }
    }, true);
}

// ===== NAVIGAZIONE PAGINE =====
function setupNavigation() {
    const links = document.querySelectorAll('.sidebar-link');
    
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            const page = link.dataset.page;
            
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            showPage(page);
            
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
        });
    });
}

async function showPage(page) {
    const pages = {
        'home': 'mainContent',
        'riconferme': 'riconfermeContent',
        'calendario': 'calendarioContent',
        'messaggi': 'messaggiContent',
        'lead': 'leadContent',
        'rubrica': 'rubricaContent',
        'importante': 'importanteContent'
    };
    
    // Nascondi tutte le pagine
    Object.values(pages).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    // Mostra pagina richiesta
    const targetPage = pages[page];
    if (targetPage) {
        document.getElementById(targetPage).style.display = 'block';
        
        // Carica contenuto specifico
        if (page === 'lead') await loadLeadSection();
        if (page === 'messaggi') loadMessaggiList();
        if (page === 'calendario' && window.displayCalendarView) displayCalendarView();
        if (page === 'rubrica' && window.renderRubricaList) window.renderRubricaList();
        if (page === 'importante' && window.updatePushStatus) window.updatePushStatus();
    }
}

// ===== EVENT LISTENERS =====
async function setupEventListeners() {
    // Capitalizzazione nome
    document.getElementById('nome').addEventListener('input', async function(e) {
        e.target.value = capitalizeWords(e.target.value);
        await updatePreview();
    });
    
    document.getElementById('cognome').addEventListener('input', function(e) {
        e.target.value = capitalizeWords(e.target.value);
    });
    
    // Validazione telefono
    document.getElementById('telefono').addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/[^\d\+\s]/g, '');
    });
    
    // Campo Società - mostra/nascondi input custom
    const societaSelect = document.getElementById('societaSelect');
    const societaCustom = document.getElementById('societaCustom');
    if (societaSelect && societaCustom) {
        societaSelect.addEventListener('change', function() {
            if (this.value === 'Altro') {
                societaCustom.style.display = 'block';
                societaCustom.focus();
            } else {
                societaCustom.style.display = 'none';
                societaCustom.value = '';
            }
        });
    }
    
    // Update preview su tutti i campi + Mostra/Nascondi Dolce Paranoia card
    ['giorno', 'orario', 'servizio', 'tipoMessaggio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', async () => {
            await updatePreview();
            
            // 🔔 Mostra/Nascondi Dolce Paranoia card
            if (id === 'tipoMessaggio') {
                const card = document.getElementById('dolceParanoiaCard');
                if (card) {
                    if (el.value === 'dolce_paranoia') {
                        card.style.display = 'block';
                        await renderDolceParanoiaList();
                    } else {
                        card.style.display = 'none';
                    }
                }
            }
        });
        if (el && id === 'orario') el.addEventListener('input', async () => await updatePreview());
    });
    
    // Toggle buttons
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const group = this.parentElement;
            group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            await updatePreview();
        });
    });
    
    // Time buttons
    document.getElementById('decreaseTime1h').addEventListener('click', async () => await adjustTime(-60));
    document.getElementById('decreaseTime30m').addEventListener('click', async () => await adjustTime(-30));
    document.getElementById('increaseTime30m').addEventListener('click', async () => await adjustTime(30));
    document.getElementById('increaseTime1h').addEventListener('click', async () => await adjustTime(60));
    
    // Date navigation buttons (±90 giorni limite)
    const prevDayBtn = document.getElementById('prevDayBtn');
    const nextDayBtn = document.getElementById('nextDayBtn');
    const selectDay = document.getElementById('selectDay');
    
    // Debounce per prevenire click multipli
    let isNavigating = false;
    
    if (prevDayBtn && nextDayBtn && selectDay) {
        prevDayBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Previeni click multipli
            if (isNavigating) {
                console.log('⏳ Navigazione in corso, ignoro click...');
                return;
            }
            isNavigating = true;
            
            // Se nessuna data selezionata, inizializza con oggi
            if (!selectDay.value) {
                const today = new Date();
                selectDay.value = today.toISOString().split('T')[0];
            }
            
            const currentDate = new Date(selectDay.value + 'T12:00:00'); // Usa mezzogiorno per evitare problemi timezone
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Limite: non oltre 90 giorni nel passato
            const minDate = new Date(today);
            minDate.setDate(minDate.getDate() - 90);
            
            if (currentDate > minDate) {
                currentDate.setDate(currentDate.getDate() - 1);
                selectDay.value = currentDate.toISOString().split('T')[0];
                selectDay.dispatchEvent(new Event('change'));
                console.log('📅 ← Giorno precedente:', selectDay.value);
            } else {
                showNotification('⚠️ Limite raggiunto: -90 giorni', 'warning');
            }
            
            // Reset flag dopo 300ms
            setTimeout(() => { isNavigating = false; }, 300);
        });
        
        nextDayBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Previeni click multipli
            if (isNavigating) {
                console.log('⏳ Navigazione in corso, ignoro click...');
                return;
            }
            isNavigating = true;
            
            // Se nessuna data selezionata, inizializza con oggi
            if (!selectDay.value) {
                const today = new Date();
                selectDay.value = today.toISOString().split('T')[0];
            }
            
            const currentDate = new Date(selectDay.value + 'T12:00:00'); // Usa mezzogiorno per evitare problemi timezone
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Limite: non oltre 90 giorni nel futuro
            const maxDate = new Date(today);
            maxDate.setDate(maxDate.getDate() + 90);
            
            if (currentDate < maxDate) {
                currentDate.setDate(currentDate.getDate() + 1);
                selectDay.value = currentDate.toISOString().split('T')[0];
                selectDay.dispatchEvent(new Event('change'));
                console.log('📅 → Giorno successivo:', selectDay.value);
            } else {
                showNotification('⚠️ Limite raggiunto: +90 giorni', 'warning');
            }
            
            // Reset flag dopo 300ms
            setTimeout(() => { isNavigating = false; }, 300);
        });
    }
    
    // Action buttons
    document.getElementById('inviaMessaggio').addEventListener('click', async () => await sendToWhatsApp());
    document.getElementById('generaMessaggio').addEventListener('click', async (e) => await generateMessage(e));
    document.getElementById('copiaMessaggio').addEventListener('click', copyToClipboard);
    document.getElementById('copiaIban').addEventListener('click', copyIban);
    
    // 🔔 Dolce Paranoia refresh
    const refreshDolceParanoiaBtn = document.getElementById('refreshDolceParanoiaBtn');
    if (refreshDolceParanoiaBtn) {
        refreshDolceParanoiaBtn.addEventListener('click', async () => {
            await renderDolceParanoiaList();
            showNotification('🔔 Promemoria aggiornati', 'success');
        });
    }
    
    // Anteprima editabile
    document.getElementById('anteprimaMessaggio').addEventListener('input', function() {
        // L'anteprima è sempre sincronizzata, ma può essere modificata manualmente
    });
}

// ===== CAPITALIZZAZIONE =====
function capitalizeWords(str) {
    return str.split(' ').map(word => {
        if (word.length > 0) {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        return word;
    }).join(' ');
}

// ===== GET SOCIETÀ VALUE =====
function getSocietaValue() {
    const select = document.getElementById('societaSelect');
    const custom = document.getElementById('societaCustom');
    
    if (!select) return 'SG - Lead'; // Fallback
    
    if (select.value === 'Altro' && custom && custom.value.trim()) {
        return custom.value.trim();
    }
    return select.value;
}

// ===== ORARIO =====
async function adjustTime(minutes) {
    const orarioInput = document.getElementById('orario');
    let currentValue = orarioInput.value;
    
    let hours, mins;
    if (currentValue.includes('.') || currentValue.includes(':')) {
        const parts = currentValue.split(/[.:]/).map(n => parseInt(n) || 0);
        hours = parts[0];
        mins = parts[1] || 0;
    } else {
        hours = parseInt(currentValue) || 15;
        mins = 0;
    }
    
    let totalMinutes = hours * 60 + mins + minutes;
    
    // Limiti: 10:00 - 22:00
    totalMinutes = Math.max(600, Math.min(1320, totalMinutes));
    
    hours = Math.floor(totalMinutes / 60);
    mins = totalMinutes % 60;
    
    // Se minuti sono 0, mostra solo l'ora
    if (mins === 0) {
        orarioInput.value = `${hours}`;
    } else {
        orarioInput.value = `${hours}.${String(mins).padStart(2, '0')}`;
    }
    
    await updatePreview();
}

// ===== SALUTI =====
function getSalutoIniziale() {
    const ora = new Date().getHours();
    
    if (ora >= 6 && ora < 13) {
        return "Buongiorno";
    } else if (ora >= 13 && ora < 17) {
        return "Buon pomeriggio";
    } else {
        return "Buonasera";
    }
}

function getSalutoFinale() {
    const ora = new Date().getHours();
    
    if (ora >= 6 && ora < 13) {
        return "una buona giornata";
    } else if (ora >= 13 && ora < 17) {
        return "un buon pomeriggio";
    } else {
        return "una buona serata";
    }
}

// ===== ANTEPRIMA MESSAGGIO =====
async function updatePreview() {
    const nome = document.getElementById('nome').value.trim();
    const tipoMessaggio = document.getElementById('tipoMessaggio').value;
    const assistenteBtn = document.querySelector('.toggle-group .toggle-btn.active[data-value]');
    const assistente = assistenteBtn ? assistenteBtn.dataset.value : 'M';
    const giorno = document.getElementById('giorno').value;
    const orario = document.getElementById('orario').value;
    const modalitaBtn = document.querySelectorAll('.toggle-group')[1].querySelector('.toggle-btn.active');
    const modalita = modalitaBtn ? modalitaBtn.dataset.value : 'LINK';
    const servizio = document.getElementById('servizio').value;
    const operatore = document.getElementById('operatoreName').textContent || 'Dante';
    
    const preview = document.getElementById('anteprimaMessaggio');
    
    if (!nome) {
        preview.value = 'Compila i campi sopra per vedere l\'anteprima...';
        return;
    }
    
    // Carica template (USA SEMPRE localStorage per templates)
    const templatesString = localStorage.getItem('sgmess_templates_local');
    const templates = JSON.parse(templatesString || '[]');
    const template = templates.find(t => t.id === tipoMessaggio);
    
    if (!template) {
        preview.value = 'Template non trovato!';
        console.error('❌ Template non trovato per:', tipoMessaggio);
        return;
    }
    
    // Sostituzioni
    const BB = getSalutoIniziale();
    const NN = nome;
    const YY = assistente === 'M' ? 'il mio' : 'la mia';
    
    // 🆕 LOGICA {GG} DINAMICA per Dolce Paranoia
    let GG = giorno;
    if (tipoMessaggio === 'dolce_paranoia') {
        // Per Dolce Paranoia: usa giorno settimana in lettere (es. "martedì")
        const giornoSelezionato = document.getElementById('giorno').value;
        if (giornoSelezionato) {
            const data = new Date(giornoSelezionato);
            const giornoSettimana = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
            GG = giornoSettimana[data.getDay()];
        }
    }
    
    // 🆕 FORMATO ORARIO SPECIALE per Memo del Giorno
    let HH = orario;
    if (tipoMessaggio === 'memo_giorno' || tipoMessaggio === 'conferma_lettura') {
        // Formato speciale: 15:00 → "15", 15:30 → "15.30"
        if (orario.includes(':')) {
            const [h, m] = orario.split(':');
            HH = m === '00' ? h : `${h}.${m}`;
        } else if (orario.includes('.')) {
            const [h, m] = orario.split('.');
            HH = m === '00' ? h : `${h}.${m}`;
        }
    }
    
    const VV = modalita === 'LINK' 
        ? 'Ti manderò il link per la videochiamata 10 minuti prima' 
        : 'Ti videochiamerò su WhatsApp come richiesto';
    const TT = getSalutoFinale();
    const OPERATORE = operatore;
    const SERVIZIO = servizio;
    
    let messaggio = template.testo;
    messaggio = messaggio.replace(/{BB}/g, BB);
    messaggio = messaggio.replace(/{NN}/g, NN);
    messaggio = messaggio.replace(/{YY}/g, YY);
    messaggio = messaggio.replace(/{GG}/g, GG);
    messaggio = messaggio.replace(/{HH}/g, HH);
    messaggio = messaggio.replace(/{VV}/g, VV);
    messaggio = messaggio.replace(/{TT}/g, TT);
    messaggio = messaggio.replace(/{OPERATORE}/g, OPERATORE);
    messaggio = messaggio.replace(/{SERVIZIO}/g, SERVIZIO);
    
    preview.value = messaggio;
}

// ===== GENERA MESSAGGIO =====
async function generateMessage(e) {
    if (e) e.preventDefault();
    
    const nome = document.getElementById('nome').value.trim();
    const cognome = document.getElementById('cognome').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const servizio = document.getElementById('servizio').value;
    const societa = getSocietaValue(); // USA LA NUOVA FUNZIONE
    
    if (!nome) {
        showNotification('Inserisci il nome!', 'error');
        return;
    }
    
    // Prendi messaggio dall'anteprima (editabile)
    const messaggio = document.getElementById('anteprimaMessaggio').value;
    
    // Mostra output
    document.getElementById('outputMessaggio').textContent = messaggio;
    document.getElementById('outputCard').style.display = 'block';
    
    // Salva in cronologia (v2.2.27: con servizio e società)
    // v2.5.42 FIX: AWAIT — internamente marca il lead come contattato leggendo il
    // <select> ancora selezionato. Senza await, resetForm() più sotto azzerava la
    // selezione PRIMA che il mark leggesse l'eventId → lead mai segnato ✅.
    await saveToCronologia(nome, cognome, telefono, messaggio, servizio, societa, 'generato'); // v2.5.45: canale

    // Salva ultimo messaggio
    saveLastMessage(nome, cognome, telefono);

    // Salva in Google Contacts (v2.5.58: SALVATAGGIO AUTOMATICO ad OGNI invio se il
    // numero NON è già in rubrica — gate primo-messaggio/da-calendario RIMOSSO, ora la
    // dedup contro SAVED_CONTACTS dentro checkAndSaveContact decide cosa salvare).
    if (window.saveContactToGoogle && nome && telefono) {
        checkAndSaveContact(nome, cognome, telefono, societa, servizio);
    }

    // Copia automaticamente
    navigator.clipboard.writeText(messaggio).then(() => {
        showNotification('Messaggio generato e copiato!', 'success');
    });

    // Reset form (v2.5.42: await, così il refresh tendina è sequenziale e non concorrente)
    await resetForm();
}

// ===== INVIA SU WHATSAPP =====
async function sendToWhatsApp() {
    const nome = document.getElementById('nome').value.trim();
    const cognome = document.getElementById('cognome').value.trim();
    let telefono = document.getElementById('telefono').value.trim();
    const servizio = document.getElementById('servizio').value;
    const societa = getSocietaValue(); // USA LA NUOVA FUNZIONE
    
    if (!nome) {
        showNotification('Inserisci il nome!', 'error');
        return;
    }
    
    const messaggio = document.getElementById('anteprimaMessaggio').value;
    
    // Se telefono vuoto, usa numero utente (fallback)
    if (!telefono) {
        // TODO: Implementare rilevamento numero utente
        telefono = '393755588371'; // Fallback temporaneo
        showNotification('Nessun numero inserito, invio a te stesso...', 'info');
    }
    
    // Normalizza numero
    telefono = telefono.replace(/\s+/g, '').replace(/^\+/, '');
    if (!telefono.startsWith('39') && telefono.length === 10) {
        telefono = '39' + telefono;
    }
    
    // v2.5.42 FIX: apri WhatsApp SUBITO, mentre siamo ancora nel gesto-utente del click.
    // (Se aprissimo dopo gli await qui sotto, il popup blocker bloccherebbe la finestra.)
    const whatsappUrl = `https://wa.me/${telefono}?text=${encodeURIComponent(messaggio)}`;
    window.open(whatsappUrl, '_blank');
    showNotification('Apertura WhatsApp...', 'success');

    // Salva in cronologia (v2.2.27: con servizio e società)
    // v2.5.42 FIX: AWAIT e PRIMA del resetForm — così il mark legge il lead ancora
    // selezionato (eventId presente) e la tendina non si svuota in concorrenza.
    await saveToCronologia(nome, cognome, telefono, messaggio, servizio, societa, 'whatsapp'); // v2.5.45: canale
    saveLastMessage(nome, cognome, telefono);

    // Salva in Google Contacts (v2.5.58: SALVATAGGIO AUTOMATICO ad OGNI invio se il
    // numero NON è già in rubrica — gate primo-messaggio/da-calendario RIMOSSO, ora la
    // dedup contro SAVED_CONTACTS dentro checkAndSaveContact decide cosa salvare).
    if (window.saveContactToGoogle && nome && telefono) {
        checkAndSaveContact(nome, cognome, telefono, societa, servizio);
    }

    // Reset form (per ultimo: la selezione è già stata usata dal mark)
    await resetForm();
}

// ===== GATE SALVATAGGIO RUBRICA (v2.5.48) — DEPRECATO in v2.5.58 =====
// ⚠️ v2.5.58: NON più usato. Il salvataggio in rubrica ora avviene ad OGNI invio (se il
// numero non è già presente, vedi checkAndSaveContact). Funzione mantenuta per riferimento
// storico / eventuale riuso, ma non più richiamata dai punti d'invio.
// Salva il contatto in Google Contacts SOLO se ENTRAMBE le condizioni sono vere:
//   1) il tipo messaggio selezionato è il PRIMO messaggio (tipoMessaggio === 'primo_messaggio');
//   2) il lead selezionato proviene dal CALENDARIO (l'<option> in #selectLead ha dataset.eventId).
// IMPORTANTE: va letta PRIMA di resetForm(). I chiamanti (sendToWhatsApp/generateMessage)
// la invocano già prima del reset, quando tipoMessaggio ed eventId sono ancora valorizzati.
// Quando il gate NON è superato logga il motivo e NON salva (la cronologia e il mark
// lead-contattato restano invariati: questo gate riguarda SOLO la rubrica).
function shouldSaveContact() {
    const tipoMessaggio = document.getElementById('tipoMessaggio')?.value;
    const isPrimoMessaggio = tipoMessaggio === 'primo_messaggio';

    const selectLead = document.getElementById('selectLead');
    const eventId = selectLead?.options[selectLead.selectedIndex]?.dataset?.eventId;
    const isFromCalendar = !!eventId;

    if (!isPrimoMessaggio) {
        console.log(`⏭️ Salvataggio rubrica saltato: tipo messaggio non-primo (tipoMessaggio="${tipoMessaggio || ''}")`);
        return false;
    }
    if (!isFromCalendar) {
        console.log('⏭️ Salvataggio rubrica saltato: lead senza eventId (non proviene dal calendario)');
        return false;
    }
    return true;
}

// ===== CHECK E SALVA CONTATTO (v2.5.58: SALVATAGGIO AUTOMATICO ALL'INVIO) =====
// Chiamata a OGNI invio messaggio (vedi generateMessage / sendToWhatsApp).
// Logica:
//   1) Se Google non è connesso → notifica e basta (niente token = nemmeno la cronologia
//      si salva, vedi saveToCronologia: lo storage è 100% cloud). Il contatto NON è perso:
//      appena rifai login potrai aggiungerlo a mano dal form Rubrica.
//   2) Dedup contro la cache SAVED_CONTACTS (via isPhoneInRubrica, stessa normalizzazione
//      di getUnsavedContacts). Se è GIÀ in rubrica → non faccio nulla.
//   3) Se NON è in rubrica → salvo direttamente in Google Contacts con saveContactToGoogle,
//      con organizations.name = "FE - Lead" / "SG - Lead" (dal valore società, o derivato
//      dal servizio se la società è vuota).
// v2.5.58 FIX: prima questa funzione passava chiavi sbagliate (firstName/lastName/phone/
// company) a saveContactToGoogle, che invece legge nome/cognome/telefono/societa e ritorna
// un booleano: di fatto il salvataggio automatico NON funzionava mai. Ora è allineata.
async function checkAndSaveContact(nome, cognome, telefono, societa, servizio) {
    if (!window.saveContactToGoogle) {
        console.error('❌ saveContactToGoogle NON disponibile (rubrica.js non caricato?)');
        return;
    }

    // 1) Nessun token → fallback morbido (non perdere nulla, solo notifica)
    if (!window.accessToken) {
        showNotification('ℹ️ Google non connesso: il contatto non è stato salvato in rubrica. Rifai login e aggiungilo dalla sezione Rubrica.', 'info');
        console.log('⏭️ Salvataggio rubrica saltato: nessun accessToken');
        return;
    }

    // organizations.name: usa la società se valorizzata, altrimenti derivala dal servizio (FE/SG)
    let societaValue = (societa || '').trim();
    if (!societaValue && window.societaFromTipoLead) {
        societaValue = window.societaFromTipoLead(servizio);
    }

    // 2) Dedup contro SAVED_CONTACTS (numero già in rubrica → non fare nulla)
    if (window.isPhoneInRubrica) {
        const check = window.isPhoneInRubrica(telefono);
        if (check.present) {
            console.log(`📇 Contatto già in rubrica (${telefono}) — salvataggio automatico saltato`);
            return;
        }
    }

    // 3) Salva direttamente in Google Contacts (saveContactToGoogle ritorna true/false e
    //    gestisce internamente cache, notifiche e il caso 409 "già esistente")
    console.log('🔵 [v2.5.58] Salvataggio automatico contatto:', { nome, cognome, telefono, societa: societaValue });
    const ok = await window.saveContactToGoogle({ nome, cognome, telefono, societa: societaValue });
    if (ok) {
        console.log('✅ [v2.5.58] Contatto salvato automaticamente in rubrica');
    } else {
        console.warn('⚠️ [v2.5.58] Salvataggio automatico non riuscito (vedi notifica)');
    }
}

// ===== RESET FORM =====
async function resetForm() {
    // 🔥 SALVA DATA SELEZIONATA PRIMA DEL RESET (v2.5.16)
    const selectDay = document.getElementById('selectDay');
    const selectedDate = selectDay ? selectDay.value : null;
    
    document.getElementById('nome').value = '';
    document.getElementById('cognome').value = '';
    document.getElementById('telefono').value = '';
    document.getElementById('orario').value = '15';

    // v2.5.46: nessun lead attivo dopo il reset → modalità videochiamata torna a "Link"
    if (window.setMeetModeToggle) window.setMeetModeToggle('LINK');

    await updatePreview();
    
    // 🔥 RIPOPOLA DROPDOWN LEAD SE C'ERA UNA DATA SELEZIONATA (v2.5.16)
    if (selectedDate && window.updateLeadSelectorByDate) {
        console.log('🔄 Ricarico dropdown lead per data:', selectedDate);
        await window.updateLeadSelectorByDate(selectedDate);
    }
    
    document.getElementById('nome').focus();
}

// ===== COPIA NEGLI APPUNTI =====
function copyToClipboard() {
    const messaggio = document.getElementById('outputMessaggio').textContent;
    
    navigator.clipboard.writeText(messaggio).then(() => {
        showNotification('Copiato negli appunti!', 'success');
    }).catch(() => {
        showNotification('Errore copia!', 'error');
    });
}

function copyIban() {
    const iban = document.getElementById('ibanField').value;
    
    navigator.clipboard.writeText(iban).then(() => {
        showNotification('IBAN copiato!', 'success');
    });
}

// ===== NOTIFICHE =====
function showNotification(text, type = 'success') {
    const notifica = document.getElementById('notifica');
    const notificaText = document.getElementById('notificaText');
    
    notificaText.textContent = text;
    notifica.classList.add('show');
    
    setTimeout(() => {
        notifica.classList.remove('show');
    }, 3000);
}

// ===== DOLCE PARANOIA =====
async function getDolceParanoiaLeads() {
    console.log('🔔 Calcolo lead Dolce Paranoia (v2.5.1 - nuova logica)...');
    
    if (!window.accessToken) {
        console.warn('⚠️ No accessToken per Dolce Paranoia');
        return [];
    }
    
    // 1. Carica cronologia da Drive (con fallback localStorage)
    let cronologia = [];
    if (window.DriveStorage) {
        try {
            const driveData = await window.DriveStorage.load(STORAGE_KEYS.CRONOLOGIA);
            if (driveData) {
                cronologia = driveData;
                console.log(`📦 Cronologia da Drive: ${cronologia.length} messaggi`);
            }
        } catch (e) {
            console.warn('⚠️ Drive fallito, uso fallback localStorage');
            // Fallback: localStorage
            const localData = localStorage.getItem(STORAGE_KEYS.CRONOLOGIA);
            if (localData) {
                cronologia = JSON.parse(localData);
                console.log(`💾 Cronologia da localStorage: ${cronologia.length} messaggi`);
            }
        }
    } else {
        // Nessun DriveStorage, uso localStorage
        const localData = localStorage.getItem(STORAGE_KEYS.CRONOLOGIA);
        if (localData) {
            cronologia = JSON.parse(localData);
            console.log(`💾 Cronologia da localStorage: ${cronologia.length} messaggi`);
        }
    }
    
    if (cronologia.length === 0) {
        console.log('⚠️ Nessuna cronologia messaggi - Invia almeno 1 "Primo Messaggio" per usare Dolce Paranoia');
        return [];
    }
    
    // 2. Carica eventi calendario
    const eventsJSON = localStorage.getItem('sgmess_calendar_events');
    const events = JSON.parse(eventsJSON || '[]');
    
    if (events.length === 0) {
        console.log('⚠️ Nessun evento calendario');
        return [];
    }
    
    const oggi = new Date();
    oggi.setHours(0, 0, 0, 0);
    
    const dolceParanoiaLeads = [];
    
    // 3. Per ogni evento futuro, controlla se serve promemoria
    events.forEach(event => {
        const dataAppuntamento = new Date(event.start);
        dataAppuntamento.setHours(0, 0, 0, 0);
        
        // Solo eventi futuri
        if (dataAppuntamento <= oggi) return;
        
        // Estrai info lead dall'evento
        const leadInfo = extractLeadFromEvent(event);
        if (!leadInfo.nome) return;
        
        // 🎯 CERCA IL PRIMO MESSAGGIO (tipo "primo_messaggio") inviato a questo lead
        const primoMessaggio = findPrimoMessaggio(leadInfo, cronologia);
        
        if (!primoMessaggio) {
            // Nessun primo messaggio trovato → skip
            console.log(`⏭️ Skip ${leadInfo.nome}: nessun primo messaggio trovato`);
            return;
        }
        
        // Calcola distanza: data_appuntamento - data_primo_messaggio
        const dataPrimoMsg = new Date(primoMessaggio.timestamp);
        dataPrimoMsg.setHours(0, 0, 0, 0);
        
        const diffTime = dataAppuntamento - dataPrimoMsg;
        const giorniDistanza = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        console.log(`📊 ${leadInfo.nome}: distanza fissazione = ${giorniDistanza} giorni`);
        
        // 🎯 REGOLA UNICA: distanza >= 2 giorni
        if (giorniDistanza >= 2) {
            dolceParanoiaLeads.push({
                event: event,
                nome: leadInfo.nome,
                cognome: leadInfo.cognome,
                telefono: leadInfo.telefono,
                dataAppuntamento: new Date(event.start), // Con ora
                giorniDistanza: giorniDistanza,
                dataPrimoMessaggio: primoMessaggio.timestamp
            });
        }
    });
    
    console.log(`✅ Trovati ${dolceParanoiaLeads.length} lead per Dolce Paranoia`);
    return dolceParanoiaLeads;
}

// Helper: trova il PRIMO messaggio (tipo "primo_messaggio") per un lead
function findPrimoMessaggio(leadInfo, cronologia) {
    // Filtra solo messaggi tipo "primo_messaggio"
    const messaggiPrimi = cronologia.filter(entry => 
        entry.tipoMessaggio === 'primo_messaggio' || !entry.tipoMessaggio // Retrocompat: se non ha tipo, assume primo
    );
    
    // Cerca match per telefono o nome+cognome
    const messaggiLead = messaggiPrimi.filter(entry => {
        const matchTelefono = entry.telefono && leadInfo.telefono && 
                             normalizePhone(entry.telefono) === normalizePhone(leadInfo.telefono);
        const matchNome = entry.nome === leadInfo.nome && 
                        (entry.cognome === leadInfo.cognome || !entry.cognome);
        return matchTelefono || matchNome;
    });
    
    if (messaggiLead.length === 0) return null;
    
    // Prendi il messaggio più VECCHIO (primo inviato)
    messaggiLead.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    return messaggiLead[0];
}

function extractLeadFromEvent(event) {
    const summary = event.summary || '';
    const description = event.description || '';
    
    // Estrai nome/cognome
    let nome = '', cognome = '';
    const nomeParts = summary.split(' ').filter(p => p && p !== 'X');
    if (nomeParts.length > 0) nome = nomeParts[0];
    if (nomeParts.length > 1) cognome = nomeParts.slice(1).join(' ');
    
    // Estrai telefono
    let telefono = '';
    const telMatch = description.match(/\+?\d[\d\s\-\(\)]{8,}/);
    if (telMatch) telefono = telMatch[0];
    
    return { nome, cognome, telefono };
}

function normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/[\s\-\(\)\+]/g, '');
}

async function renderDolceParanoiaList() {
    const container = document.getElementById('dolceParanoiaList');
    if (!container) return;
    
    if (!window.accessToken) {
        container.innerHTML = '<p class="placeholder-text">🔒 Fai login Google per vedere i promemoria</p>';
        return;
    }
    
    // Mostra loader
    container.innerHTML = '<p style="text-align:center;color:var(--gray-500);"><i class="fas fa-spinner fa-spin"></i> Calcolo lead...</p>';
    
    const leads = await getDolceParanoiaLeads();
    
    if (leads.length === 0) {
        container.innerHTML = `
            <div class="dp-empty">
                <p style="margin-bottom: 10px;">✅ Nessun promemoria necessario</p>
                <p style="font-size: 13px; color: #9ca3af;">
                    💡 Invia almeno 1 "Primo Messaggio" per vedere lead qui
                </p>
            </div>
        `;
        return;
    }
    
    let html = '<div style="margin-bottom: 10px; padding: 10px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px;">';
    html += '<strong style="color: #92400e; font-size: 14px;">🔔 ' + leads.length + ' promemoria da inviare</strong>';
    html += '</div>';
    
    leads.forEach((lead, index) => {
        const dataStr = lead.dataAppuntamento.toLocaleDateString('it-IT');
        const oraStr = lead.dataAppuntamento.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        
        html += `
            <div style="padding: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <strong style="font-size: 15px; color: var(--gray-900);">📱 ${lead.nome} ${lead.cognome || ''}</strong>
                        <div style="font-size: 13px; color: var(--gray-600); margin-top: 3px;">
                            📅 ${dataStr} ore ${oraStr}
                        </div>
                        <div style="font-size: 12px; color: #f59e0b; margin-top: 2px; font-weight: 600;">
                            📌 Fissato ${lead.giorniDistanza} ${lead.giorniDistanza === 1 ? 'giorno' : 'giorni'} fa
                        </div>
                    </div>
                    <button 
                        type="button" 
                        class="btn btn-primary" 
                        style="padding: 6px 12px; font-size: 13px;"
                        onclick="fillFormFromDolceParanoia(${index})">
                        Seleziona
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Salva leads in window per accesso da fillFormFromDolceParanoia
    window.currentDolceParanoiaLeads = leads;
}

window.fillFormFromDolceParanoia = function(index) {
    const leads = window.currentDolceParanoiaLeads;
    if (!leads || !leads[index]) return;
    
    const lead = leads[index];
    
    // Riempi form
    document.getElementById('nome').value = lead.nome;
    document.getElementById('cognome').value = lead.cognome || '';
    document.getElementById('telefono').value = lead.telefono || '';
    
    // Imposta tipo messaggio a Dolce Paranoia
    const tipoSelect = document.getElementById('tipoMessaggio');
    if (tipoSelect) {
        tipoSelect.value = 'dolce_paranoia';
    }
    
    // 🆕 Imposta giorno (YYYY-MM-DD format)
    const dataStr = lead.dataAppuntamento.toISOString().split('T')[0]; // YYYY-MM-DD
    document.getElementById('giorno').value = dataStr;
    
    // Imposta orario
    const oraStr = lead.dataAppuntamento.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('orario').value = oraStr;
    
    // Scroll to form
    document.getElementById('messageForm').scrollIntoView({ behavior: 'smooth' });
    
    // Update preview
    updatePreview();
    
    showNotification('📝 Form compilato con ' + lead.nome, 'success');
};

// ===== CRONOLOGIA =====
// v2.5.50: normalizza un telefono in sole cifre, formato internazionale, per wa.me.
// - rimuove spazi, +, e ogni carattere non numerico;
// - se è un numero italiano a 10 cifre senza prefisso, antepone 39.
function waDigitsFromPhone(telefono) {
    let d = (telefono || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10 && !d.startsWith('39')) d = '39' + d;
    return d;
}

async function saveToCronologia(nome, cognome, telefono, messaggio, servizio, societa, canale) {
    // canale (v2.5.45): 'whatsapp' = inviato su WhatsApp, 'generato' = generato/copiato. Default 'generato'.
    canale = canale || 'generato';

    // v2.5.50: STORAGE 100% CLOUD. La cronologia vive SOLO su Google Drive: niente
    // backup localStorage (l'unica cosa che resta in locale è il token Google).
    let cronologia = [];

    if (!(window.DriveStorage && window.accessToken)) {
        console.warn('⚠️ Non loggato Google: impossibile salvare la cronologia su cloud.');
        showNotification('⚠️ Fai login Google per salvare la cronologia (storage cloud).', 'warning');
        return;
    }

    try {
        const driveData = await window.DriveStorage.load(STORAGE_KEYS.CRONOLOGIA);
        if (Array.isArray(driveData)) {
            cronologia = driveData;
            console.log('📂 Caricati', cronologia.length, 'messaggi da Drive');
        }
    } catch (error) {
        console.error('❌ Errore lettura cronologia da Drive:', error);
    }

    // Aggiungi nuovo entry
    const tipoMessaggio = document.getElementById('tipoMessaggio').value;
    const waDigits = waDigitsFromPhone(telefono); // sole cifre, formato internazionale (es. 39333...)
    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        nome: nome,
        cognome: cognome,
        telefono: telefono,
        numeroInternazionale: waDigits ? '+' + waDigits : (telefono || ''), // +39…
        waLink: waDigits ? 'https://wa.me/' + waDigits : '',                 // link chat WhatsApp
        messaggio: messaggio,
        servizio: servizio || '',
        societa: societa || '',
        tipoMessaggio: tipoMessaggio || 'primo_messaggio'
    };

    cronologia.unshift(entry);

    // v2.5.45: report attività sul lead — traccia QUALE messaggio + COME (canale) + QUANDO (ts in logActivity).
    // Il testo del messaggio è troncato a 2000 caratteri per sicurezza.
    if (window.logActivity) window.logActivity('messaggio_inviato', {
        nome: nome,
        cognome: cognome,
        telefono: telefono,
        servizio: servizio || '',
        societa: societa || '',
        tipo: tipoMessaggio || '',
        canale: canale,
        messaggio: (messaggio || '').slice(0, 2000)
    });

    // Limite 1000 messaggi
    if (cronologia.length > 1000) {
        cronologia = cronologia.slice(0, 1000);
    }
    
    // v2.5.50: salvataggio SOLO su Google Drive (cloud). Append-only: scriviamo
    // l'intero array (storico esistente + nuova entry in testa), senza mai
    // sovrascrivere/alterare le entry già presenti.
    try {
        await window.DriveStorage.save(STORAGE_KEYS.CRONOLOGIA, cronologia);
        invalidateLeadDataCache(); // v2.5.76 PERF: nuova entry cronologia → la sezione Lead rilegge fresco
        console.log('✅ Cronologia salvata su Drive:', cronologia.length, 'messaggi');
    } catch (error) {
        console.error('❌ Errore salvataggio cronologia su Drive:', error);
        showNotification('⚠️ Impossibile salvare la cronologia su cloud (riprova).', 'warning');
    }
    
    // Marca lead come contattato
    // v2.5.42 FIX: AWAIT — il chiamante (generateMessage/sendToWhatsApp) ora aspetta
    // questa catena PRIMA di resetForm, così la selezione del lead è ancora valida.
    await markLeadAsContactedFromCalendar(nome, cognome, telefono);
}

// ===== MARCA LEAD DA CALENDARIO COME CONTATTATO =====
async function markLeadAsContactedFromCalendar(nome, cognome, telefono) {
    const selectLead = document.getElementById('selectLead');
    if (!selectLead) return;
    
    const selectedOption = selectLead.options[selectLead.selectedIndex];
    
    if (selectedOption && selectedOption.dataset.eventId) {
        const eventData = JSON.parse(selectedOption.dataset.eventData || '{}');
        const eventId = selectedOption.dataset.eventId;
        const eventDate = eventData.start || new Date().toISOString();
        // v2.5.58: orario di CREAZIONE dell'evento (prenotazione), persistito nel record lead.
        const eventCreated = eventData.created || null;
        // v2.5.42 FIX: usa il vero calendario dell'evento (gli eventi SG NON sono su 'primary').
        const calendarId = eventData.calendarId || 'primary';

        // 🔥 Salva su Google Drive invece di localStorage
        if (window.markLeadAsContacted) {
            await window.markLeadAsContacted(eventId, nome, cognome, telefono, eventDate, calendarId, eventCreated);
        }
        
        console.log('✅ Lead marcato come contattato su Drive:', nome);
        
        // Aggiorna la lista lead dopo aver marcato come contattato
        // FIX v2.5.39: usa updateLeadSelectorByDate (come tutto il resto del codice).
        // selectDay.value è in formato ISO (es. "2026-06-14"); la vecchia updateLeadSelector
        // si aspettava la data formattata all'italiana e non trovava mai gli eventi
        // -> tendina svuotata e lead "sparito" finché non si faceva login/logout.
        const selectDay = document.getElementById('selectDay');
        if (selectDay && selectDay.value && window.updateLeadSelectorByDate) {
            await window.updateLeadSelectorByDate(selectDay.value);
        }
    }
}

// v2.5.50: cache in memoria della cronologia caricata da Drive (per non rifare la
// fetch ad ogni cambio data). Lo storage persistente resta 100% su cloud.
let cronologiaCache = [];
let cronologiaWired = false;

// Chiave data locale YYYY-MM-DD (per confronto col date picker, che è in ora locale).
function localDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

async function loadCronologia() {
    const listContainer = document.getElementById('cronologiaList');
    const dateInput = document.getElementById('cronologiaDate');
    if (!listContainer) return;

    // Default date picker = oggi
    if (dateInput && !dateInput.value) {
        dateInput.value = localDateKey(new Date());
    }

    // Aggancia (una sola volta) i listener del selettore data
    if (!cronologiaWired && dateInput) {
        dateInput.addEventListener('change', renderCronologia);
        const todayBtn = document.getElementById('cronologiaTodayBtn');
        if (todayBtn) {
            todayBtn.addEventListener('click', () => {
                dateInput.value = localDateKey(new Date());
                renderCronologia();
            });
        }
        cronologiaWired = true;
    }

    if (!window.accessToken) {
        cronologiaCache = [];
        listContainer.innerHTML = '<p class="placeholder-text">⚠️ Fai login Google per vedere la cronologia (i messaggi sono salvati su cloud).</p>';
        return;
    }

    // Carica SOLO da Drive (storage cloud)
    listContainer.innerHTML = '<p class="placeholder-text">Caricamento…</p>';
    cronologiaCache = [];
    if (window.DriveStorage) {
        try {
            const driveData = await window.DriveStorage.load(STORAGE_KEYS.CRONOLOGIA);
            if (Array.isArray(driveData)) {
                cronologiaCache = driveData;
                console.log('✅ Cronologia caricata da Drive:', cronologiaCache.length, 'messaggi');
            }
        } catch (error) {
            console.error('❌ Errore caricamento cronologia:', error);
        }
    }

    renderCronologia();
}

// v2.5.50: mostra le entry della data selezionata, dalla più recente alla più vecchia.
function renderCronologia() {
    const listContainer = document.getElementById('cronologiaList');
    const dateInput = document.getElementById('cronologiaDate');
    if (!listContainer) return;

    const selected = (dateInput && dateInput.value) ? dateInput.value : localDateKey(new Date());

    const entries = cronologiaCache
        .filter(e => e && e.timestamp && localDateKey(new Date(e.timestamp)) === selected)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (entries.length === 0) {
        listContainer.innerHTML = '<p class="placeholder-text">Nessun messaggio inviato in questa data.</p>';
        return;
    }

    let html = '';
    entries.forEach(entry => {
        const date = new Date(entry.timestamp);
        const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const nomeCompleto = `${entry.nome || ''} ${entry.cognome || ''}`.trim() || 'Senza nome';

        // Retro-compatibilità: le entry vecchie non hanno numeroInternazionale/waLink → li ricavo al volo.
        const waDigits = (entry.waLink ? entry.waLink.replace(/\D/g, '') : '') || waDigitsFromPhone(entry.telefono);
        const numeroVis = entry.numeroInternazionale || (waDigits ? '+' + waDigits : (entry.telefono || '—'));
        const waLink = entry.waLink || (waDigits ? 'https://wa.me/' + waDigits : '');

        const linkHtml = waLink
            ? `<a href="${waLink}" target="_blank" rel="noopener" class="cronologia-wa-link"><i class="fab fa-whatsapp"></i> Apri chat</a>`
            : '<span class="cronologia-wa-missing">numero assente</span>';

        const tipoBadge = entry.tipoMessaggio === 'memo_giorno'
            ? '<span class="cronologia-badge cronologia-badge-memo">📝 Memo</span>'
            : '<span class="cronologia-badge cronologia-badge-primo">💬 Primo Msg</span>';

        html += `
            <div class="cronologia-item">
                <div class="cronologia-header">
                    <strong>${timeStr} · ${nomeCompleto}</strong>${tipoBadge}
                    <span class="cronologia-numero">${numeroVis}</span>
                </div>
                <div class="cronologia-actions">${linkHtml}</div>
                <div class="cronologia-message">${(entry.messaggio || '').replace(/\n/g, '<br>')}</div>
            </div>
        `;
    });

    listContainer.innerHTML = html;
}

// ===== FUNNEL CONFERMA LEAD (checklist 5 step dentro ogni card lead) — v2.5.55 =====
// Le 5 righe-azione mostrate in ogni card lead. Gli orari sono calcolati da T0 (NON
// cumulativi): T0 = orario di INIZIO dell'evento Google Calendar con titolo "LEAD - Call"
// agganciato a quel lead. La riga "noshow" non ha orario (azione di fallback).
// v2.5.73: gli offsetH sono ore dallo STAMP DI CREAZIONE dell'evento su Calendar (event.created,
// = ingresso reale del lead), NON dall'orario appuntamento (start evento, sempre "tondo").
const LEAD_CHECKLIST_STEPS = [
    { key: 'ingresso',    label: 'Ingresso lead',           offsetH: 0,    defaultChecked: true }, // creazione evento, spuntata di default
    { key: 'scrivere',    label: 'Scrivere al lead',         offsetH: 2 },                          // creazione + 2h
    { key: 'sollecitare', label: 'Sollecitare il lead',      offsetH: 4 },                          // creazione + 4h
    { key: 'chiamata',    label: 'Sollecitare via chiamata', offsetH: 6 },                          // creazione + 6h
    { key: 'noshow',      label: 'Inviare a Gruppo NoShow',  offsetH: null }                        // solo checkbox
];

// Stato checkbox per lead, caricato da Drive in loadLeadSection. { "<leadKey>": { ingresso:true, ... } }
// NB: il render NON scrive mai in cloud (come da pattern v2.5.54): si salva solo su azione utente.
let leadChecklistState = {};

// v2.5.69: STATO conferma a 3 valori, SCOPED ALL'APPUNTAMENTO. Forma:
//   { "<leadKey>": { status: "confermato"|"pending"|"no", forCreatedISO: "<createdISO>" } }
// REGOLA (decisa con Dante): OGNI lead/appuntamento che entra parte SEMPRE da "pending". La scelta
// manuale (confermato/no) vale SOLO per l'appuntamento per cui è stata fatta (identificato dal
// createdISO dell'evento). Se lo stesso lead ri-fissa un nuovo appuntamento (createdISO diverso),
// lo stato torna a "pending" → riparte un funnel di conferma fresco per quel nuovo appuntamento.
// La non-retroattività (niente mail sui vecchi) NON è più gestita qui col default "no": la
// garantisce SOLO il cutoff lato Apps Script (eventi creati prima del cutoff non mandano mail).
// Funnel ATTIVO solo su "pending"; "confermato" e "no" lo congelano. (v2.5.67: era un default
// basato sul cutoff; v2.5.68: solo wiring foglio.)
// Forma LEGACY tollerata in lettura: valore stringa "confermato"|"pending"|"no" (v2.5.67) =
// stato non-scoped, applicato così com'è finché l'utente non riclicca.
let leadStatusState = {};

// v2.5.67: i 3 stati ammessi (ordine UI: positivo → neutro → negativo).
const LEAD_STATUSES = ['confermato', 'pending', 'no'];

// v2.5.67: ISO di creazione dell'evento agganciato a un lead (≈ ingresso reale). '' se non risolvibile.
function getLeadCreatedISO(lead) {
    try {
        const res = resolveLeadT0(lead, leadSectionCandidates, leadBindings[lead._key]);
        return (res && res.createdAt) ? res.createdAt.toISOString() : '';
    } catch (e) { return ''; }
}

// v2.5.69: stato EFFETTIVO di un lead per l'APPUNTAMENTO corrente.
//   - scelta manuale (oggetto) valida SOLO se per lo stesso createdISO corrente → vince;
//   - se l'appuntamento è cambiato (createdISO diverso) → "pending" (funnel fresco);
//   - se il lead non ha un evento risolvibile (createdISO vuoto) → la scelta manuale, se c'è, si
//     onora comunque (non c'è un appuntamento a cui ancorarla);
//   - forma stringa legacy (v2.5.67) → applicata così com'è;
//   - assente → "pending" (tutti entrano pending).
function getLeadStatus(lead) {
    const stored = leadStatusState[lead._key];
    if (typeof stored === 'string') return LEAD_STATUSES.includes(stored) ? stored : 'pending';
    if (stored && typeof stored === 'object' && LEAD_STATUSES.includes(stored.status)) {
        const cur = getLeadCreatedISO(lead);
        if (!cur) return stored.status;                       // niente appuntamento → onoro la scelta
        return (stored.forCreatedISO === cur) ? stored.status : 'pending'; // appuntamento cambiato → fresco
    }
    return 'pending';
}

// v2.5.67: il funnel è CONGELATO per tutti gli stati tranne "pending".
function isLeadFunnelFrozen(status) {
    return status !== 'pending';
}

// v2.5.61: timestamp CONGELATO della PRIMA volta che uno step funnel è stato spuntato.
// { "<leadKey>": { "<step>": "ISO" } }. Mai sovrascritto, mai cancellato (resta anche se lo step
// torna a false): al ri-spunto si riusa l'originale. leadChecklistState NON cambia forma (zero
// migrazione) — i tempi vivono in questo file affiancato (LEAD_CHECKLIST_TIMES), che parte vuoto.
let leadChecklistTimes = {};

// v2.5.67: filtro della sezione Lead. 'all' | 'pending' | 'confermato' | 'no'. Solo in memoria,
// NON persistito su Drive.
// v2.5.73: DEFAULT = 'pending'. La vista parte coi soli lead pending in chiaro; confermati e "no"
// finiscono in un blocco <details> collassato ("Archivio") sotto la lista. Gli altri filtri
// (all/confermato/no) restano liste piatte come prima.
let leadFilterMode = 'pending';

// v2.5.57: agganci manuali lead↔evento "LEAD - Call", caricati da Drive in loadLeadSection.
//   { "<leadKey>": { eventId?, manualT0?, dismissed?: [eventId...] } }
// - eventId   = evento confermato a mano (vince sull'automatico)
// - manualT0  = orario impostato a mano (vince su tutto), stringa datetime-local
// - dismissed = proposte rifiutate ("Non è lei"), da non riproporre
let leadBindings = {};

// Dati della sezione Lead tenuti in memoria, così il re-render (dopo una scelta utente)
// NON deve riscaricare nulla da Drive.
let leadSectionLeads = [];
let leadSectionCandidates = [];
// v2.5.76 PERF: cache TTL in memoria dei dati Lead caricati da Drive. Riaprendo la sezione entro
// LEAD_DATA_TTL_MS si riusano i dati già in RAM (niente 7 round-trip a Drive). leadDataCacheAt =
// timestamp dell'ultimo load completo riuscito; messo a 0 (invalidato) da OGNI save di dati lead
// (checklist/times/stato/agganci/codici/cronologia), così dopo una modifica il render rilegge fresco.
const LEAD_DATA_TTL_MS = 90000; // 90s — safe perché ogni save invalida la cache
let leadDataCacheAt = 0;
function invalidateLeadDataCache() { leadDataCacheAt = 0; }
// v2.5.64: codici ID lead (cloud). leadCodes = { "<_key>": "L0001" }; leadCodeCounter = ultimo intero assegnato.
let leadCodes = {};
let leadCodeCounter = 0;

// Telefono → sole cifre significative (ultime 9, ovvero il numero senza prefisso 39/0039).
// Serve SOLO a fare il match card-lead ↔ evento "LEAD - Call" in modo robusto al prefisso.
function leadPhone9(telefono) {
    const digits = (telefono || '').replace(/\D/g, '');
    return digits.length >= 9 ? digits.slice(-9) : '';
}

// v2.5.64: chiave identità lead CONDIVISA. DEVE restare identica alla derivazione storica usata
// in loadLeadSection (raggruppamento cronologia) e in checklist/bindings/confirmed, altrimenti il
// codice ID non si ritrova mai. tel:<solo cifre> se c'è telefono, altrimenti nome:<nome|cognome>.
// Usata anche da google-calendar.js (markLeadAsContacted / ensureEventTitleCorrect) via window.
function leadIdentityKey(telefono, nome, cognome) {
    const telDigits = (telefono || '').replace(/\D/g, '');
    return telDigits
        ? 'tel:' + telDigits
        : 'nome:' + ((nome || '') + '|' + (cognome || '')).toLowerCase().trim();
}
window.leadIdentityKey = leadIdentityKey;

// v2.5.64: codice ID lead alfanumerico stabile. L + numero zero-padded a 4 cifre (L0001…); oltre
// 9999 cresce senza pad (L10000). Un codice, una volta assegnato a una _key, NON cambia/riusa mai.
function formatLeadCode(n) {
    return 'L' + String(n).padStart(4, '0');
}
window.formatLeadCode = formatLeadCode;

// v2.5.59: telefono lead → forma leggibile con prefisso internazionale, es.
//   393394865982 → "+39 339 486 5982". Normalizza prima a sole cifre e toglie il 39/0039
//   iniziale SOLO se è davvero un prefisso (numero più lungo di un nazionale a 10 cifre),
//   così non duplica il +39 e non "mangia" un prefisso mobile 39x già nazionale.
function formatLeadPhoneDisplay(telefono) {
    let digits = (telefono || '').replace(/\D/g, '');
    if (!digits) return telefono || '—';
    if (digits.startsWith('0039')) digits = digits.slice(4);
    else if (digits.startsWith('39') && digits.length > 10) digits = digits.slice(2);
    // raggruppa il nazionale 3-3-resto (es. "339 486 5982"); se non combacia, lascia intero
    const grouped = digits.replace(/^(\d{3})(\d{3})(\d+)$/, '$1 $2 $3');
    return '+39 ' + grouped;
}

// Normalizza un nome per il confronto: minuscolo, senza accenti, solo lettere e spazi,
// spazi compattati. Rende il match robusto a maiuscole/minuscole, accenti e punteggiatura.
function normalizeName(str) {
    return (str || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // via accenti (è→e, ò→o…)
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')                          // via cifre/punteggiatura/emoji
        .replace(/\s+/g, ' ')
        .trim();
}

// Distanza di Levenshtein (n. minimo di inserimenti/cancellazioni/sostituzioni). Tollera i refusi.
function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    let cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
        cur[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, cur] = [cur, prev];
    }
    return prev[n];
}

// Refusi ammessi in base alla lunghezza del nome: nomi corti = nessuna tolleranza
// (troppo rischio di falsi positivi), nomi lunghi = fino a 2 modifiche.
function nameTypoTolerance(len) {
    if (len <= 4) return 0;
    if (len <= 8) return 1;
    return 2;
}

// v2.5.72: un evento appartiene al funnel-lead se sta in un calendario "LEAD - Call" o "FOLLOWUP"
// (match sul NOME del calendario, tollerante alle varianti follow up/follow-up) oppure se è titolato
// esattamente "lead - call" (convenzione legacy sul titolo). Solo questi due calendari hanno lead.
function isLeadFunnelEvent(event) {
    if (!event) return false;
    const cal = (event.calendarName || '').toLowerCase();
    const title = (event.summary || '').trim().toLowerCase();
    const inLeadCal =
        cal.includes('lead - call') ||
        cal.includes('followup') || cal.includes('follow up') || cal.includes('follow-up');
    return inLeadCal || title === 'lead - call';
}

// Costruisce la lista dei candidati dagli eventi del funnel-lead ("LEAD - Call"/"FOLLOWUP") già
// sincronizzati in localStorage (sgmess_calendar_events, popolato da syncCalendarEvents). Il match
// (vedi isLeadFunnelEvent) regge SIA sul TITOLO evento SIA sul NOME del CALENDARIO, qualunque sia la
// convenzione usata su Google Calendar. Per ogni candidato salviamo telefono (raw +39… e ultime 9
// cifre, dalla descrizione → NON cambia rinominando l'evento), nome/cognome + nome normalizzato e T0
// (inizio). Riusa gli helper esistenti (extractPhoneFromEvent / extractNameFromEvent /
// parseNameSurname). Eventi all-day scartati: niente orario → niente T0.
function buildLeadCallIndex() {
    const candidates = [];
    let events = [];
    try {
        events = JSON.parse(localStorage.getItem('sgmess_calendar_events') || '[]');
    } catch (e) {
        console.warn('⚠️ [Lead] Eventi calendario illeggibili da localStorage:', e);
        return { candidates };
    }

    events.forEach(event => {
        if (!event) return;
        // v2.5.72: il funnel-lead vive nei calendari "LEAD - Call" E "FOLLOWUP" (prima solo LEAD - Call).
        if (!isLeadFunnelEvent(event)) return;

        // T0 = orario di INIZIO. Serve un orario reale: scarta gli all-day (start senza 'T').
        const startStr = event.start || '';
        if (!String(startStr).includes('T')) return;
        const t0 = new Date(startStr);
        if (isNaN(t0.getTime())) return;

        const phoneRaw = extractPhoneFromEvent(event);   // v2.5.72: +39… (serve a materializzare la scheda)
        const phone9 = leadPhone9(phoneRaw);
        const displayName = extractNameFromEvent(event);
        const parsed = parseNameSurname(displayName);
        const nameNorm = normalizeName(parsed.firstName + ' ' + parsed.lastName);
        const nameDisplay = (displayName && displayName !== 'Senza nome') ? displayName : (event.summary || 'Evento');

        // v2.5.63: created = STAMP DI CREAZIONE dell'evento (≈ quando Google Calendar ha
        // rilevato il nuovo "LEAD - Call", cioè l'ingresso reale del lead). Persistito da
        // v2.5.58. Diverso da t0 (orario appuntamento). Può mancare → null.
        const created = event.created ? new Date(event.created) : null;
        const createdValid = (created && !isNaN(created.getTime())) ? created : null;

        // v2.5.72: phoneRaw + firstName/lastName servono a buildCalendarLeads per creare la scheda del
        // lead anche prima del primo messaggio (identità con la stessa leadIdentityKey della cronologia).
        candidates.push({
            id: event.id || '', phone9, phoneRaw,
            firstName: parsed.firstName || '', lastName: parsed.lastName || '',
            nameNorm, nameDisplay, t0, created: createdValid
        });
    });

    return { candidates };
}

// v2.5.72: dai candidati-evento ("LEAD - Call"/"FOLLOWUP") deriva l'anagrafica dei lead da
// MATERIALIZZARE come scheda anche senza messaggi. Dedup per leadIdentityKey (LA STESSA chiave della
// cronologia → niente doppioni col lead poi messaggiato). A parità di chiave tiene l'anagrafica
// dell'evento col T0 più recente (l'appuntamento "attuale"). Ritorna [{ _key, nome, cognome, telefono }].
function buildCalendarLeads(candidates) {
    const byKey = {};
    (candidates || []).forEach(c => {
        const key = leadIdentityKey(c.phoneRaw, c.firstName, c.lastName);
        if (!key || key === 'nome:|') return; // né telefono né nome → nessuna identità, scarto
        const prev = byKey[key];
        if (!prev || (c.t0 && (!prev._t0 || c.t0 > prev._t0))) {
            byKey[key] = {
                _key: key,
                nome: c.firstName || '',
                cognome: c.lastName || '',
                telefono: c.phoneRaw || '',
                _t0: c.t0 || null
            };
        }
    });
    return Object.values(byKey).map(({ _t0, ...lead }) => lead);
}

// T0 AUTOMATICO per un lead. Dal più sicuro al più tollerante:
//   1) TELEFONO (ultime 9 cifre) — univoco e stabile (dalla descrizione, non cambia rinominando).
//   2) NOME normalizzato IDENTICO (ignora maiuscole/accenti/punteggiatura).
//   3) NOME simile entro la soglia refusi, SOLO se non ambiguo (un solo nome ai minimi e
//      nettamente più vicino del successivo) → evita di agganciare il lead sbagliato.
// A parità di candidato vince il T0 più recente. Restituisce { t0, created } del candidato
// vincente, oppure null. (v2.5.63: prima tornava solo la Date t0; ora propaga anche il
// created dell'evento agganciato, così il render può datare l'"ingresso" con lo stamp di
// creazione invece dell'orario appuntamento.)
function findLeadT0Auto(lead, candidates) {
    const cands = candidates || [];
    const phone9 = leadPhone9(lead.telefono);
    const leadName = normalizeName((lead.nome || '') + ' ' + (lead.cognome || ''));
    // v2.5.63: tiene il CANDIDATO col T0 più recente (non più solo la Date), così resta
    // disponibile il suo .created. Parità invariata: a T0 uguale vince il primo incontrato.
    const latestCand = (acc, c) => (!acc || c.t0 > acc.t0) ? c : acc;
    const pack = (c) => c ? { t0: c.t0, created: c.created || null } : null;

    // 1) Telefono
    if (phone9) {
        let best = null;
        cands.forEach(c => { if (c.phone9 && c.phone9 === phone9) best = latestCand(best, c); });
        if (best) return pack(best);
    }

    if (!leadName) return null;

    // 2) Nome identico (normalizzato)
    {
        let best = null;
        cands.forEach(c => { if (c.nameNorm && c.nameNorm === leadName) best = latestCand(best, c); });
        if (best) return pack(best);
    }

    // 3) Nome simile (refusi), solo se non ambiguo
    const tol = nameTypoTolerance(leadName.length);
    if (tol > 0) {
        const scored = cands
            .filter(c => c.nameNorm)
            .map(c => ({ d: levenshtein(leadName, c.nameNorm), c }))
            .sort((a, b) => a.d - b.d);
        if (scored.length && scored[0].d <= tol) {
            const minD = scored[0].d;
            const atMin = scored.filter(s => s.d === minD);
            const distinctNames = new Set(atMin.map(s => s.c.nameNorm));
            const next = scored.find(s => s.d > minD);
            const margin = next ? next.d - minD : Infinity;
            // un solo nome ai minimi (stessa persona, eventuali più eventi) e gap ≥1 sul prossimo nome diverso
            if (distinctNames.size === 1 && margin >= 1) {
                return pack(atMin.reduce((acc, s) => latestCand(acc, s.c), null));
            }
        }
    }

    return null;
}

// Migliore PROPOSTA per un lead quando l'automatico non aggancia (caso incerto): il
// candidato col nome più vicino entro una soglia un filo più larga dell'auto (tol+1),
// escludendo quelli già rifiutati ("dismissed"). A parità vince il T0 più recente.
// Ritorna { id, label, t0 } oppure null.
function bestLeadSuggestion(lead, candidates, dismissed) {
    const leadName = normalizeName((lead.nome || '') + ' ' + (lead.cognome || ''));
    if (!leadName) return null;
    const skip = new Set(dismissed || []);
    const suggTol = nameTypoTolerance(leadName.length) + 1; // un po' più tollerante dell'auto
    let best = null, bestDist = Infinity;
    (candidates || []).forEach(c => {
        if (!c.nameNorm || (c.id && skip.has(c.id))) return;
        const d = levenshtein(leadName, c.nameNorm);
        if (d > suggTol) return;
        if (d < bestDist || (d === bestDist && best && c.t0 > best.t0)) { bestDist = d; best = c; }
    });
    if (!best) return null;
    // v2.5.63: porto anche created (stamp creazione) per datare l'ingresso in caso 'suggest'.
    return { id: best.id, label: `${best.nameDisplay} · ${fmtLeadEventWhen(best.t0)}`, t0: best.t0, created: best.created || null };
}

// Risolve il T0 di un lead tenendo conto degli agganci manuali e delle proposte.
// Ritorna { status, t0, createdAt, suggestion }:
//   'manual'  = orario impostato a mano    | 'bound' = agganciato a mano a un evento
//   'auto'    = match automatico            | 'suggest' = proposta da confermare
//   'none'    = nessun aggancio possibile
//   t0        = orario APPUNTAMENTO (start evento / orario a mano) — invariato.
//   createdAt = v2.5.63: STAMP DI CREAZIONE dell'evento agganciato (≈ ingresso lead). null
//               per 'manual' (orario a mano non ha un evento) e 'none'.
// NB: NON scrive mai (il render non tocca il cloud). Gli agganci "stale" sono solo ignorati.
function resolveLeadT0(lead, candidates, binding) {
    binding = binding || {};
    if (binding.manualT0) {
        const d = new Date(binding.manualT0);
        if (!isNaN(d.getTime())) return { status: 'manual', t0: d, createdAt: null, suggestion: null };
    }
    if (binding.eventId) {
        const c = (candidates || []).find(x => x.id === binding.eventId);
        if (c) return { status: 'bound', t0: c.t0, createdAt: c.created || null, suggestion: null };
        // evento sparito da Calendar: ignoro l'aggancio e proseguo
    }
    const auto = findLeadT0Auto(lead, candidates);
    if (auto) return { status: 'auto', t0: auto.t0, createdAt: auto.created || null, suggestion: null };
    const sugg = bestLeadSuggestion(lead, candidates, binding.dismissed);
    if (sugg) return { status: 'suggest', t0: null, createdAt: sugg.created || null, suggestion: sugg };
    return { status: 'none', t0: null, createdAt: null, suggestion: null };
}

// "gg/mm hh:mm" per mostrare quando cade un evento.
function fmtLeadEventWhen(t0) {
    if (!t0) return '';
    return t0.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

// Escape minimale per testo dinamico (nomi) dentro HTML/attributi.
function escLeadHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// v2.5.73: hh:mm (24h) di `base` + offsetH ore. `base` = STAMP DI CREAZIONE evento (event.created),
// NON l'orario appuntamento. '' se non c'è base (es. lead manuale/none) → la card mostra '—'.
function leadStepTime(base, offsetH) {
    if (!base || offsetH === null) return '';
    const d = new Date(base.getTime() + offsetH * 3600 * 1000);
    return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// v2.5.59: destinatario fisso del bottone "Gruppo NoShow".
const NOSHOW_WA_NUMBER = '393755588371';

// v2.5.59: href WhatsApp per inoltrare il lead al "Gruppo NoShow". Il testo contiene SOLO
// i valori, uno per riga, senza etichette:
//   nome cognome lead / data e ora appuntamento / telefono lead / nome assistente / primo
//   nome account Google. Stesse fonti già usate in card e messaggi. encodeURIComponent sul testo.
function buildNoShowWaHref(lead, t0) {
    const nomeCognome = (`${lead.nome || ''} ${lead.cognome || ''}`).trim();
    const appuntamento = t0 ? fmtLeadEventWhen(t0) : '';
    const telefono = lead.telefono ? formatLeadPhoneDisplay(lead.telefono) : '';
    // nome assistente: stessa fonte dei messaggi ({OPERATORE} = elemento #operatoreName)
    const assistente = (document.getElementById('operatoreName')?.textContent || '').trim();
    // primo nome dell'account Google loggato (es. "Dante Davide" → "Dante")
    const googleName = (window.userProfileData && window.userProfileData()?.name)
        || localStorage.getItem('sgmess_operator_name') || '';
    const googleFirst = (googleName.split(' ')[0] || '').trim();
    const testo = [nomeCognome, appuntamento, telefono, assistente, googleFirst].join('\n');
    return `https://wa.me/${NOSHOW_WA_NUMBER}?text=${encodeURIComponent(testo)}`;
}

// HTML del blocco checklist per una singola card lead. `resolution` = output di resolveLeadT0.
// v2.5.67: `leadStatus` = stato conferma a 3 valori (confermato|pending|no), già calcolato dal chiamante.
function renderLeadChecklist(lead, resolution, leadStatus) {
    const leadKey = lead._key;
    const state = leadChecklistState[leadKey] || {};
    const keyAttr = encodeURIComponent(leadKey); // sicuro come valore di data-attribute
    const t0 = resolution.t0; // orario APPUNTAMENTO (start evento) — usato solo per il msg NoShow
    const status = resolution.status;

    // v2.5.73: BASE degli orari del funnel = STAMP DI CREAZIONE evento su Calendar (event.created,
    // = ingresso reale del lead). NON è l'orario appuntamento (t0, che è sempre "tondo"). Se manca
    // (lead 'manual'/'none' → createdAt null) gli step mostrano '—', che è corretto: senza evento
    // non c'è un T0 reale da cui far partire il funnel.
    const funnelBase = resolution.createdAt;

    // v2.5.67: funnel congelato per tutti gli stati tranne "pending" (Confermato e No lo chiudono).
    // Gli step successivi all'ingresso restano visibili ma disabilitati.
    const frozenFunnel = isLeadFunnelFrozen(leadStatus);

    // v2.5.59: messaggio precompilato per il bottone WhatsApp della riga "noshow"
    const noshowWaHref = buildNoShowWaHref(lead, t0);

    // Righe del funnel (orari dallo stamp di creazione evento; "—" se non c'è creazione)
    let rows = '';
    LEAD_CHECKLIST_STEPS.forEach(step => {
        const checked = (state[step.key] !== undefined) ? state[step.key] : (step.defaultChecked || false);
        // v2.5.71: a funnel congelato (Confermato/No) TUTTI gli step diventano read-only in modo
        // COERENTE. Prima c'era l'eccezione "ingresso" (frozenFunnel && step.key !== 'ingresso'):
        // l'ingresso restava blu/cliccabile mentre gli altri completati si ingrigivano → incoerenza
        // visiva (un quadratino blu, gli altri grigi). Ora tutti gli step completati restano blu
        // (spunta bianca su blu), i non completati restano neutri/vuoti. Read-only via classe
        // .lead-funnel-frozen (CSS pointer-events:none) + tabindex -1: NON uso più `disabled`, che
        // ingrigisce la checkbox e ne uccide l'accent-color blu. Guardia anche lato JS in
        // toggleLeadChecklistStep, così il blocco regge a prescindere dal CSS.
        const frozen = frozenFunnel;
        let timeHtml = '';
        if (step.offsetH !== null) {
            const t = leadStepTime(funnelBase, step.offsetH); // v2.5.73: base = creazione evento, non appuntamento
            timeHtml = `<span class="lc-time">${t || '—'}</span>`;
        }
        const rowHtml = `
                    <label class="lead-check-row${checked ? ' done' : ''}${frozen ? ' lead-funnel-frozen' : ''}">
                        <input type="checkbox" data-lead-key="${keyAttr}" data-step="${step.key}"${checked ? ' checked' : ''}${frozen ? ' tabindex="-1"' : ''}>
                        <span class="lc-label">${step.label}</span>
                        ${timeHtml}
                    </label>`;
        // v2.5.59: sulla riga "noshow" affianco un bottone WhatsApp verso il Gruppo NoShow.
        // È un <a> FUORI dalla <label> (sibling) così il click non spunta la casella.
        // v2.5.67: a funnel congelato (≠ pending) il bottone NoShow è nascosto (azione non più necessaria).
        if (step.key === 'noshow') {
            const waBtn = frozenFunnel ? '' : `<a class="lead-wa-btn lead-noshow-wa" href="${noshowWaHref}" target="_blank" rel="noopener" title="Inoltra al Gruppo NoShow"><i class="fab fa-whatsapp"></i></a>`;
            rows += `
                    <div class="lead-check-noshow">
                        ${rowHtml}
                        ${waBtn}
                    </div>`;
        } else {
            rows += rowHtml;
        }
    });

    // Etichetta di stato accanto al titolo
    // v2.5.67: a funnel congelato il tag dello stato (Confermato verde / No grigio) sostituisce gli altri.
    let tag = '';
    if (leadStatus === 'confermato') tag = `<span class="lead-checklist-tag lead-tag-confirmed" title="Appuntamento confermato — funnel congelato">✅ Appuntamento confermato</span>`;
    else if (leadStatus === 'no') tag = `<span class="lead-checklist-tag lead-tag-no" title="Lead non confermato — funnel chiuso, niente mail">✖️ Non confermato</span>`;
    else if (status === 'manual') tag = `<span class="lead-checklist-tag" title="Orario impostato a mano">📌 manuale</span>`;
    else if (status === 'bound') tag = `<span class="lead-checklist-tag" title="Agganciato a mano a un evento">📌 agganciato</span>`;
    else if (status === 'none') tag = `<span class="lead-checklist-hint" title="Nessun evento 'LEAD - Call' agganciato a questo lead">T0 n/d</span>`;

    // Banner di proposta (caso incerto): chiede conferma all'utente
    // v2.5.67: soppresso a funnel congelato (non ha senso proporre agganci su un funnel chiuso).
    let banner = '';
    if (!frozenFunnel && status === 'suggest' && resolution.suggestion) {
        const s = resolution.suggestion;
        const idAttr = encodeURIComponent(s.id || '');
        banner = `
                    <div class="lead-suggest">
                        <span class="lead-suggest-q">⚠️ Forse è questo: <strong>${escLeadHtml(s.label)}</strong></span>
                        <span class="lead-suggest-actions">
                            <button type="button" class="lead-btn lead-btn-yes" data-lead-action="confirm" data-lead-key="${keyAttr}" data-event-id="${idAttr}">È lei ✓</button>
                            <button type="button" class="lead-btn lead-btn-no" data-lead-action="reject" data-lead-key="${keyAttr}" data-event-id="${idAttr}">Non è lei ✗</button>
                        </span>
                    </div>`;
    }

    // Link "ricontrollo manuale" sempre presente (anche sui match automatici)
    const changeLabel = (status === 'none') ? 'scegli evento' : 'evento sbagliato? cambia';
    const changeLink = `<button type="button" class="lead-change-link" data-lead-action="open-picker" data-lead-key="${keyAttr}">${changeLabel}</button>`;

    return `
                <div class="lead-checklist">
                    <div class="lead-checklist-title">
                        <span><i class="fas fa-list-check"></i> Funnel conferma ${tag}</span>
                        ${changeLink}
                    </div>
                    ${banner}
                    ${rows}
                    ${renderLeadPicker(leadKey, keyAttr)}
                </div>`;
}

// Pannello (nascosto) per agganciare il lead a un evento "LEAD - Call" o impostare il T0 a mano.
function renderLeadPicker(leadKey, keyAttr) {
    const binding = leadBindings[leadKey] || {};
    const hasBinding = !!(binding.eventId || binding.manualT0);
    const opts = (leadSectionCandidates || [])
        .slice()
        .sort((a, b) => b.t0 - a.t0)
        .map(c => `<option value="${encodeURIComponent(c.id || '')}">${escLeadHtml(c.nameDisplay)} — ${fmtLeadEventWhen(c.t0)}</option>`)
        .join('');

    return `
                    <div class="lead-picker" data-lead-key="${keyAttr}" hidden>
                        <div class="lead-picker-row">
                            <select class="lead-picker-select">
                                <option value="">— scegli un evento "LEAD - Call" —</option>
                                ${opts}
                            </select>
                            <button type="button" class="lead-btn" data-lead-action="bind" data-lead-key="${keyAttr}">Aggancia</button>
                        </div>
                        <div class="lead-picker-row">
                            <span class="lead-picker-or">oppure orario a mano:</span>
                            <input type="datetime-local" class="lead-picker-dt">
                            <button type="button" class="lead-btn" data-lead-action="manual" data-lead-key="${keyAttr}">Imposta</button>
                        </div>
                        <div class="lead-picker-row lead-picker-foot">
                            ${hasBinding ? `<button type="button" class="lead-link-muted" data-lead-action="reset" data-lead-key="${keyAttr}">↺ ripristina automatico</button>` : ''}
                            <button type="button" class="lead-link-muted" data-lead-action="close" data-lead-key="${keyAttr}">chiudi</button>
                        </div>
                    </div>`;
}

// Toggle di una checkbox: aggiorna lo stato e lo persiste su Drive (stesso meccanismo dei dati lead).
async function toggleLeadChecklistStep(leadKey, step, checked) {
    // v2.5.71: read-only quando il funnel è congelato (Confermato/No). La UI è già bloccata via CSS
    // (.lead-funnel-frozen → pointer-events:none) ma qui blindo anche lato logica: ignoro il toggle
    // e ri-renderizzo per ripristinare lo stato visivo. Così niente spunte fantasma a funnel chiuso.
    const lockedLead = (leadSectionLeads || []).find(l => l._key === leadKey);
    if (lockedLead && isLeadFunnelFrozen(getLeadStatus(lockedLead))) {
        renderLeadList();
        return;
    }
    if (!leadChecklistState[leadKey]) leadChecklistState[leadKey] = {};
    leadChecklistState[leadKey][step] = checked;

    // v2.5.61: timestamp CONGELATO della prima spunta. Lo registro SOLO la prima volta che lo step
    // diventa true e non lo tocco mai più: se decaselio e ri-caselio (anche per sbaglio) riuso
    // l'originale, mai Date.now(). Non lo cancello sull'uncheck (resta lì per il ri-spunto).
    let timesChanged = false;
    if (checked) {
        if (!leadChecklistTimes[leadKey]) leadChecklistTimes[leadKey] = {};
        if (!leadChecklistTimes[leadKey][step]) {
            leadChecklistTimes[leadKey][step] = new Date().toISOString();
            timesChanged = true;
        }
    }

    // v2.5.61: re-render subito così la riga compare/sparisce dal log all'istante (legge dalla
    // memoria, NON riscarica da Drive). La persistenza avviene dopo, in background.
    renderLeadList();

    if (window.DriveStorage && window.accessToken) {
        try {
            await window.DriveStorage.save(STORAGE_KEYS.LEAD_CHECKLIST, leadChecklistState);
            if (timesChanged) await window.DriveStorage.save(STORAGE_KEYS.LEAD_CHECKLIST_TIMES, leadChecklistTimes);
            invalidateLeadDataCache(); // v2.5.76 PERF: dati cambiati su Drive → prossima apertura rilegge fresco
            console.log(`💾 [Lead] Checklist salvata (${leadKey} · ${step} = ${checked})`);
        } catch (e) {
            console.error('❌ [Lead] Salvataggio checklist fallito:', e);
        }
    } else {
        console.warn('⚠️ [Lead] Non loggato: stato checklist non salvato su cloud.');
    }
}
window.toggleLeadChecklistStep = toggleLeadChecklistStep;

// v2.5.69: imposta lo STATO conferma del lead (confermato|pending|no). È SEMPRE una scelta manuale,
// ANCORATA all'appuntamento corrente (createdISO): se domani il lead ri-fissa, lo stato torna a
// "pending" da solo (vedi getLeadStatus). Salvo su Drive come oggetto { status, forCreatedISO },
// poi re-render. Solo "pending" tiene il funnel attivo; gli altri due lo congelano.
async function setLeadStatus(leadKey, status) {
    if (!LEAD_STATUSES.includes(status)) return;
    const lead = (leadSectionLeads || []).find(l => l._key === leadKey);
    const forCreatedISO = lead ? getLeadCreatedISO(lead) : '';
    const prev = leadStatusState[leadKey];
    // no-op se invariato (stesso stato per lo stesso appuntamento): niente re-render/scrittura
    if (prev && typeof prev === 'object' && prev.status === status && prev.forCreatedISO === forCreatedISO) return;
    leadStatusState[leadKey] = { status: status, forCreatedISO: forCreatedISO };

    renderLeadList();

    if (window.DriveStorage && window.accessToken) {
        try {
            await window.DriveStorage.save(STORAGE_KEYS.LEAD_STATUS, leadStatusState);
            invalidateLeadDataCache(); // v2.5.76 PERF: dati cambiati su Drive → prossima apertura rilegge fresco
            console.log(`💾 [Lead] Stato salvato (${leadKey} = ${status}, appuntamento ${forCreatedISO || 'n/d'})`);
        } catch (e) {
            console.error('❌ [Lead] Salvataggio stato fallito:', e);
        }
    } else {
        console.warn('⚠️ [Lead] Non loggato: stato non salvato su cloud.');
    }

    // v2.5.66/67: rifletti SUBITO lo stato nel Google Sheet → l'Apps Script email ferma/riattiva il
    // funnel per questo lead (mail solo se "pending"). leadStatusState è già aggiornato. Fire-and-forget.
    if (lead && window.FunnelSheetSync && window.FunnelSheetSync.upsertLead) {
        try { window.FunnelSheetSync.upsertLead(buildFunnelLeadRow(lead)); }
        catch (e) { console.warn('⚠️ [Funnel] upsert foglio fallito (ignoro):', e); }
    }
}
window.setLeadStatus = setLeadStatus;

// Persiste gli agganci manuali su Drive (stesso meccanismo dei dati lead).
async function saveLeadBindings() {
    if (window.DriveStorage && window.accessToken) {
        try {
            await window.DriveStorage.save(STORAGE_KEYS.LEAD_BINDINGS, leadBindings);
            invalidateLeadDataCache(); // v2.5.76 PERF: dati cambiati su Drive → prossima apertura rilegge fresco
            console.log('💾 [Lead] Agganci salvati');
        } catch (e) {
            console.error('❌ [Lead] Salvataggio agganci fallito:', e);
        }
    } else {
        console.warn('⚠️ [Lead] Non loggato: aggancio non salvato su cloud.');
    }
}

// Riapre il pannello picker di un lead dopo un re-render (per "Non è lei" → scegli da lista).
function openPickerFor(leadKey) {
    const listContainer = document.getElementById('leadList');
    const picker = listContainer?.querySelector(`.lead-picker[data-lead-key="${encodeURIComponent(leadKey)}"]`);
    if (picker) picker.hidden = false;
}

// Gestisce i click sulle azioni del funnel (proposte, picker, aggancio manuale).
async function handleLeadAction(btn) {
    const action = btn.dataset.leadAction;
    const leadKey = btn.dataset.leadKey ? decodeURIComponent(btn.dataset.leadKey) : null;
    const eventId = btn.dataset.eventId ? decodeURIComponent(btn.dataset.eventId) : null;
    const card = btn.closest('.cronologia-item');

    // Azioni di sola UI (nessun salvataggio)
    if (action === 'open-picker' || action === 'close') {
        const picker = card?.querySelector('.lead-picker');
        if (picker) picker.hidden = (action === 'close') ? true : !picker.hidden;
        return;
    }
    if (!leadKey) return;

    const b = leadBindings[leadKey] || (leadBindings[leadKey] = {});

    if (action === 'confirm') {
        b.eventId = eventId; delete b.manualT0;
    } else if (action === 'reject') {
        b.dismissed = b.dismissed || [];
        if (eventId && !b.dismissed.includes(eventId)) b.dismissed.push(eventId);
    } else if (action === 'bind') {
        const sel = card?.querySelector('.lead-picker-select');
        const val = sel && sel.value ? decodeURIComponent(sel.value) : '';
        if (!val) { showNotification('Scegli un evento dalla lista', 'warning'); return; }
        b.eventId = val; delete b.manualT0;
    } else if (action === 'manual') {
        const dt = card?.querySelector('.lead-picker-dt');
        const val = dt && dt.value ? dt.value : '';
        if (!val) { showNotification('Inserisci data e ora', 'warning'); return; }
        b.manualT0 = val; delete b.eventId;
    } else if (action === 'reset') {
        delete leadBindings[leadKey];
    } else {
        return;
    }

    await saveLeadBindings();
    renderLeadList();
    // Dopo un "Non è lei" riapro il picker così l'utente sceglie da lista (o imposta a mano)
    if (action === 'reject') openPickerFor(leadKey);
}

// Aggancia (una volta sola) la delega eventi sul contenitore #leadList, che resta lo stesso
// elemento tra un render e l'altro: così i listener sopravvivono ai re-render.
function ensureLeadDelegation(listContainer) {
    if (listContainer._leadDelegationAttached) return;
    listContainer._leadDelegationAttached = true;

    listContainer.addEventListener('change', (e) => {
        const cb = e.target.closest && e.target.closest('.lead-check-row input[type="checkbox"]');
        if (!cb) return;
        const leadKey = decodeURIComponent(cb.dataset.leadKey);
        // v2.5.61: toggleLeadChecklistStep ri-renderizza (aggiorna .done e il log della card);
        // non serve più il toggle manuale della classe .done qui.
        toggleLeadChecklistStep(leadKey, cb.dataset.step, cb.checked);
    });

    listContainer.addEventListener('click', (e) => {
        // v2.5.67: controllo a 3 stati (Confermato / Pending / No) nell'header della card.
        const statusBtn = e.target.closest && e.target.closest('[data-lead-status]');
        if (statusBtn && listContainer.contains(statusBtn)) {
            const leadKey = decodeURIComponent(statusBtn.dataset.leadKey);
            setLeadStatus(leadKey, statusBtn.dataset.leadStatus);
            return;
        }
        const btn = e.target.closest && e.target.closest('[data-lead-action]');
        if (btn && listContainer.contains(btn)) handleLeadAction(btn);
    });
}

// ===== SEZIONE LEAD (vista aggregata della cronologia, raggruppata per lead) =====
async function loadLeadSection() {
    const listContainer = document.getElementById('leadList');
    if (!listContainer) return;

    // Non loggato: nessun accesso a Drive
    if (!window.accessToken) {
        listContainer.innerHTML = '<p class="placeholder-text">⚠️ Connetti Google per vedere lo storico dei lead</p>';
        return;
    }

    // v2.5.76 PERF: cache-hit. Se ho già i lead in RAM e l'ultimo load è recente (< TTL), NON
    // riscarico nulla da Drive: ridisegno dai dati in memoria (leadSectionLeads + le globali
    // checklist/bindings/stato/codici già popolate). La cache si invalida da sola a ogni save
    // (invalidateLeadDataCache), quindi è sempre coerente con le modifiche fatte dall'utente.
    if (leadSectionLeads.length && (Date.now() - leadDataCacheAt) < LEAD_DATA_TTL_MS) {
        renderLeadList();
        return;
    }

    listContainer.innerHTML = '<p class="placeholder-text">Caricamento...</p>';

    // v2.5.76 PERF: i 7 dati della sezione Lead si caricano TUTTI IN PARALLELO da Drive
    // (Promise.allSettled) invece che in serie — prima ognuno aspettava il precedente, quindi
    // l'apertura della sezione costava ~7× la latenza di Drive. Stesso identico comportamento di
    // prima per ogni chiave: default a vuoto se assente, fallback localStorage per la cronologia
    // (v2.5.72: NON usciamo se vuota — le schede possono nascere dai soli eventi calendario),
    // migrazione una-tantum LEAD_CONFIRMED→LEAD_STATUS (eseguita DOPO i load, solo se LEAD_STATUS è
    // davvero ASSENTE — non quando il suo load fallisce), e logging del singolo errore per chiave.
    // (Le note storiche: v2.5.55 checklist, v2.5.57 agganci, v2.5.67 stato, v2.5.61 orari, v2.5.64 codici.)
    let cronologia = [];
    leadChecklistState = {};
    leadBindings = {};
    leadStatusState = {};
    leadChecklistTimes = {};
    leadCodes = {};
    leadCodeCounter = 0;

    if (window.DriveStorage) {
        // L'ordine dell'array di risultati = l'ordine delle chiavi qui sotto.
        const KEYS = [
            STORAGE_KEYS.CRONOLOGIA,            // 0
            STORAGE_KEYS.LEAD_CHECKLIST,        // 1
            STORAGE_KEYS.LEAD_BINDINGS,         // 2
            STORAGE_KEYS.LEAD_STATUS,           // 3
            STORAGE_KEYS.LEAD_CHECKLIST_TIMES,  // 4
            STORAGE_KEYS.LEAD_CODES,            // 5
            STORAGE_KEYS.LEAD_CODE_COUNTER      // 6
        ];
        const results = await Promise.allSettled(KEYS.map(k => window.DriveStorage.load(k)));
        // Valore di una load andata a buon fine; se 'rejected' logga il singolo errore (come i
        // vecchi catch per-chiave) e restituisce undefined → la chiave prende il suo default.
        const val = (i, label) => {
            const r = results[i];
            if (r.status === 'rejected') {
                console.error(`❌ Errore caricamento ${label} (Lead):`, r.reason);
                return undefined;
            }
            return r.value;
        };

        const cron = val(0, 'cronologia');
        if (cron) cronologia = cron;

        const saved = val(1, 'checklist lead');
        if (saved && typeof saved === 'object') leadChecklistState = saved;

        const savedB = val(2, 'agganci lead');
        if (savedB && typeof savedB === 'object') leadBindings = savedB;

        // STATO conferma (+ migrazione una-tantum). Distinguo load-fallita da load-vuota: la
        // migrazione parte SOLO se la load è riuscita ma il file è assente (come il vecchio else);
        // se la load è 'rejected' logghiamo l'errore e NON migriamo (come il vecchio catch esterno).
        const rS = results[3];
        if (rS.status === 'rejected') {
            console.error('❌ Errore caricamento stato lead:', rS.reason);
        } else if (rS.value && typeof rS.value === 'object') {
            leadStatusState = rS.value;
        } else {
            // MIGRAZIONE una-tantum: il file LEAD_STATUS non esiste ancora → costruiscilo dal
            // vecchio booleano LEAD_CONFIRMED ({key:true} → "confermato"). I lead non confermati
            // a mano NON entrano qui: prenderanno il default (no/pending) da getLeadStatus().
            // Il file LEGACY non viene cancellato (rollback). Persisto LEAD_STATUS così la
            // migrazione non si ripete (la sua sola esistenza è la sentinella).
            try {
                const oldConfirmed = await window.DriveStorage.load(STORAGE_KEYS.LEAD_CONFIRMED);
                if (oldConfirmed && typeof oldConfirmed === 'object') {
                    Object.keys(oldConfirmed).forEach(k => { if (oldConfirmed[k]) leadStatusState[k] = 'confermato'; });
                }
                if (window.accessToken) {
                    try {
                        await window.DriveStorage.save(STORAGE_KEYS.LEAD_STATUS, leadStatusState);
                        console.log(`🔄 [v2.5.67] Migrazione LEAD_CONFIRMED → LEAD_STATUS (${Object.keys(leadStatusState).length} confermati a mano)`);
                    } catch (e) {
                        console.warn('⚠️ [v2.5.67] Salvataggio migrazione stato lead fallito (riproverà):', e);
                    }
                }
            } catch (error) {
                console.error('❌ Errore caricamento stato lead:', error);
            }
        }

        const savedT = val(4, 'orari checklist lead');
        if (savedT && typeof savedT === 'object') leadChecklistTimes = savedT;

        const savedCodes = val(5, 'codici lead');
        if (savedCodes && typeof savedCodes === 'object') leadCodes = savedCodes;

        const savedCounter = val(6, 'counter codici lead');
        if (savedCounter && typeof savedCounter.next === 'number') leadCodeCounter = savedCounter.next;
    }

    // Fallback localStorage per la cronologia (come saveToCronologia): solo se Drive è vuoto/assente.
    if (cronologia.length === 0) {
        const localData = localStorage.getItem(STORAGE_KEYS.CRONOLOGIA);
        if (localData) {
            try { cronologia = JSON.parse(localData); } catch (e) { /* ignora JSON rotto */ }
        }
    }

    if (!leadCodeCounter) leadCodeCounter = Object.keys(leadCodes).length;
    window.leadCodes = leadCodes;
    window.leadCodeCounter = leadCodeCounter;

    // v2.5.55/57: candidati T0 dagli eventi "LEAD - Call" già sincronizzati in localStorage.
    leadSectionCandidates = buildLeadCallIndex().candidates;

    // Raggruppa per lead: chiave = telefono (solo cifre) se presente, altrimenti nome+cognome.
    // v2.5.64: derivazione centralizzata in leadIdentityKey (stessa funzione usata da Calendar).
    const leadsMap = {};
    cronologia.forEach(entry => {
        const key = leadIdentityKey(entry.telefono, entry.nome, entry.cognome);
        if (!leadsMap[key]) {
            leadsMap[key] = { _key: key, nome: '', cognome: '', telefono: '', messaggi: [] };
        }
        const lead = leadsMap[key];
        // Tieni i dati anagrafici quando disponibili
        if (entry.nome) lead.nome = entry.nome;
        if (entry.cognome) lead.cognome = entry.cognome;
        if (entry.telefono) lead.telefono = entry.telefono;
        lead.messaggi.push(entry);
    });

    // v2.5.72: MERGE lead-da-calendario. Oltre ai lead già messaggiati (cronologia), mostriamo come
    // scheda ANCHE i lead che hanno solo un evento nei calendari "LEAD - Call"/"FOLLOWUP" e a cui non
    // abbiamo ancora scritto → la sezione Lead diventa coerente con la tendina (un lead in calendario
    // compare subito, col suo stato) e il funnel/conferma può partire da subito. Identità con la STESSA
    // leadIdentityKey della cronologia: se il lead è già presente (perché poi gli abbiamo scritto) i
    // due si fondono, niente doppioni. L'anagrafica dell'evento riempie SOLO i campi mancanti (i dati
    // della cronologia, scritti a mano, hanno priorità). Lead senza messaggi → messaggi:[] (0 azioni).
    buildCalendarLeads(leadSectionCandidates).forEach(cl => {
        if (!leadsMap[cl._key]) {
            leadsMap[cl._key] = { _key: cl._key, nome: '', cognome: '', telefono: '', messaggi: [] };
        }
        const lead = leadsMap[cl._key];
        if (!lead.nome && cl.nome) lead.nome = cl.nome;
        if (!lead.cognome && cl.cognome) lead.cognome = cl.cognome;
        if (!lead.telefono && cl.telefono) lead.telefono = cl.telefono;
    });

    // Ordina: messaggi dal più vecchio al più recente; ultimo contatto per ordinare i lead
    const leads = Object.values(leadsMap);

    // v2.5.72: ora che cronologia e calendario sono fusi, se NON c'è davvero nessun lead esco qui.
    if (leads.length === 0) {
        listContainer.innerHTML = '<p class="placeholder-text">Nessun lead ancora: aggiungi un evento "LEAD - Call"/"FOLLOWUP" oppure invia un primo messaggio.</p>';
        return;
    }
    leads.forEach(lead => {
        lead.messaggi.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const ultimo = lead.messaggi[lead.messaggi.length - 1];
        if (ultimo) {
            lead.ultimoContatto = new Date(ultimo.timestamp).getTime();
        } else {
            // v2.5.72: lead-da-calendario senza messaggi → ordino per recency dell'evento (ingresso/
            // appuntamento) invece di lasciarlo a 0 (in fondo). Così i lead nuovi appena entrati in
            // calendario sono subito visibili in cima, "mano a mano che vengono aggiunti".
            let ts = 0;
            try {
                const r = resolveLeadT0(lead, leadSectionCandidates, leadBindings[lead._key]);
                const d = (r && (r.createdAt || r.t0)) || null;
                if (d && !isNaN(d.getTime())) ts = d.getTime();
            } catch (e) { /* best-effort */ }
            lead.ultimoContatto = ts;
        }
    });
    // Lead dal contatto/evento più recente al più vecchio
    leads.sort((a, b) => b.ultimoContatto - a.ultimoContatto);

    // v2.5.64: backfill codici per lead storici (creati prima di questa feature) ancora senza codice.
    // Ordine deterministico = per timestamp del PRIMO messaggio crescente, così l'assegnazione è
    // stabile e indipendente dall'ordine di iterazione. Un codice già assegnato non cambia mai.
    let codesChanged = false;
    const byFirstMsg = leads.slice().sort((a, b) => {
        const fa = a.messaggi[0] ? new Date(a.messaggi[0].timestamp).getTime() : 0;
        const fb = b.messaggi[0] ? new Date(b.messaggi[0].timestamp).getTime() : 0;
        return fa - fb;
    });
    byFirstMsg.forEach(lead => {
        if (!leadCodes[lead._key]) {
            leadCodeCounter += 1;
            leadCodes[lead._key] = formatLeadCode(leadCodeCounter);
            codesChanged = true;
        }
    });
    if (codesChanged && window.DriveStorage) {
        window.leadCodes = leadCodes;
        window.leadCodeCounter = leadCodeCounter;
        try {
            await window.DriveStorage.save(STORAGE_KEYS.LEAD_CODES, leadCodes);
            await window.DriveStorage.save(STORAGE_KEYS.LEAD_CODE_COUNTER, { next: leadCodeCounter });
            console.log('🆔 [v2.5.64] Codici lead backfill salvati su Drive (assegnati ai lead storici)');
        } catch (error) {
            console.error('❌ Errore salvataggio codici lead (backfill):', error);
        }
    }

    // Tieni i dati in memoria e renderizza (i re-render successivi NON riscaricano da Drive).
    leadSectionLeads = leads;
    leadDataCacheAt = Date.now(); // v2.5.76 PERF: load completo riuscito → cache valida per LEAD_DATA_TTL_MS
    renderLeadList();

    // v2.5.66: mirror dello stato funnel sul Google Sheet, così l'Apps Script "Funnel Notify"
    // (che gira a browser chiuso) può leggere identità + flag "Confermato". Additivo e
    // fire-and-forget: NON tocca gli appDataFolder né la UI, e non blocca mai il render.
    if (window.FunnelSheetSync && window.FunnelSheetSync.syncAllLeads) {
        try {
            window.FunnelSheetSync.syncAllLeads(leads.map(buildFunnelLeadRow));
        } catch (e) {
            console.warn('⚠️ [Funnel] sync foglio fallito (ignoro):', e);
        }
    }
}

// v2.5.66/67: riga-mirror di un lead per il Google Sheet del funnel (vedi funnel-sheet-sync.js).
// { leadKey, telefono, nome, codice, status, t0ISO, createdISO }.
// - status     = stato EFFETTIVO (manuale o default da cutoff): l'Apps Script manda mail SOLO se "pending".
// - createdISO = v2.5.67: data di CREAZIONE dell'evento "LEAD - Call" (ingresso reale). È il T0
//                autorevole per il funnel lato Apps Script (stamp T+2/4/6h dal createdISO).
// - t0ISO      = orario APPUNTAMENTO (start evento), tenuto per retrocompatibilità/diagnostica.
function buildFunnelLeadRow(lead) {
    let t0ISO = '';
    let createdISO = '';
    try {
        const res = resolveLeadT0(lead, leadSectionCandidates, leadBindings[lead._key]);
        if (res && res.t0) t0ISO = res.t0.toISOString();
        if (res && res.createdAt) createdISO = res.createdAt.toISOString();
    } catch (e) { /* best-effort */ }
    return {
        leadKey: lead._key,
        telefono: lead.telefono || '',
        nome: (`${lead.nome || ''} ${lead.cognome || ''}`).trim(),
        codice: leadCodes[lead._key] || '',
        status: getLeadStatus(lead),
        t0ISO: t0ISO,
        createdISO: createdISO
    };
}
window.buildFunnelLeadRow = buildFunnelLeadRow;

// v2.5.67: barra in cima alla sezione Lead — contatore live per i 3 stati + filtro.
// `statusByKey` = mappa _key→stato effettivo (calcolata una volta in renderLeadList). Il filtro
// (leadFilterMode) NON è persistito. La delega click è agganciata una sola volta sul contenitore.
function renderLeadFilterBar(statusByKey) {
    const bar = document.getElementById('leadFilterBar');
    if (!bar) return;

    const counts = { confermato: 0, pending: 0, no: 0 };
    leadSectionLeads.forEach(l => { const s = statusByKey[l._key]; if (counts[s] !== undefined) counts[s]++; });

    const btn = (mode, label) =>
        `<button type="button" class="lead-filter-btn${leadFilterMode === mode ? ' active' : ''}" data-lead-filter="${mode}">${label}</button>`;

    bar.innerHTML = `
        <div class="lead-filter-counts">
            <span class="lead-filter-count-pending">🕒 ${counts.pending} pending</span>
            <span class="lead-filter-sep">·</span>
            <span class="lead-filter-count-conf">✅ ${counts.confermato} confermati</span>
            <span class="lead-filter-sep">·</span>
            <span class="lead-filter-count-no">✖️ ${counts.no} no</span>
        </div>
        <div class="lead-filter-btns">
            ${btn('all', 'Tutti')}
            ${btn('pending', 'Pending')}
            ${btn('confermato', 'Confermati')}
            ${btn('no', 'No')}
        </div>`;

    if (!bar._leadFilterDelegationAttached) {
        bar._leadFilterDelegationAttached = true;
        bar.addEventListener('click', (e) => {
            const b = e.target.closest && e.target.closest('[data-lead-filter]');
            if (!b || !bar.contains(b)) return;
            leadFilterMode = b.dataset.leadFilter;
            renderLeadList();
        });
    }
}

// v2.5.73: etichette spostate a livello di modulo (erano locali a renderLeadList) così le riusa
// anche buildLeadCardHtml. Etichette leggibili per i tipi messaggio (id template).
const LEAD_TIPO_LABELS = {
    'primo_messaggio': '💬 Primo messaggio',
    'memo_giorno': '📝 Memo del giorno',
    'dolce_paranoia': '🔔 Dolce paranoia',
    'conferma_lettura': '📄 Conferma lettura',
    'riscontro': '↩️ Riscontro',
    'riconferma': '✅ Riconferma'
};
function leadTipoLabel(tipo) {
    if (!tipo) return '💬 Primo messaggio'; // retrocompat: entry senza tipo
    if (LEAD_TIPO_LABELS[tipo]) return LEAD_TIPO_LABELS[tipo];
    return tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/_/g, ' ');
}
// v2.5.61: etichette per le righe-azione generate dalle spunte del funnel (nel log della card).
const LEAD_FUNNEL_LOG_LABELS = {
    ingresso:    '📥 Ingresso lead',
    scrivere:    '✍️ Scrivere al lead',
    sollecitare: '🔔 Sollecitare il lead',
    chiamata:    '📞 Sollecitare via chiamata',
    noshow:      '🚫 Inviato a Gruppo NoShow'
};

// v2.5.74: iniziali per l'avatar della scheda lead. "Giacomo Bizzini" → "GB"; un solo nome →
// prime due lettere; niente nome → "•". Calcolate dal nome, niente da passare a mano.
function leadInitials(nome, cognome) {
    const n = (nome || '').trim();
    const c = (cognome || '').trim();
    if (n && c) return (n[0] + c[0]).toUpperCase();
    const solo = n || c;
    if (!solo) return '•';
    const parts = solo.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return solo.slice(0, 2).toUpperCase();
}

// v2.5.73: HTML di UNA scheda lead. Estratto da renderLeadList per riusarlo sia per i pending
// (vista piena) sia per l'archivio (confermati+no) dentro il <details> collassato — senza
// duplicare codice. `leadStatus` = stato conferma effettivo (confermato|pending|no), già calcolato.
function buildLeadCardHtml(lead, leadStatus) {
    const nomeCompleto = (`${lead.nome} ${lead.cognome || ''}`).trim() || 'Lead senza nome';
    const telefono = lead.telefono ? formatLeadPhoneDisplay(lead.telefono) : '—'; // v2.5.59: +39 339 486 5982
    const count = lead.messaggi.length;
    const keyAttr = encodeURIComponent(lead._key);
    // v2.5.64: codice ID lead (deep-link da Calendar). Resta come attributo data-lead-code per il
    // deep-link. v2.5.74: niente più badge gigante colorato (era invasivo) → ID piccolo monospace
    // accanto al nome, e iniziali nell'avatar.
    const leadCode = leadCodes[lead._key] || '';
    lead._code = leadCode || null;
    const codeHtml = leadCode ? `<span class="lead-code" title="Codice scheda lead">${leadCode}</span>` : '';
    const initials = leadInitials(lead.nome, lead.cognome);

    // v2.5.55/57: blocco funnel-conferma. Risolve T0 con agganci manuali + automatico + proposte.
    // v2.5.61: calcolato PRIMA del log perché serve a datare la riga "ingresso" (usa createdAt).
    const resolution = resolveLeadT0(lead, leadSectionCandidates, leadBindings[lead._key]);

    // v2.5.61: il log della card unisce i messaggi del form E le spunte del funnel, ordinati
    // cronologicamente. Ogni voce: { sortTs, html }.
    const entries = [];

    // (a) Messaggi del form (cronologia) — invariati.
    lead.messaggi.forEach(msg => {
        const d = new Date(msg.timestamp);
        const dateStr = d.toLocaleDateString('it-IT');
        const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        // v2.5.59: il nome servizio ("Finanza Efficace"/"Stock Gain") serve solo ai
        // messaggi/rubrica → rimosso da questa label. Resta solo il tag FE/SG - Lead.
        const societa = msg.societa ? ` · <i class="fas fa-building"></i> ${msg.societa}` : '';
        entries.push({
            sortTs: d.getTime(),
            html: `
            <div class="lead-azione">
                <span class="lead-tipo-badge">${leadTipoLabel(msg.tipoMessaggio)}</span>
                <span class="lead-azione-meta">
                    <i class="fas fa-clock"></i> ${dateStr} ${timeStr}${societa}
                </span>
            </div>`
        });
    });

    // (b) Spunte del funnel — una riga per ogni step CHECKED, con timestamp congelato.
    const stepState = leadChecklistState[lead._key] || {};
    const stepTimes = leadChecklistTimes[lead._key] || {};
    LEAD_CHECKLIST_STEPS.forEach(step => {
        const checked = (stepState[step.key] !== undefined) ? stepState[step.key] : (step.defaultChecked || false);
        if (!checked) return; // step non spuntato → nessuna riga nel log

        let ts = null;
        const recorded = stepTimes[step.key];
        if (recorded) {
            ts = new Date(recorded); // firstCheckedAt congelato (mai cambia)
        } else if (step.key === 'ingresso') {
            // "ingresso" è spuntato di default e non ha firstCheckedAt. v2.5.63: uso lo STAMP
            // DI CREAZIONE dell'evento "LEAD - Call" (createdAt = quando Calendar ha rilevato
            // il nuovo evento = ingresso reale), NON l'orario appuntamento (t0). Fallback al
            // primo messaggio del lead se il created non c'è.
            ts = resolution.createdAt || (lead.messaggi[0] ? new Date(lead.messaggi[0].timestamp) : null);
        }

        let metaTime, sortTs;
        if (ts && !isNaN(ts.getTime())) {
            const dateStr = ts.toLocaleDateString('it-IT');
            const timeStr = ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            metaTime = `${dateStr} ${timeStr}`;
            sortTs = ts.getTime();
        } else {
            // spunta antecedente a questa feature, senza orario registrato: niente Date.now()
            // inventato (sarebbe falso). Mostro un marcatore onesto e ordino best-effort sulla
            // BASE del funnel (v2.5.73: stamp di creazione evento, non l'appuntamento t0).
            metaTime = 'orario non registrato';
            sortTs = resolution.createdAt
                ? resolution.createdAt.getTime() + ((step.offsetH || 0) * 3600 * 1000)
                : (lead.ultimoContatto || 0);
        }

        entries.push({
            sortTs,
            html: `
            <div class="lead-azione lead-azione-funnel">
                <span class="lead-tipo-badge lead-badge-funnel">${LEAD_FUNNEL_LOG_LABELS[step.key] || step.label}</span>
                <span class="lead-azione-meta">
                    <i class="fas fa-clock"></i> ${metaTime}
                </span>
            </div>`
        });
    });

    // Log ordinato cronologicamente (messaggi + funnel mescolati).
    entries.sort((a, b) => a.sortTs - b.sortTs);
    const azioniHtml = entries.map(e => e.html).join('');

    const checklistHtml = renderLeadChecklist(lead, resolution, leadStatus);

    // v2.5.67: controllo a 3 stati (Confermato / Pending / No) al posto della vecchia checkbox.
    // Solo "Pending" tiene il funnel attivo (e fa partire le mail); Confermato e No lo congelano.
    const statusBtn = (val, icon, label) =>
        `<button type="button" class="lead-status-btn lead-status-${val}${leadStatus === val ? ' active' : ''}" data-lead-status="${val}" data-lead-key="${keyAttr}" aria-pressed="${leadStatus === val}">${icon} ${label}</button>`;
    const statusControlHtml = `
            <div class="lead-status-control" role="group" aria-label="Stato conferma lead">
                ${statusBtn('confermato', '✅', 'Confermato')}
                ${statusBtn('pending', '🕒', 'Pending')}
                ${statusBtn('no', '✖️', 'No')}
            </div>`;

    // v2.5.63/74: giorno+ora dell'APPUNTAMENTO (t0 = start evento "LEAD - Call" o orario a mano),
    // mostrato nella riga meta sotto al nome. Distinto dall'"ingresso" nel log (stamp di creazione).
    const apptWhen = resolution.t0 ? fmtLeadEventWhen(resolution.t0) : '';
    const apptMeta = apptWhen
        ? `<span class="lead-meta-when"><i class="fas fa-calendar-day"></i> ${apptWhen}</span><span class="lead-meta-sep">·</span>`
        : '';

    // v2.5.74: layout a blocchi (header / contatto / stato) separati da divider sottili.
    // Resta su .cronologia-item (deep-link + handler dei bottoni stato la cercano con .closest),
    // con .lead-card aggiunta per agganciare il nuovo CSS senza toccare le card della cronologia.
    return `
        <div class="cronologia-item lead-card" id="lead-card-${keyAttr}" data-lead-code="${leadCode}">
            <div class="lead-card-head">
                <div class="lead-avatar" aria-hidden="true">${initials}</div>
                <div class="lead-head-main">
                    <div class="lead-head-title">
                        <span class="lead-name">${nomeCompleto}</span>
                        ${codeHtml}
                    </div>
                    <div class="lead-head-meta">
                        ${apptMeta}<span class="lead-meta-count">${count} ${count === 1 ? 'azione' : 'azioni'}</span>
                    </div>
                </div>
            </div>
            <div class="lead-card-contact">
                <span class="lead-contact-phone"><i class="fas fa-phone"></i> ${telefono}</span>
                ${lead.telefono ? `<a href="https://wa.me/${lead.telefono.replace(/\D/g, '')}" target="_blank" rel="noopener" class="lead-wa-btn"><i class="fab fa-whatsapp"></i> WhatsApp</a>` : ''}
            </div>
            ${statusControlHtml}
            ${checklistHtml}
            <div class="lead-azioni">
                ${azioniHtml}
            </div>
        </div>
    `;
}

// Render della lista lead dai dati già in memoria: dopo una scelta utente (conferma/aggancio/
// orario a mano) basta richiamare questa, senza riscaricare nulla da Drive.
function renderLeadList() {
    const listContainer = document.getElementById('leadList');
    if (!listContainer) return;

    // v2.5.67: stato effettivo di ogni lead calcolato UNA volta (manuale o default da cutoff),
    // riusato da barra/filtro/card per non chiamare resolveLeadT0 più volte per lead.
    const statusByKey = {};
    leadSectionLeads.forEach(l => { statusByKey[l._key] = getLeadStatus(l); });

    // v2.5.67: barra contatore (3 stati) + filtro in cima alla sezione.
    renderLeadFilterBar(statusByKey);

    // v2.5.73: vista DI DEFAULT ('pending') = solo i pending in chiaro + un blocco <details>
    // collassato ("Archivio") coi confermati e i "no" sotto. Gli altri filtri (all/confermato/no)
    // restano liste piatte come prima. La card è generata da buildLeadCardHtml (no duplicazione).
    // v2.5.75 ARCHIVIO LAZY: le card d'archivio (confermati+no) NON vengono più costruite al render
    // della pagina — solo i pending sono "live". Il <details> nasce con summary + body VUOTO; le sue
    // card si costruiscono SOLO alla prima apertura (vedi listener 'toggle' più sotto). Risparmia
    // tutto il lavoro di buildLeadCardHtml (log+checklist+picker per ogni archiviato) a chi apre la
    // sezione solo per lavorare i pending.
    let html = '';
    let archiveCtx = null; // {leads, statusByKey} per il build lazy dell'archivio
    if (leadFilterMode === 'pending') {
        const pendingLeads = leadSectionLeads.filter(l => statusByKey[l._key] === 'pending');
        const archiveLeads = leadSectionLeads.filter(l => {
            const s = statusByKey[l._key];
            return s === 'confermato' || s === 'no';
        });

        html = pendingLeads.map(l => buildLeadCardHtml(l, statusByKey[l._key])).join('');
        if (!html) html = '<p class="placeholder-text">Nessun lead pending.</p>';

        // Archivio collassabile (chiuso di default; lo stato di apertura NON è persistito).
        // v2.5.75: body VUOTO con placeholder — niente buildLeadCardHtml qui (lazy alla 1ª apertura).
        if (archiveLeads.length) {
            const nConf = archiveLeads.filter(l => statusByKey[l._key] === 'confermato').length;
            const nNo = archiveLeads.filter(l => statusByKey[l._key] === 'no').length;
            html += `
            <details class="lead-archive">
                <summary class="lead-archive-summary">🗂️ Archivio · ✅ ${nConf} confermati · ✖️ ${nNo} no</summary>
                <div class="lead-archive-body"><p class="placeholder-text lead-archive-hint">Apri per caricare l'archivio…</p></div>
            </details>`;
            archiveCtx = { leads: archiveLeads, statusByKey };
        }
    } else {
        // Filtri espliciti: lista piatta. 'all' = tutti; 'confermato'/'no' = solo quello stato.
        let leadsToShow = leadSectionLeads;
        if (leadFilterMode === 'confermato' || leadFilterMode === 'no') {
            leadsToShow = leadSectionLeads.filter(l => statusByKey[l._key] === leadFilterMode);
        }
        html = leadsToShow.map(l => buildLeadCardHtml(l, statusByKey[l._key])).join('');
        if (!html) html = '<p class="placeholder-text">Nessun lead per questo filtro.</p>';
    }

    listContainer.innerHTML = html;

    // v2.5.57: delega eventi agganciata una sola volta sul contenitore (sopravvive ai re-render).
    ensureLeadDelegation(listContainer);

    // v2.5.75: ARCHIVIO LAZY — costruisco le card confermati/no SOLO alla prima apertura del
    // <details>, non al render. La delega click/change è su #leadList (che CONTIENE il details e il
    // suo body) → le card iniettate qui sono già coperte, nessun nuovo bind. Ogni re-render rigenera
    // il details vuoto e ri-aggancia questo listener (flag _archiveLoaded sul nuovo elemento).
    if (archiveCtx) {
        const details = listContainer.querySelector('details.lead-archive');
        if (details) {
            details.addEventListener('toggle', () => {
                if (!details.open || details._archiveLoaded) return;
                details._archiveLoaded = true;
                const body = details.querySelector('.lead-archive-body');
                if (body) {
                    body.innerHTML = archiveCtx.leads
                        .map(l => buildLeadCardHtml(l, archiveCtx.statusByKey[l._key]))
                        .join('');
                }
            });
        }
    }
}

// ===== v2.5.64: TOAST LEGGERO (nessuna libreria) =====
// Crea al volo un div in basso al centro che si autorimuove. Usato dal deep-link per i casi limite.
function showLeadToast(message) {
    try {
        const t = document.createElement('div');
        t.className = 'lead-toast';
        t.textContent = message;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('lead-toast-show')); // forza la transizione
        setTimeout(() => {
            t.classList.remove('lead-toast-show');
            setTimeout(() => t.remove(), 400);
        }, 3000);
    } catch (e) {
        console.warn('⚠️ toast fallito (ignorato):', e);
    }
}
window.showLeadToast = showLeadToast;

// ===== v2.5.64: DEEP-LINK — porta in vista ed evidenzia la card con codice ID = code =====
// Usata dal link ?id=Lxxxx aperto da Google Calendar. Ritorna true se la card è stata trovata.
function focusLeadCard(code) {
    if (!code) return false;
    let card = null;
    try {
        const sel = (window.CSS && CSS.escape) ? CSS.escape(code) : code;
        card = document.querySelector('[data-lead-code="' + sel + '"]');
    } catch (e) {
        card = null;
    }
    if (!card) {
        console.warn('⚠️ [v2.5.64] Deep-link: nessuna card con codice', code);
        showLeadToast('Lead ' + code + ' non trovato nella lista');
        return false;
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('lead-card-highlight');
    setTimeout(() => card.classList.remove('lead-card-highlight'), 2500);
    return true;
}
window.focusLeadCard = focusLeadCard;

// ===== ULTIMO MESSAGGIO =====
async function saveLastMessage(nome, cognome, telefono) {
    const lastMessage = { nome, cognome, telefono };
    await setStorageItem(STORAGE_KEYS.LAST_MESSAGE, JSON.stringify(lastMessage));
    await loadLastMessageIndicator();
}

async function loadLastMessageIndicator() {
    const lastMessage = JSON.parse((await getStorageItem(STORAGE_KEYS.LAST_MESSAGE)) || 'null');
    const indicator = document.getElementById('lastMessageIndicator');
    const textSpan = document.getElementById('lastMessageText');
    
    if (!lastMessage) {
        indicator.style.display = 'none';
        return;
    }
    
    const nomePreview = lastMessage.nome.substring(0, 3) + '*'.repeat(Math.max(0, lastMessage.nome.length - 3));
    const cognomePreview = lastMessage.cognome ? lastMessage.cognome.substring(0, 3) + '*'.repeat(Math.max(0, lastMessage.cognome.length - 3)) : '';
    const telefonoDigits = lastMessage.telefono.replace(/\D/g, '');
    const telefonoPreview = '*'.repeat(Math.max(0, telefonoDigits.length - 3)) + telefonoDigits.slice(-3);
    
    textSpan.textContent = `Ultimo: ${nomePreview} ${cognomePreview} - ${telefonoPreview}`;
    indicator.style.display = 'flex';
}

// ===== GIORNO DEFAULT (+2 GIORNI) =====
async function initDefaultDay() {
    const oggi = new Date();
    // Fix v2.5.7: Imposta OGGI invece di +2 giorni
    const giorniSettimana = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    const giornoOggi = giorniSettimana[oggi.getDay()];
    document.getElementById('giorno').value = giornoOggi;
    await updatePreview();
}

// ===== TEMPLATES =====
async function loadTemplates() {
    console.log('🔄 Caricamento templates...');
    
    // FORZA RESET per v2.2.15 (assicura template corretto)
    localStorage.removeItem('sgmess_templates_local');
    
    // USA SEMPRE localStorage per templates (mai Drive)
    let templatesString = localStorage.getItem('sgmess_templates_local');
    console.log('📦 Templates localStorage:', templatesString);
    
    let templates = JSON.parse(templatesString || '[]');
    console.log('📋 Templates parsed:', templates.length);
    
    // Se non ci sono template, crea quelli di default
    if (templates.length === 0) {
        console.log('⚠️ Nessun template trovato, creo default...');
        const defaultTemplates = [
            {
                id: 'primo_messaggio',
                nome: 'Primo Messaggio',
                categoria: 'Primo Messaggio',
                testo: '{BB} {NN}, sono {OPERATORE} di {SERVIZIO}. Hai avuto un colloquio con {YY} assistente e mi ha riferito che abbiamo un appuntamento {GG} alle {HH}. {VV} e, nel frattempo, ti invito a leggere il file che ti è stato inviato, è molto importante. Passa {TT}'
            },
            {
                id: 'memo_giorno',
                nome: 'Memo del Giorno',
                categoria: 'Memo',
                testo: '{BB} {NN}, ti confermo che per le {HH} siam collegati, a dopo. Dammi riscontro, grazie'
            },
            {
                id: 'dolce_paranoia',
                nome: 'Dolce Paranoia',
                categoria: 'Promemoria',
                testo: '{BB} {NN}, ti confermo per {GG} alle {HH}. Dammi riscontro, grazie'
            },
            {
                id: 'conferma_lettura',
                nome: 'Conferma lettura documento',
                categoria: 'Promemoria',
                testo: '{BB} {NN}, ti confermo che per le {HH} siam collegati, a dopo. Hai avuto modo di leggere il documento?'
            },
            {
                id: 'riscontro',
                nome: 'Riscontro',
                categoria: 'Promemoria',
                testo: '{BB} {NN}. Cortesemente, puoi darmi riscontro?'
            }
        ];
        templates = defaultTemplates;
        localStorage.setItem('sgmess_templates_local', JSON.stringify(templates));
        console.log('✅ Template default creati e salvati');
    }
    
    // Se esistono solo 2 template (vecchia versione), aggiungi il terzo
    if (templates.length === 2 && !templates.find(t => t.id === 'dolce_paranoia')) {
        console.log('🔄 Aggiornamento: aggiungo Dolce Paranoia...');
        templates.push({
            id: 'dolce_paranoia',
            nome: 'Dolce Paranoia',
            categoria: 'Promemoria',
            testo: '{BB} {NN}, ti confermo per {GG} alle {HH}. Dammi riscontro, grazie'
        });
        localStorage.setItem('sgmess_templates_local', JSON.stringify(templates));
        console.log('✅ Dolce Paranoia aggiunto');
    }
    
    // Se esiste solo 1 template (vecchia versione), aggiungi il secondo
    if (templates.length === 1 && templates[0].id === 'primo_messaggio') {
        console.log('🔄 Aggiornamento: aggiungo Memo del Giorno...');
        templates.push({
            id: 'memo_giorno',
            nome: 'Memo del Giorno',
            categoria: 'Memo',
            testo: '{BB} {NN}, ti confermo che per le {HH} siam collegati, a dopo. Dammi riscontro, grazie'
        });
        localStorage.setItem('sgmess_templates_local', JSON.stringify(templates));
        console.log('✅ Memo del Giorno aggiunto');
    }
    
    // Popola dropdown
    const select = document.getElementById('tipoMessaggio');
    if (!select) {
        console.error('❌ Dropdown tipoMessaggio non trovato!');
        return;
    }
    
    select.innerHTML = '';
    templates.forEach(t => {
        const option = document.createElement('option');
        option.value = t.id;
        option.textContent = t.nome;
        select.appendChild(option);
        console.log(`  ➕ Aggiunta opzione: ${t.nome}`);
    });
    
    console.log(`✅ ${templates.length} template(s) caricati nel dropdown`);
    
    await updatePreview();
}

async function loadMessaggiList() {
    const templates = JSON.parse((await getStorageItem(STORAGE_KEYS.TEMPLATES)) || '[]');
    const container = document.getElementById('messaggiList');
    
    if (templates.length === 0) {
        container.innerHTML = '<p class="placeholder-text">Nessun messaggio creato...</p>';
        return;
    }
    
    let html = '';
    templates.forEach(t => {
        html += `
            <div class="cronologia-item">
                <div class="cronologia-header">
                    <strong>${t.nome}</strong>
                    <span style="font-size: 13px; color: var(--gray-500);">
                        <i class="fas fa-tag"></i> ${t.categoria}
                    </span>
                </div>
                <div class="cronologia-message">
                    ${t.testo}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ===== EXPORT FUNZIONI GLOBALI =====
window.showNotification = showNotification;

console.log('✅ Main.js v2.5.8 caricato');
