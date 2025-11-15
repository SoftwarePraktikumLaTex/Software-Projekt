// --- 1. IMPORTE (Bleiben ganz oben) ---
// KORRIGIERT: Importe vom jsdelivr-CDN (jetzt mit korrektem Link für Latex)
import { EditorView, keymap, lineNumbers } from "https://cdn.jsdelivr.net/npm/@codemirror/view/+esm";
import { EditorState } from "https://cdn.jsdelivr.net/npm/@codemirror/state/+esm";
import { defaultKeymap } from "https://cdn.jsdelivr.net/npm/@codemirror/commands/+esm";
import { latex } from "https://unpkg.com/@codemirror/lang-latex?module"; // <-- DAS IST DER KORRIGIERTE LINK
// --- 2. HAUPT-APP: Startet alles ---
const App = {
    init() {
        // Initialisiert alle untergeordneten Module
        DropdownModule.init();
        SearchModule.init();
        SidebarModule.init(); // Wichtig: Muss *vor* dem Editor initialisiert werden
        EditorModule.init();  // Der Editor nutzt das SidebarModule
        
        console.log("Anwendung initialisiert.");
    }
};

// --- 3. DROPDOWN-MODUL ---
const DropdownModule = {
    // DOM-Elemente für dieses Modul
    dateiButton: document.querySelector("#datei"),
    editButton: document.querySelector("#edit"),
    importButton: document.querySelector("#import"),
    helpButton: document.querySelector("#help"),
    
    dateiDropdown: document.querySelector("#dropdownDateiContent"),
    editDropdown: document.querySelector("#dropdownEditContent"),
    importDropdown: document.querySelector("#dropdownImportContent"),
    helpDropdown: document.querySelector("#dropdownHelpContent"),
    
    allDropdowns: [], // Wird in init() gefüllt

    init() {
        // Selektoren in einem Array sammeln
        this.allDropdowns = [this.dateiDropdown, this.editDropdown, this.importDropdown, this.helpDropdown];
        
        // Event-Listener für die Buttons
        // (Optional Chaining '?.' verhindert Fehler, falls ein Element nicht existiert)
        this.dateiButton?.addEventListener("click", () => this.toggleDropdown(this.dateiDropdown));
        this.editButton?.addEventListener("click", () => this.toggleDropdown(this.editDropdown));
        this.importButton?.addEventListener("click", () => this.toggleDropdown(this.importDropdown));
        this.helpButton?.addEventListener("click", () => this.toggleDropdown(this.helpDropdown));

        // Event-Listener für "Click-Away" (Schließen, wenn man daneben klickt)
        window.addEventListener("click", (event) => {
            const isDropdownButton = event.target.matches(".datei-btn, .edit-btn, .import-btn, .help-btn");
            const isInsideDropdown = event.target.closest(".dropdownDateiClass, .dropdownEditClass, .dropdownImportClass, .dropdownHelpClass");

            if (!isDropdownButton && !isInsideDropdown) {
                this.allDropdowns.forEach(dropdown => dropdown?.classList.remove("show"));
            }
        });
    },

    toggleDropdown(targetDropdown) {
        this.allDropdowns.forEach(dropdown => {
            if (!dropdown) return; // Überspringen, falls ein Dropdown fehlt
            
            if (dropdown === targetDropdown) {
                dropdown.classList.toggle("show"); // Das Ziel umschalten
            } else {
                dropdown.classList.remove("show"); // Alle anderen schließen
            }
        });
    }
};

// --- 4. SUCH-MODUL ---
const SearchModule = {
    form: document.querySelector("#search-form"),
    input: document.querySelector("#input1"),

    init() {
        this.form?.addEventListener("submit", (event) => {
            event.preventDefault();
            const inputtext = this.input.value;
            console.log("Suche nach:", inputtext);
            // Hier könnte die zukünftige Suchlogik aufgerufen werden
        });
    }
};

// --- 5. SIDEBAR-MODUL (Zuständig für die Key-Liste) ---
const SidebarModule = {
    citationListUl: document.querySelector("#citation-list"),

    init() {
        // Diese Funktion ist für zukünftige Initialisierungen da.
        // Aktuell wird die Logik vom EditorModule aufgerufen.
        if (!this.citationListUl) {
            console.error("Sidebar-Liste (#citation-list) nicht gefunden!");
        }
    },

    /**
     * Extrahiert alle BibTeX-Keys (z.B. @key123) aus einem Text.
     */
    parseBibtexKeys(text) {
        const keys = new Set();
        const regex = /@(\w+)/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            keys.add(match[1]);
        }
        return keys;
    },

    /**
     * Nimmt die Liste der Keys und baut die <li> Elemente in der Sidebar.
     */
    updateList(keys) {
        if (!this.citationListUl) return; // Sicherstellen, dass das Element existiert

        this.citationListUl.innerHTML = "";
        
        keys.forEach(key => {
            const li = document.createElement("li");
            li.textContent = key;
            li.style.cursor = "pointer";
            li.style.padding = "5px";
            li.onclick = () => {
                 console.log("Springe zu:", key);
                 // Hier könnte zukünftig die "Springe zu"-Logik hin
            };
            this.citationListUl.appendChild(li);
        });
    }
};

// --- 6. EDITOR-MODUL (CodeMirror) ---
const EditorModule = {
    editorParent: document.getElementById("editor"),
    startCode: `@article{beispiel,
  author  = "Autor, A.",
  title   = "Ein Titel",
  journal = "Eine Zeitschrift",
  year    = 2025
}
`,

    init() {
        if (!this.editorParent) {
            console.error("Editor-Container (#editor) nicht gefunden!");
            return;
        }

        // Der Listener, der bei JEDER Änderung im Editor aufgerufen wird
        // und die Sidebar informiert.
        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                const currentText = update.state.doc.toString();
                
                // HIER ist die Verbindung:
                // Editor ruft SidebarModule auf, um die Liste zu aktualisieren
                const keys = SidebarModule.parseBibtexKeys(currentText);
                SidebarModule.updateList(keys);
            }
        });

        // Erstelle den Editor-Status
        const state = EditorState.create({
          doc: this.startCode,
          extensions: [
            lineNumbers(),
            keymap.of(defaultKeymap),
            latex(),                   // BibTeX / LaTeX Syntax-Hervorhebung
            updateListener            // Unser Listener, der die Sidebar aktualisiert
          ],
        });

        // Erstelle die Editor-Ansicht
        new EditorView({
          state: state,
          parent: this.editorParent,
        });

        // Initial einmal aufrufen, damit die Sidebar von Anfang an gefüllt ist
        const initialKeys = SidebarModule.parseBibtexKeys(this.startCode);
        SidebarModule.updateList(initialKeys);
    }
};


// --- 7. ALLES STARTEN ---
// Wir warten, bis die HTML-Seite komplett geladen ist,
// und rufen DANN unsere App.init()-Funktion auf.
document.addEventListener("DOMContentLoaded", () => {
    App.init();
});