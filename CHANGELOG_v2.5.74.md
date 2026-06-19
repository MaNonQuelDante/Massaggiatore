# v2.5.74 — Redesign scheda lead (card più ordinata e meno invasiva)

**Data:** 2026-06-19
**Tipo:** UI / restyling. **Nessuna modifica alla business logic.**

## Perché
Il badge ID gigante a gradiente in cima alla scheda era invasivo e l'interfaccia
della card era poco ordinata (info sparse, bottoni di stato che occupavano tutta
la riga). Richiesta: rimettere in ordine la scheda lead.

## Cosa cambia (solo markup + CSS)
La scheda lead ora ha un layout verticale a **3 blocchi separati da divider sottili**:

1. **Header**
   - **Avatar circolare 42px** con le **iniziali** del lead, calcolate in automatico
     dal nome (es. "Giacomo Bizzini" → "GB"; un solo nome → prime due lettere).
     Sfondo viola tenue, in linea col brand.
   - **Nome** (16px, peso 500) con accanto l'**ID lead** (es. `L0007`) piccolo,
     11px, monospace, colore tenue — non più il badge gigante colorato.
   - **Riga meta** 13px secondaria: 📅 data/ora dell'appuntamento · "N azioni".

2. **Contatto** (dopo divider)
   - Telefono con icona a sinistra.
   - Bottone **WhatsApp** piccolo a destra, **verde tenue** (`#e1f5ee` / `#0f6e56`).

3. **Stato** (dopo divider)
   - **Confermato / Pending / No** come 3 bottoni piccoli inline a **larghezza uguale**.
   - Stato attivo: sfondo tenue + bordo colorato **semantico** (verde / ambra / rosso);
     inattivi trasparenti con bordo neutro.

## Cosa NON cambia (verificato)
- Deep-link scheda da Calendar (`?id=Lxxxx`): la card conserva `id` e
  `data-lead-code`, e resta su `.cronologia-item` (usata da `focusLeadCard` e
  dall'handler dei bottoni di stato via `.closest('.cronologia-item')`).
- Link WhatsApp/tel, funnel checklist, stato che **congela** il funnel
  (Confermato/No), salvataggio su Drive: invariati.

## File toccati
- `js/main.js` — nuovo helper `leadInitials()`; `buildLeadCardHtml()` riscritto a
  blocchi (header/contatto/stato). Logica invariata.
- `css/style.css` — nuovo blocco "REDESIGN SCHEDA LEAD" (scoped a `.lead-card`);
  `.lead-status-control`/`.lead-status-btn` rifatti (bottoni a larghezza uguale,
  attivo tenue); rimosso `.lead-code-badge` (badge gigante).
- `js/config.js`, `index.html` — bump versione + cache-bust.
