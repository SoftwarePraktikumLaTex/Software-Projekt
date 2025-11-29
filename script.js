// --- 1. HAUPT-APP ---
const App = {
    init() {
        DropdownModule.init();
        SearchModule.init();
        SidebarModule.init();
        EditorModule.init(); 
        console.log("Anwendung (CM5) initialisiert.");
    }
};

// --- 2. DROPDOWN-MODUL ---
const DropdownModule = {
    // ... (Kopieren Sie Ihren Dropdown-Code von vorhin hier rein, er war perfekt) ...
    // Damit Sie nicht scrollen müssen, hier die Kurzfassung, 
    // falls Sie ihn nicht mehr haben, nehmen Sie Ihren alten Code für diesen Block:
    init() {
        // ... Ihr bestehender Dropdown Code ...
        // (Falls Sie ihn brauchen, kopiere ich ihn gerne nochmal komplett)
        this.setupListeners();
    },
    setupListeners() {
        const ids = ["#datei", "#edit", "#import", "#help"];
        const contents = ["#dropdownDateiContent", "#dropdownEditContent", "#dropdownImportContent", "#dropdownHelpContent"];
        
        ids.forEach((id, index) => {
            const btn = document.querySelector(id);
            const content = document.querySelector(contents[index]);
            if(btn) btn.addEventListener("click", () => {
                content.classList.toggle("show");
            });
        });
        
        window.addEventListener("click", (e) => {
            if (!e.target.matches('.datei-btn, .edit-btn, .import-btn, .help-btn')) {
                contents.forEach(c => {
                    const el = document.querySelector(c);
                    if(el) el.classList.remove('show');
                });
            }
        });
    }
};

// --- 3. SUCH-MODUL ---
const SearchModule = {
    init() { /* Ihr Such-Code ... */ }
};

// --- 4. SIDEBAR-MODUL ---
const SidebarModule = {
    citationListUl: document.querySelector("#citation-list"),

    init() { /* ... */ },

    parseBibtexKeys(text) {
        const keys = new Set();
        const regex = /@(\w+)/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            keys.add(match[1]);
        }
        return keys;
    },

    updateList(keys) {
        if (!this.citationListUl) return;
        this.citationListUl.innerHTML = "";
        keys.forEach(key => {
            const li = document.createElement("li");
            li.textContent = key;
            li.style.cursor = "pointer";
            li.style.padding = "5px";
            // Klick auf Key springt zur Zeile (Bonus!)
            li.onclick = () => EditorModule.jumpToKey(key); 
            this.citationListUl.appendChild(li);
        });
    }
};

// --- 5. EDITOR-MODUL (CodeMirror 5) ---
const EditorModule = {
    editorInstance: null,

    init() {
        const textarea = document.getElementById("editor-textarea");
        if (!textarea) return;

        // CodeMirror 5 wird aus der Textarea erstellt
        this.editorInstance = CodeMirror.fromTextArea(textarea, {
            lineNumbers: true, // Zeilennummern aktivieren
            mode: "stex",      // LaTeX/BibTeX Modus
            theme: "default"
        });

        // Event-Listener: Wenn sich Text ändert
        this.editorInstance.on("change", (cm) => {
            const currentText = cm.getValue();
            const keys = SidebarModule.parseBibtexKeys(currentText);
            SidebarModule.updateList(keys);
        });

        // Initiales Update
        const initialText = this.editorInstance.getValue();
        SidebarModule.updateList(SidebarModule.parseBibtexKeys(initialText));
    },

    // Helfer: Zum Key springen
    jumpToKey(keyName) {
        if(!this.editorInstance) return;
        const cursor = this.editorInstance.getSearchCursor("@" + keyName);
        if (cursor.findNext()) {
            this.editorInstance.setSelection(cursor.from(), cursor.to());
            this.editorInstance.scrollIntoView(cursor.from(), 200);
        }
    }
};

// Starten
document.addEventListener("DOMContentLoaded", () => {
    App.init();
});