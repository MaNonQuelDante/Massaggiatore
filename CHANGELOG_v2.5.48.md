# CHANGELOG v2.5.48

## Salvataggio in rubrica solo per il primo messaggio da lead calendario

Il salvataggio del contatto in **Google Contacts** ora avviene **solo** quando si
verificano **ENTRAMBE** queste condizioni:

1. il **tipo messaggio** selezionato è il **primo messaggio**
   (`document.getElementById('tipoMessaggio').value === 'primo_messaggio'`);
2. il **lead** selezionato proviene dal **calendario**, cioè l'`<option>` selezionata
   in `#selectLead` ha un `dataset.eventId` valorizzato.

### Modifiche (`js/main.js`)

- Nuova helper `shouldSaveContact()` che ritorna `true` solo se entrambe le condizioni
  sopra sono vere. Legge `tipoMessaggio` e
  `selectLead.options[selectLead.selectedIndex]?.dataset?.eventId`.
- In `sendToWhatsApp` e `generateMessage` la condizione
  `if (window.saveContactToGoogle && nome && telefono)` diventa
  `if (window.saveContactToGoogle && nome && telefono && shouldSaveContact())`.
- Aggiunto un `console.log` quando il salvataggio viene **saltato** per gate non
  superato, con il motivo: *tipo non-primo* oppure *lead senza eventId*.

### Note

- I valori (`tipoMessaggio`, `eventId`) vengono letti **prima** di `resetForm()`:
  il gate gira insieme a `checkAndSaveContact`, che era già chiamato prima del reset,
  quindi i campi del form sono ancora valorizzati.
- **Invariate** le logiche di `saveToCronologia` e `markLeadAsContactedFromCalendar`:
  il gate riguarda **solo** la rubrica (Google Contacts).
