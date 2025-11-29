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
        
        if(form && input) {
            // Live-Suche: Leitet die Eingabe an das SidebarModule weiter
            input.addEventListener("input", (e) => {
                SidebarModule.setSearchTerm(e.target.value);
            });

            // Enter-Taste: Springt zum ersten sichtbaren Eintrag
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                const firstMatch = SidebarModule.getFirstVisibleKey();
                if (firstMatch) {
                    EditorModule.jumpToKey(firstMatch);
                }
            });
        }
    }
};

// --- 4. SIDEBAR-MODUL (Mit Filter & Sortierung) ---
const SidebarModule = {
    citationListUl: document.querySelector("#citation-list"),
    sortSelect: document.querySelector("#selektor"),
    
    // WICHTIG: Wir speichern jetzt Objekte: { key: "beispiel", type: "article" }
    allEntries: [], 
    currentSearch: "",
    currentSort: "original",

    init() { 
        if (!this.citationListUl) return;
        if (this.sortSelect) {
            this.sortSelect.addEventListener("change", (e) => {
                this.setSortMode(e.target.value);
            });
        }
    },

    parseAndRefresh(text) {
        this.allEntries = this.parseBibtexEntries(text);
        this.updateView();
    },

    // NEU: Erweiterter Regex, der Typ UND Key fängt
    parseBibtexEntries(text) {
        const entries = [];
        // Gruppe 1: (\w+) fängt den Typ (z.B. article)
        // Gruppe 2: ([^,]+) fängt den Key
        const regex = /@(\w+)\s*\{\s*([^,]+),/g;
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            entries.push({
                type: match[1].toLowerCase(), // z.B. "article"
                key: match[2].trim()          // z.B. "beispiel"
            });
        }
        return entries;
    },

    setSearchTerm(term) {
        this.currentSearch = term.toLowerCase();
        this.updateView();
    },

    setSortMode(mode) {
        this.currentSort = mode;
        this.updateView();
    },

    updateView() {
        // 1. Filtern (Wir suchen im Key)
        let processed = this.allEntries.filter(entry => 
            entry.key.toLowerCase().includes(this.currentSearch)
        );

        // 2. Sortieren
        if (this.currentSort === 'asc') {
            processed.sort((a, b) => a.key.localeCompare(b.key));
        } 
        else if (this.currentSort === 'desc') {
            processed.sort((a, b) => b.key.localeCompare(a.key));
        } 
        else if (this.currentSort === 'type') {
            // NEU: Sortieren nach Typ, und innerhalb des Typs alphabetisch
            processed.sort((a, b) => {
                const typeCompare = a.type.localeCompare(b.type);
                if (typeCompare !== 0) return typeCompare; // Wenn Typen unterschiedlich, nimm Typ
                return a.key.localeCompare(b.key);         // Wenn Typ gleich, sortiere nach Key
            });
        }
        // bei 'original' passiert nichts

        // 3. Anzeigen
        this.renderList(processed);
    },

    renderList(entriesArray) {
        if (!this.citationListUl) return;
        this.citationListUl.innerHTML = "";
        
        if (entriesArray.length === 0) {
            this.citationListUl.innerHTML = "<li style='padding:5px; color:#aaa;'>Keine Treffer</li>";
            return;
        }

        entriesArray.forEach(entry => {
            const li = document.createElement("li");
            
            // OPTISCHE AUFWERTUNG: Zeige den Typ klein neben dem Key an
            li.innerHTML = `
                <span style="font-weight:bold;">${entry.key}</span>
                <span style="font-size: 0.8em; color: #888; float:right;">${entry.type}</span>
            `;

            li.style.cursor = "pointer";
            li.style.padding = "5px 10px";
            li.style.borderBottom = "1px solid #444";
            li.style.color = "#eee";
            li.style.display = "flex";               // Für schönes Layout
            li.style.justifyContent = "space-between"; // Key links, Typ rechts
            li.style.alignItems = "center";

            // Klick springt zum Key
            li.onclick = () => EditorModule.jumpToKey(entry.key); 
            
            this.citationListUl.appendChild(li);
        });
    },

    getFirstVisibleKey() {
        // Da wir jetzt HTML im LI haben, müssen wir den Key wieder rausfischen
        const firstLi = this.citationListUl.querySelector("li span"); // Das erste Span ist der Key
        return firstLi ? firstLi.textContent : null;
    }
};

// --- EDITOR-MODUL UPDATE (Nur eine kleine Änderung nötig) ---
// Ersetze in EditorModule.init() und beim "change" Event den Aufruf:
/* ALT: 
   const keys = SidebarModule.parseBibtexKeys(text);
   SidebarModule.updateList(keys);

   NEU:
   SidebarModule.parseAndRefresh(text);
*/

const EditorModule = {
    editorInstance: null,

    init() {
        const textarea = document.getElementById("editor-textarea");
        if (!textarea) return;

        this.editorInstance = CodeMirror.fromTextArea(textarea, {
            lineNumbers: true, mode: "stex", theme: "default", lineWrapping: true
        });

        const savedText = localStorage.getItem("editorContent");
        if (savedText) {
            this.editorInstance.setValue(savedText);
            SidebarModule.parseAndRefresh(savedText); // <--- NEU
        } else {
            const initialText = this.editorInstance.getValue();
            SidebarModule.parseAndRefresh(initialText); // <--- NEU
        }

        this.editorInstance.on("change", (cm) => {
            const currentText = cm.getValue();
            localStorage.setItem("editorContent", currentText);
            SidebarModule.parseAndRefresh(currentText); // <--- NEU
        });
    },

    jumpToKey(keyName) {
        if(!this.editorInstance) return;
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
