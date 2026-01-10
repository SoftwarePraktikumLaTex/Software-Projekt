// --- 1. HAUPT-APP ---
const App = {
    init() {
        console.log("App startet...");
        DropdownModule.init();
        SearchModule.init();
        SidebarModule.init();
        
        FileModule.init();   
        EditorModule.init(); 
        ResizerModule.init();
        FormatterModule.init();

        // WICHTIG: START-ZUSTAND HERSTELLEN
        // Wenn noch keine Dateien im System sind (Standard beim Neuladen),
        // nehmen wir den Text aus dem HTML-Textarea und machen ihn zum ersten Tab.
        if (FileModule.files.length === 0) {
            const initialTextElement = document.getElementById("editor-textarea");
            const initialText = initialTextElement ? initialTextElement.value : "";
            
            // Datei erstellen und sofort anzeigen
            FileModule.addFile("Unbenannt.bib", initialText);
            FileModule.switchToTab(FileModule.files[0].id);
        }
    }
};
// --- NEU: FORMATTER MODUL (Pretty Print & Settings) ---
const FormatterModule = {
    // DOM Elemente
    settingsModal: document.querySelector("#settings-modal"),
    openBtn: document.querySelector("#btn-open-settings"),
    prettyPrintBtn: document.querySelector("#btn-pretty-print"),
    saveBtn: document.querySelector("#btn-save-settings"),
    closeBtn: document.querySelector("#btn-close-settings"),
    checkboxes: document.querySelectorAll(".checkbox-grid input"),

    // Standard-Konfiguration (wird überschrieben)
    activeFields: new Set(['author', 'title', 'year', 'journal', 'publisher']),

    init() {
        if (!this.settingsModal) return;

        this.loadSettings(); // Gespeicherte Einstellungen laden
        this.setupListeners();
    },

    setupListeners() {
        // 1. Modal öffnen
        this.openBtn.addEventListener("click", (e) => {
            e.preventDefault();
            this.settingsModal.classList.add("show-modal");
            // Dropdowns schließen
            document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
        });

        // 2. Modal schließen (Abbrechen)
        this.closeBtn.addEventListener("click", () => {
            this.settingsModal.classList.remove("show-modal");
        });

        // 3. Speichern & Formatieren
        this.saveBtn.addEventListener("click", () => {
            this.saveSettings();
            this.runPrettyPrint();
            this.settingsModal.classList.remove("show-modal");
        });

        // 4. Nur "Aufräumen" klicken (ohne Einstellungen zu öffnen)
        if (this.prettyPrintBtn) {
            this.prettyPrintBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.runPrettyPrint();
                 // Dropdowns schließen
                 document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
            });
        }
    },

    // --- Logik: Einstellungen speichern/laden ---
    saveSettings() {
        this.activeFields.clear();
        this.checkboxes.forEach(cb => {
            if (cb.checked) {
                this.activeFields.add(cb.getAttribute("data-field"));
            }
        });
        // Im LocalStorage speichern (als Array, weil Set nicht speicherbar ist)
        localStorage.setItem("bibFilterConfig", JSON.stringify([...this.activeFields]));
    },

    loadSettings() {
        const saved = localStorage.getItem("bibFilterConfig");
        if (saved) {
            const arr = JSON.parse(saved);
            this.activeFields = new Set(arr);
            // Checkboxen im Modal aktualisieren
            this.checkboxes.forEach(cb => {
                const field = cb.getAttribute("data-field");
                cb.checked = this.activeFields.has(field);
            });
        }
    },

    // --- Logik: Der eigentliche Pretty Print Algorithmus ---
    runPrettyPrint() {
        if (!EditorModule.editorInstance) return;

        const originalText = EditorModule.editorInstance.getValue();
        const formattedText = this.formatBibtex(originalText);
        
        EditorModule.editorInstance.setValue(formattedText);
        console.log("Pretty Print ausgeführt.");
    },

    formatBibtex(text) {
        // 1. Wir zerlegen den Text in einzelne Einträge (Split bei @)
        // Wir nutzen Regex, um den Eintragstyp und den Key zu finden
        const entries = [];
        const regexEntry = /@(\w+)\s*\{\s*([^,]+),/g;
        
        // Da Parsing komplex ist, machen wir hier einen robusten Zeilen-basierten Ansatz
        const lines = text.split('\n');
        let newText = "";
        let insideEntry = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            
            // Fall A: Neuer Eintrag beginnt (z.B. @article{key,)
            if (trimmed.startsWith("@")) {
                newText += trimmed + "\n";
                insideEntry = true;
                return;
            }

            // Fall B: Eintrag endet (})
            if (trimmed === "}" && insideEntry) {
                newText += "}\n\n"; // Leerzeile nach Eintrag
                insideEntry = false;
                return;
            }

            // Fall C: Ein Feld (z.B. author = "Name",)
            if (insideEntry && trimmed.includes("=")) {
                // Wir splitten am ersten Gleichzeichen
                const parts = trimmed.split("=");
                const key = parts[0].trim().toLowerCase();
                // Rest der Zeile ist der Wert
                const value = parts.slice(1).join("=").trim(); 

                // HIER IST DER FILTER:
                // Wenn das Feld in unseren aktiven Einstellungen ist, schreiben wir es hin.
                if (this.activeFields.has(key)) {
                    // Pretty Print: 2 Leerzeichen Einrückung
                    newText += `  ${key.padEnd(12)} = ${value}\n`;
                }
                return;
            }

            // Fall D: Sonstiges (Kommentare oder kaputte Zeilen) - einfach behalten
            if (trimmed !== "") {
                newText += line + "\n";
            }
        });

        return newText.trim();
    }
};

// --- 2. FILE MODULE (Mit echtem Überschreiben) ---
const FileModule = {
    files: [], 
    activeFileId: null,
    
    // UI Elemente
    tabContainer: document.querySelector("#tab-bar"),
    
    // Inputs (nur noch als Fallback oder für Ordner nötig)
    fileInput: document.querySelector("#hidden-file-input"),
    folderInput: document.querySelector("#hidden-folder-input"),
    
    // Buttons
    triggerBtn: document.querySelector("#btn-import-file"), 
    folderBtn: document.querySelector("#btn-import-folder"),
    newFileBtn: document.querySelector("#menu-new-file"),
    
    saveBtn: document.querySelector("#btn-save"),
    saveAsBtn: document.querySelector("#btn-save-as"),

    init() {
        // Elemente neu holen
        this.tabContainer = document.querySelector("#tab-bar");
        this.fileInput = document.querySelector("#hidden-file-input");
        this.folderInput = document.querySelector("#hidden-folder-input");
        this.triggerBtn = document.querySelector("#btn-import-file");
        this.folderBtn = document.querySelector("#btn-import-folder");
        this.newFileBtn = document.querySelector("#menu-new-file");
        this.saveBtn = document.querySelector("#btn-save");
        this.saveAsBtn = document.querySelector("#btn-save-as");

        this.setupListeners();
    },

    setupListeners() {
        // --- NEUE DATEI ---
        if (this.newFileBtn) {
            this.newFileBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.createNewFile();
                this.closeDropdowns();
            });
        }

        // --- SPEICHERN (Überschreiben) ---
        if (this.saveBtn) {
            this.saveBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.saveActiveFile(); 
                this.closeDropdowns();
            });
        }

        // --- SPEICHERN UNTER (Immer neu) ---
        if (this.saveAsBtn) {
            this.saveAsBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.saveAsNewFile(); // Erzwingt Dialog
                this.closeDropdowns();
            });
        }

        // --- DATEI ÖFFNEN (MODERN) ---
        if (this.triggerBtn) {
            this.triggerBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                this.closeDropdowns();

                // Check: Kann der Browser die moderne API?
                if (window.showOpenFilePicker) {
                    try {
                        // 1. Datei auswählen lassen und Handle holen
                        const [handle] = await window.showOpenFilePicker({
                            types: [{
                                description: 'BibTeX / Text Files',
                                accept: { 'text/plain': ['.bib', '.txt'] }
                            }],
                            multiple: false
                        });

                        // 2. Datei lesen
                        const file = await handle.getFile();
                        const content = await file.text();

                        // 3. Mit Handle speichern!
                        this.addFile(file.name, content, handle);
                        
                        // Zum Tab wechseln
                        if (this.files.length > 0) this.switchToTab(this.files[this.files.length - 1].id);

                    } catch (err) {
                        // User hat abgebrochen
                        if (err.name !== 'AbortError') console.error("Öffnen fehlgeschlagen:", err);
                    }
                } else {
                    // Fallback für alte Browser (ohne Schreibrechte)
                    this.fileInput.value = ''; 
                    this.fileInput.click();
                }
            });
        }

        // Fallback-Listener für Input (falls alte Browser genutzt werden)
        if (this.fileInput) {
            this.fileInput.addEventListener("change", (e) => {
                if (e.target.files[0]) this.readFileAndAdd(e.target.files[0]);
            });
        }

        // --- ORDNER ÖFFNEN ---
        // (Ordner geben leider selten Schreibrechte zurück, hier bleibt oft "Speichern unter" nötig)
        if (this.folderBtn && this.folderInput) {
            this.folderBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.folderInput.value = ''; 
                this.folderInput.click();
                this.closeDropdowns();
            });
            this.folderInput.addEventListener("change", (e) => this.handleFolderUpload(e));
        }
    },

    // --- LOGIK: SPEICHERN ---
    async saveActiveFile() {
        const file = this.files.find(f => f.id === this.activeFileId);
        if (!file) return;

        // Editor Inhalt holen
        if (EditorModule.editorInstance) {
            file.content = EditorModule.editorInstance.getValue();
        }

        // ENTSCHEIDUNG: Haben wir den Schlüssel (Handle)?
        if (file.handle) {
            // JA -> Überschreiben
            try {
                // Erstellt einen Schreiber
                const writable = await file.handle.createWritable();
                await writable.write(file.content);
                await writable.close();
                console.log("Erfolgreich überschrieben:", file.name);
                alert(`"${file.name}" gespeichert!`);
            } catch (err) {
                console.error("Fehler beim Überschreiben:", err);
                alert("Fehler beim Speichern. Versuche 'Speichern unter'.");
            }
        } else {
            // NEIN -> Wir müssen fragen (Dialog)
            // Das passiert bei neuen Dateien oder Dateien aus Ordner-Import
            this.saveAsNewFile();
        }
    },

    // --- LOGIK: SPEICHERN UNTER ---
    async saveAsNewFile() {
        const file = this.files.find(f => f.id === this.activeFileId);
        if (!file) return;

        // Inhalt holen
        if (EditorModule.editorInstance) file.content = EditorModule.editorInstance.getValue();

        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: file.name,
                    types: [{
                        description: 'BibTeX File',
                        accept: { 'text/plain': ['.bib', '.txt'] },
                    }],
                });
                
                const writable = await handle.createWritable();
                await writable.write(file.content);
                await writable.close();

                // Ab JETZT haben wir den Schlüssel für diese neue Datei
                file.handle = handle;
                file.name = handle.name; 
                
                this.renderTabs(); 
                alert("Gespeichert!");

            } catch (err) { /* Abbruch */ }
        } else {
            this.legacyDownload(file.name, file.content);
        }
    },

    legacyDownload(filename, content) {
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    },

    // --- HELFER & IMPORT LOGIK ---
    handleFolderUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        let count = 0;
        Array.from(files).forEach(file => {
            if (file.name.endsWith(".bib") || file.name.endsWith(".txt")) {
                this.readFileAndAdd(file); // Ordner-Dateien haben KEIN Handle -> müssen beim ersten Mal "Speichern unter" machen
                count++;
            }
        });
        if(count === 0) alert("Keine .bib Dateien gefunden.");
    },

    readFileAndAdd(fileObj) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.addFile(fileObj.name, e.target.result, null);
            if (this.files.length === 1) this.switchToTab(this.files[0].id);
            else this.switchToTab(this.files[this.files.length-1].id);
        };
        reader.readAsText(fileObj);
    },

    createNewFile() {
        const name = `Unbenannt_${this.files.length + 1}.bib`;
        this.addFile(name, "", null);
        this.switchToTab(this.files[this.files.length - 1].id);
    },

    addFile(name, content, handle = null) {
        const newFile = {
            id: 'file_' + Date.now() + Math.random().toString(36).substr(2, 9),
            name: name,
            content: content,
            handle: handle // Hier landet der Schlüssel!
        };
        this.files.push(newFile);
        this.renderTabs();
    },

    closeDropdowns() {
        document.querySelectorAll(".dropdownDateiClass").forEach(el => el.classList.remove("show"));
    },

    switchToTab(id) {
        const file = this.files.find(f => f.id === id);
        if (!file) return;
        this.activeFileId = id;
        this.renderTabs();
        EditorModule.setContent(file.content);
        SidebarModule.parseAndRefresh(file.content);
    },

    closeFile(id, event) {
        if(event) event.stopPropagation();
        this.files = this.files.filter(f => f.id !== id);
        if (this.activeFileId === id) {
            if (this.files.length > 0) this.switchToTab(this.files[this.files.length - 1].id);
            else {
                this.addFile("Unbenannt.bib", "", null);
                this.switchToTab(this.files[0].id);
            }
        } else {
            this.renderTabs();
        }
    },

    renderTabs() {
        if (!this.tabContainer) return;
        this.tabContainer.innerHTML = "";
        this.files.forEach(file => {
            const tab = document.createElement("div");
            tab.className = `tab ${file.id === this.activeFileId ? 'active' : ''}`;
            const span = document.createElement("span");
            span.textContent = file.name; 
            tab.appendChild(span);
            const closeBtn = document.createElement("span");
            closeBtn.className = "tab-close";
            closeBtn.innerHTML = "&times;";
            closeBtn.onclick = (e) => this.closeFile(file.id, e);
            tab.appendChild(closeBtn);
            tab.onclick = () => this.switchToTab(file.id);
            this.tabContainer.appendChild(tab);
        });
    }
};
// --- 3. EDITOR MODULE ---
const EditorModule = {
    editorInstance: null,
    isProgrammaticUpdate: false, 

    init() {
        const textarea = document.getElementById("editor-textarea");
        if (!textarea) return;

        this.editorInstance = CodeMirror.fromTextArea(textarea, {
            lineNumbers: true, 
            mode: "stex", 
            theme: "default", 
            lineWrapping: true,
            // --- NEU FÜR VALIDIERUNG ---
            gutters: ["CodeMirror-lint-markers"], // Platz für rote Punkte links
            lint: true                            // Aktiviert das LinterModule
        });

        this.editorInstance.on("change", (cm) => {
            if (this.isProgrammaticUpdate) return;
            const content = cm.getValue();
            FileModule.updateActiveFileContent(content);
        });
    },

    setContent(text) {
        if(!this.editorInstance) return;
        this.isProgrammaticUpdate = true; 
        this.editorInstance.setValue(text);
        this.editorInstance.clearHistory(); 
        this.isProgrammaticUpdate = false; 
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

// --- 4. SIDEBAR MODULE ---
const SidebarModule = {
    citationListUl: document.querySelector("#citation-list"),
    sortSelect: document.querySelector("#selektor"),
    
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

    parseBibtexEntries(text) {
        const entries = [];
        const entryRegex = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\n\}/g;
        let match;
        
        while ((match = entryRegex.exec(text)) !== null) {
            const type = match[1].toLowerCase();
            const key = match[2].trim();
            const content = match[3];

            const authorMatch = content.match(/author\s*=\s*["{]([^"}]*)["}]/i);
            const author = authorMatch ? authorMatch[1] : "Unbekannt";

            const yearMatch = content.match(/year\s*=\s*["{]?(\d{4})["}]?/i);
            const year = yearMatch ? yearMatch[1] : "????";

            entries.push({ type, key, author, year });
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
        let processed = this.allEntries.filter(entry => 
            entry.key.toLowerCase().includes(this.currentSearch) ||
            entry.author.toLowerCase().includes(this.currentSearch)
        );

        if (this.currentSort === 'asc') {
            processed.sort((a, b) => a.key.localeCompare(b.key));
        } else if (this.currentSort === 'desc') {
            processed.sort((a, b) => b.key.localeCompare(a.key));
        } else if (this.currentSort === 'type') {
            processed.sort((a, b) => a.type.localeCompare(b.type) || a.key.localeCompare(b.key));
        } else if (this.currentSort === 'author') {
            processed.sort((a, b) => a.author.localeCompare(b.author));
        } else if (this.currentSort === 'year') {
            processed.sort((a, b) => b.year - a.year); 
        }

        this.renderList(processed);
    },

    renderList(entriesArray) {
        if (!this.citationListUl) return;
        this.citationListUl.innerHTML = "";
        
        if (entriesArray.length === 0) {
            this.citationListUl.innerHTML = "<li style='padding:10px; color:#aaa;'>Keine Treffer</li>";
            return;
        }

        entriesArray.forEach(entry => {
            const li = document.createElement("li");
            li.innerHTML = `
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:bold; color: #fff;">${entry.key}</span>
                    <span style="font-size: 0.85em; color: #bbb;">${entry.author} (${entry.year})</span>
                </div>
                <span style="font-size: 0.7em; background: #444; padding: 2px 6px; border-radius: 4px; color: #ccc;">${entry.type}</span>
            `;

            li.style.cursor = "pointer";
            li.style.padding = "8px 15px"; 
            li.style.borderBottom = "1px solid #444";
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";

            li.onclick = () => EditorModule.jumpToKey(entry.key); 
            this.citationListUl.appendChild(li);
        });
    },

    getFirstVisibleKey() {
        const firstLi = this.citationListUl.querySelector("li div span"); 
        return firstLi ? firstLi.textContent : null;
    }
};

// --- 5. RESIZER MODULE ---
const ResizerModule = {
    init() {
        const resizer = document.getElementById("resizer");
        const body = document.body;
        let isResizing = false;

        if (!resizer) return;

        resizer.addEventListener("mousedown", (e) => {
            isResizing = true;
            body.style.cursor = "row-resize";
            body.style.userSelect = "none"; 
        });

        window.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            const headerHeight = document.querySelector(".top-nav").offsetHeight;
            let newSidebarHeight = e.clientY - headerHeight;
            if (newSidebarHeight < 50) newSidebarHeight = 50;
            if (newSidebarHeight > window.innerHeight * 0.8) newSidebarHeight = window.innerHeight * 0.8;
            body.style.gridTemplateRows = `${headerHeight}px ${newSidebarHeight}px 5px 1fr`;
            if (EditorModule.editorInstance) EditorModule.editorInstance.refresh();
        });

        window.addEventListener("mouseup", () => {
            isResizing = false;
            body.style.cursor = "default";
            body.style.userSelect = "auto";
        });
    }
};

// --- 6. SEARCH & DROPDOWN (Fixed) ---
const SearchModule = {
    init() {
        const form = document.querySelector("#search-form");
        const input = document.querySelector("#input1");
        if(form && input) {
            input.addEventListener("input", (e) => SidebarModule.setSearchTerm(e.target.value));
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                const key = SidebarModule.getFirstVisibleKey();
                if (key) EditorModule.jumpToKey(key);
            });
        }
    }
};

const DropdownModule = {
    init() { this.setupListeners(); },
    setupListeners() {
        const ids = ["#datei", "#edit", "#import", "#help"];
        const contents = ["#dropdownDateiContent", "#dropdownEditContent", "#dropdownImportContent", "#dropdownHelpContent"];
        
        ids.forEach((id, index) => {
            const btn = document.querySelector(id);
            const content = document.querySelector(contents[index]);
            if(btn && content) {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    // Alle anderen schließen
                    contents.forEach((c, cIndex) => {
                        if(cIndex !== index) document.querySelector(c)?.classList.remove('show');
                    });
                    content.classList.toggle("show");
                });
            }
        });

        // Fenster Klick schließt alles
        window.addEventListener("click", (e) => {
            if (!e.target.matches('.datei-btn, .edit-btn, .import-btn, .help-btn') && 
                !e.target.closest('.dropdownDateiClass, .dropdownEditClass, .dropdownImportClass, .dropdownHelpClass')) {
                contents.forEach(c => document.querySelector(c)?.classList.remove('show'));
            }
        });
    }
};

// --- 7. LINTER MODULE (Syntax Check) ---
const LinterModule = {
    // Erlaubte BibTeX-Typen (alles in Kleinbuchstaben)
    validTypes: [
        "article", "book", "booklet", "conference", "inbook",
        "incollection", "inproceedings", "manual", "mastersthesis",
        "misc", "phdthesis", "proceedings", "techreport", "unpublished"
    ],

    // Erlaubte Felder
    validFields: [
        "address", "annote", "author", "booktitle", "chapter", "crossref",
        "edition", "editor", "howpublished", "institution", "journal",
        "key", "month", "note", "number", "organization", "pages",
        "publisher", "school", "series", "title", "type", "volume", "year",
        "doi", "isbn", "issn", "url", "abstract", "keywords", "eprint",
        "numpages", "location", "issue_date"
    ],

    init() {
        // Wir registrieren eine Hilfsfunktion für CodeMirror
        CodeMirror.registerHelper("lint", "stex", (text) => {
            return this.validate(text);
        });
    },

    validate(text) {
        const errors = [];
        const lines = text.split("\n");
        
        // Regex für den Start eines Eintrags: @type{key,
        const entryStartRegex = /^\s*@(\w+)\s*\{/;
        
        // Regex für ein Feld: feldname = ...
        // Wir fangen das Wort vor dem Gleichzeichen
        const fieldRegex = /^\s*(OPT)?(\w+)\s*=/; 

        // Klammer-Zähler (einfach)
        let openBraces = 0;

        lines.forEach((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return; // Leere Zeilen ignorieren
            if (trimmed.startsWith("%")) return; // Kommentare ignorieren

            // 1. CHECK: Ungültiger Typ (z.B. @artile)
            const typeMatch = trimmed.match(entryStartRegex);
            if (typeMatch) {
                const type = typeMatch[1].toLowerCase();
                if (!this.validTypes.includes(type)) {
                    errors.push({
                        from: CodeMirror.Pos(i, line.indexOf(typeMatch[1])),
                        to: CodeMirror.Pos(i, line.indexOf(typeMatch[1]) + typeMatch[1].length),
                        message: `Unbekannter Eintragstyp: "@${type}". Meinten Sie "@article"?`,
                        severity: "error"
                    });
                }
            }

            // 2. CHECK: Ungültiges Feld (z.B. titel =)
            // Nur prüfen, wenn die Zeile nicht mit @ beginnt und ein = enthält
            if (!trimmed.startsWith("@") && trimmed.includes("=")) {
                const fieldMatch = trimmed.match(fieldRegex);
                if (fieldMatch) {
                    // fieldMatch[1] ist das optionale "OPT", fieldMatch[2] ist der Name
                    const fieldName = fieldMatch[2].toLowerCase();
                    
                    // Prüfen, ob das Feld in der Liste ist
                    if (!this.validFields.includes(fieldName)) {
                        const startCol = line.indexOf(fieldMatch[2]);
                        errors.push({
                            from: CodeMirror.Pos(i, startCol),
                            to: CodeMirror.Pos(i, startCol + fieldName.length),
                            message: `Unbekanntes Feld: "${fieldName}".`,
                            severity: "warning"
                        });
                    }

                    // 3. CHECK: Komma vergessen?
                    // Wenn die Zeile auf '}' oder '"' endet, aber kein Komma hat (und nicht die letzte Zeile ist)
                    // Dies ist eine Heuristik, BibTeX ist hier flexibel, aber wir warnen lieber einmal zu viel.
                    if (!trimmed.endsWith(",") && !trimmed.endsWith("}")) {
                         // Wir checken nur einfache Fälle, wo der Wert in einer Zeile steht
                         if (trimmed.match(/=.*[\"\}]$/)) {
                            errors.push({
                                from: CodeMirror.Pos(i, line.length - 1),
                                to: CodeMirror.Pos(i, line.length),
                                message: "Fehlendes Komma am Zeilenende?",
                                severity: "warning"
                            });
                         }
                    }
                } else {
                    // Enthält ein =, aber passt nicht zum Muster "key = value"
                    // Könnte Syntaxfehler sein
                    errors.push({
                        from: CodeMirror.Pos(i, 0),
                        to: CodeMirror.Pos(i, line.length),
                        message: "Syntaxfehler: Unerwartetes Format bei Zuweisung.",
                        severity: "error"
                    });
                }
            }

            // 4. CHECK: Klammern zählen (Grob-Check)
            // Zählt { und } in der Zeile
            const opens = (line.match(/\{/g) || []).length;
            const closes = (line.match(/\}/g) || []).length;
            openBraces += (opens - closes);
        });

        // 5. CHECK: Globaler Klammer-Status
        if (openBraces !== 0) {
            // Wir markieren einfach die letzte Zeile, wenn Klammern fehlen
            errors.push({
                from: CodeMirror.Pos(lines.length - 1, 0),
                to: CodeMirror.Pos(lines.length - 1, lines[lines.length - 1].length),
                message: `Klammern sind nicht ausgeglichen! (Offen: ${openBraces})`,
                severity: "error"
            });
        }

        return errors;
    }
};

// Starten
document.addEventListener("DOMContentLoaded", () => {
    LinterModule.init();
    App.init();
});

