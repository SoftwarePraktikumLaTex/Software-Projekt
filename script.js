// --- 1. HAUPT-APP ---
const App = {
    init() {
        DropdownModule.init();
        SearchModule.init();
        SidebarModule.init();
        EditorModule.init(); 
        console.log("Anwendung (CM5 + Features der Kollegen) initialisiert.");
    }
};

const DropdownModule = {
    init() {
        this.setupListeners();
    },
    setupListeners() {
        const ids = ["#datei", "#edit", "#import", "#help"];
        const contents = ["#dropdownDateiContent", "#dropdownEditContent", "#dropdownImportContent", "#dropdownHelpContent"];
        
        // Buttons: Klick öffnet/schließt
        ids.forEach((id, index) => {
            const btn = document.querySelector(id);
            const content = document.querySelector(contents[index]);
            
            if(btn && content) {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation(); // WICHTIG: Verhindert, dass der Klick sofort an "window" weitergegeben wird
                    
                    // Alle ANDEREN schließen
                    contents.forEach((c, cIndex) => {
                        if(cIndex !== index) {
                            const el = document.querySelector(c);
                            if(el) el.classList.remove('show');
                        }
                    });
                    
                    // Das AKTUELLE umschalten
                    content.classList.toggle("show");
                });
            }
        });
        
        // Window: Klick außerhalb schließt alles
        window.addEventListener("click", (e) => {
            // Prüfen: War der Klick auf einem Button?
            const isButton = e.target.matches('.datei-btn, .edit-btn, .import-btn, .help-btn');
            
            // Prüfen: War der Klick INNERHALB eines offenen Menüs?
            // (Das fehlte vorher, weshalb es sich sofort geschlossen hat)
            const isInsideMenu = e.target.closest('.dropdownDateiClass, .dropdownEditClass, .dropdownImportClass, .dropdownHelpClass');

            // Nur schließen, wenn man WEDER auf Button NOCH ins Menü geklickt hat
            if (!isButton && !isInsideMenu) {
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
    init() {
        const form = document.querySelector("#search-form");
        const input = document.querySelector("#input1");
        
        if(form) {
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                console.log("Suche nach:", input.value);
            });
        }
    }
};

// --- 4. SIDEBAR-MODUL ---
const SidebarModule = {
    citationListUl: document.querySelector("#citation-list"),

    init() { 
        if (!this.citationListUl) console.warn("Sidebar Liste nicht gefunden");
    },

    // Extrahiert BibTeX Keys (z.B. @article{meinKey,)
    // Regex der Kollegen übernommen und leicht robuster gemacht
    parseBibtexKeys(text) {
        const keys = new Set();
        // Sucht nach @typ{key,
        const regex = /@\w+\s*\{\s*([^,]+),/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            keys.add(match[1].trim());
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
            li.style.borderBottom = "1px solid #444";
            li.style.color = "white"; // Passend zum dunklen Sidebar-Thema
            
            // Klick auf Key springt zur Zeile im Editor
            li.onclick = () => EditorModule.jumpToKey(key); 
            
            this.citationListUl.appendChild(li);
        });
    }
};

// --- 5. EDITOR-MODUL (CodeMirror 5 + LocalStorage) ---
const EditorModule = {
    editorInstance: null,

    init() {
        const textarea = document.getElementById("editor-textarea");
        if (!textarea) return;

        // 1. CodeMirror initialisieren
        this.editorInstance = CodeMirror.fromTextArea(textarea, {
            lineNumbers: true,
            mode: "stex",      // LaTeX Modus
            theme: "default",
            lineWrapping: true
        });

        // 2. LocalStorage Feature der Kollegen integrieren
        // Prüfen, ob gespeicherter Text existiert
        const savedText = localStorage.getItem("editorContent");
        if (savedText) {
            this.editorInstance.setValue(savedText);
            // Sidebar direkt aktualisieren
            const keys = SidebarModule.parseBibtexKeys(savedText);
            SidebarModule.updateList(keys);
        } else {
            // Falls nichts gespeichert ist, Initial-Scan des Default-Textes
            const initialText = this.editorInstance.getValue();
            SidebarModule.updateList(SidebarModule.parseBibtexKeys(initialText));
        }

        // 3. Event-Listener
        this.editorInstance.on("change", (cm) => {
            const currentText = cm.getValue();
            
            // Speichern im LocalStorage (Feature der Kollegen)
            localStorage.setItem("editorContent", currentText);
            
            // Sidebar updaten
            const keys = SidebarModule.parseBibtexKeys(currentText);
            SidebarModule.updateList(keys);
        });
    },

    // Helfer: Zum Key springen
    jumpToKey(keyName) {
        if(!this.editorInstance) return;
        
        // Suche nach dem Key im Text
        const cursor = this.editorInstance.getSearchCursor(keyName);
        if (cursor.findNext()) {
            this.editorInstance.setSelection(cursor.from(), cursor.to());
            this.editorInstance.scrollIntoView(cursor.from(), 200);
            this.editorInstance.focus();
        }
    }
};

// Starten
document.addEventListener("DOMContentLoaded", () => {
    App.init();
});