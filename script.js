/**
 * BIBTEX SMART-EDITOR - GESAMTSKRIPT
 * Erstellt im Rahmen der Bachelorarbeit
 * Arbeitsaufteilung: Alexandros (UI/Layout), Martin (Daten/Parser), Felix (Editor/Tools)
 */

// --- 1. HAUPT-APP (Gemeinsame Orchestrierung) ---
const App = {
    init() {
        console.log("App startet...");
        // Alexandros: Initialisierung der UI-Rahmenkomponenten
        DropdownModule.init();
        ResizerModule.init();
        FileModule.init();

        // Martin: Initialisierung der Such- und Listenlogik
        SearchModule.init();
        SidebarModule.init();

        // Felix: Setup der Editor-Komponenten und Validierung
        EditorModule.init();
        FormatterModule.init();
        LinterModule.init();

        // Alexandros: Automatischer Startzustand - Erstellt einen Tab aus dem Fallback-Textarea
        if (FileModule.files.length === 0) {
            const initialTextElement = document.getElementById("editor-textarea");
            const initialText = initialTextElement ? initialTextElement.value : "";
            FileModule.addFile("Unbenannt.bib", initialText);
            FileModule.switchToTab(FileModule.files[0].id);
        }
    }
};

// --- 2. FORMATTER MODUL (Verantwortung: Felix) ---
const FormatterModule = {
    settingsModal: document.querySelector("#settings-modal"),
    openBtn: document.querySelector("#btn-open-settings"),
    prettyPrintBtn: document.querySelector("#btn-pretty-print"),
    saveBtn: document.querySelector("#btn-save-settings"),
    closeBtn: document.querySelector("#btn-close-settings"),
    checkboxes: document.querySelectorAll(".checkbox-grid input"),
    activeFields: new Set(['author', 'title', 'year', 'journal', 'publisher']),

    init() {
        if (!this.settingsModal) return;
        this.loadSettings();
        this.setupListeners();
    },

    setupListeners() {
        // Felix: Listener für das Modal-Fenster der Formatierungs-Einstellungen
        this.openBtn.addEventListener("click", (e) => {
            e.preventDefault();
            this.settingsModal.classList.add("show-modal");
            document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
        });
        this.closeBtn.addEventListener("click", () => {
            this.settingsModal.classList.remove("show-modal");
        });
        this.saveBtn.addEventListener("click", () => {
            this.saveSettings();
            this.runPrettyPrint();
            this.settingsModal.classList.remove("show-modal");
        });
        if (this.prettyPrintBtn) {
            this.prettyPrintBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.runPrettyPrint();
                document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
            });
        }
    },

    saveSettings() {
        this.activeFields.clear();
        this.checkboxes.forEach(cb => {
            if (cb.checked) {
                this.activeFields.add(cb.getAttribute("data-field"));
            }
        });
        localStorage.setItem("bibFilterConfig", JSON.stringify([...this.activeFields]));
    },

    loadSettings() {
        const saved = localStorage.getItem("bibFilterConfig");
        if (saved) {
            const arr = JSON.parse(saved);
            this.activeFields = new Set(arr);
            this.checkboxes.forEach(cb => {
                const field = cb.getAttribute("data-field");
                cb.checked = this.activeFields.has(field);
            });
        }
    },

    // Felix: Der Pretty Print Algorithmus - formatiert den BibTeX-Inhalt basierend auf gewählten Feldern
    runPrettyPrint() {
        if (!EditorModule.editorInstance) return;
        const originalText = EditorModule.editorInstance.getValue();
        const formattedText = this.formatBibtex(originalText);
        EditorModule.editorInstance.setValue(formattedText);
        console.log("Pretty Print ausgeführt.");
    },

    formatBibtex(text) {
        const entries = [];
        const regexEntry = /@(\w+)\s*\{\s*([^,]+),/g;
        const lines = text.split('\n');
        let newText = "";
        let insideEntry = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            // Felix: Erkennt den Start eines BibTeX-Eintrags
            if (trimmed.startsWith("@")) {
                newText += trimmed + "\n";
                insideEntry = true;
                return;
            }
            // Felix: Erkennt das Ende eines Eintrags
            if (trimmed === "}" && insideEntry) {
                newText += "}\n\n";
                insideEntry = false;
                return;
            }
            // Felix: Formatiert die Key-Value-Paare innerhalb eines Eintrags
            if (insideEntry && trimmed.includes("=")) {
                const parts = trimmed.split("=");
                const key = parts[0].trim().toLowerCase();
                const value = parts.slice(1).join("=").trim();
                if (this.activeFields.has(key)) {
                    newText += `  ${key.padEnd(12)} = ${value}\n`;
                }
                return;
            }
            if (trimmed !== "") {
                newText += line + "\n";
            }
        });
        return newText.trim();
    }
};

// --- 3. FILE MODULE (Verantwortung: Alexandros) ---
const FileModule = {
    files: [],
    activeFileId: null,
    tabContainer: document.querySelector("#tab-bar"),
    fileInput: document.querySelector("#hidden-file-input"),
    folderInput: document.querySelector("#hidden-folder-input"),
    triggerBtn: document.querySelector("#btn-import-file"),
    folderBtn: document.querySelector("#btn-import-folder"),
    newFileBtn: document.querySelector("#menu-new-file"),
    saveBtn: document.querySelector("#btn-save"),
    saveAsBtn: document.querySelector("#btn-save-as"),

    init() {
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
        // Alexandros: Steuerung der Datei-Erstellung und Tabs
        if (this.newFileBtn) {
            this.newFileBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.createNewFile();
                this.closeDropdowns();
            });
        }
        if (this.saveBtn) {
            this.saveBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.saveActiveFile();
                this.closeDropdowns();
            });
        }
        if (this.saveAsBtn) {
            this.saveAsBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.saveAsNewFile();
                this.closeDropdowns();
            });
        }
        // Alexandros: Moderner Datei-Import via File System Access API
        if (this.triggerBtn) {
            this.triggerBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                this.closeDropdowns();
                if (window.showOpenFilePicker) {
                    try {
                        const [handle] = await window.showOpenFilePicker({
                            types: [{
                                description: 'BibTeX / Text Files',
                                accept: { 'text/plain': ['.bib', '.txt'] }
                            }],
                            multiple: false
                        });
                        const file = await handle.getFile();
                        const content = await file.text();
                        this.addFile(file.name, content, handle);
                        if (this.files.length > 0) this.switchToTab(this.files[this.files.length - 1].id);
                    } catch (err) {
                        if (err.name !== 'AbortError') console.error("Öffnen fehlgeschlagen:", err);
                    }
                } else {
                    this.fileInput.value = '';
                    this.fileInput.click();
                }
            });
        }
        if (this.fileInput) {
            this.fileInput.addEventListener("change", (e) => {
                if (e.target.files[0]) this.readFileAndAdd(e.target.files[0]);
            });
        }
        // Alexandros: Unterstützung für Ordner-Import
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

    // Alexandros: Implementierung der Speicherlogik (Direktes Überschreiben via FileHandle)
    async saveActiveFile() {
        const file = this.files.find(f => f.id === this.activeFileId);
        if (!file) return;
        if (EditorModule.editorInstance) {
            file.content = EditorModule.editorInstance.getValue();
        }
        if (file.handle) {
            try {
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
            this.saveAsNewFile();
        }
    },

    async saveAsNewFile() {
        const file = this.files.find(f => f.id === this.activeFileId);
        if (!file) return;
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

    handleFolderUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        let count = 0;
        Array.from(files).forEach(file => {
            if (file.name.endsWith(".bib") || file.name.endsWith(".txt")) {
                this.readFileAndAdd(file);
                count++;
            }
        });
        if (count === 0) alert("Keine .bib Dateien gefunden.");
    },

    readFileAndAdd(fileObj) {
        const reader = new FileReader();
        reader.onload = (e) => {
            this.addFile(fileObj.name, e.target.result, null);
            if (this.files.length === 1) this.switchToTab(this.files[0].id);
            else this.switchToTab(this.files[this.files.length - 1].id);
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
            handle: handle
        };
        this.files.push(newFile);
        this.renderTabs();
    },

    closeDropdowns() {
        document.querySelectorAll(".dropdownDateiClass").forEach(el => el.classList.remove("show"));
    },

    // Alexandros: Management der Tab-Inhalte und Synchronisation mit Editor/Sidebar
    switchToTab(id) {
        const file = this.files.find(f => f.id === id);
        if (!file) return;
        this.activeFileId = id;
        this.renderTabs();
        EditorModule.setContent(file.content);
        SidebarModule.parseAndRefresh(file.content);
    },

    closeFile(id, event) {
        if (event) event.stopPropagation();
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
    },

    // Aktualisiert den Inhalt der aktiven Datei und refresht die Sidebar
    updateActiveFileContent(content) {
        const file = this.files.find(f => f.id === this.activeFileId);
        if (file) {
            file.content = content;
            SidebarModule.parseAndRefresh(content);
        }
    }
};

// --- 4. EDITOR-MODUL (Verantwortung: Felix) ---
const EditorModule = {
    editorInstance: null,
    isProgrammaticUpdate: false,

    init() {
        const textarea = document.getElementById("editor-textarea");
        if (!textarea) return;

        // Felix: Integration von CodeMirror 5 mit stex-Modus und Linter-Anbindung
        this.editorInstance = CodeMirror.fromTextArea(textarea, {
            lineNumbers: true,
            mode: "stex",
            theme: "default",
            lineWrapping: true,
            gutters: ["CodeMirror-lint-markers"],
            lint: true,
            // Felix: Standard-Keymap stellt sicher, dass Ctrl+Z/Y bereits funktioniert
            extraKeys: {
                "Ctrl-Z": (cm) => cm.undo(),
                "Ctrl-Y": (cm) => cm.redo(),
                "Cmd-Z": (cm) => cm.undo(),
                "Cmd-Shift-Z": (cm) => cm.redo()
            }
        });

        this.editorInstance.on("change", (cm) => {
            if (this.isProgrammaticUpdate) return;
            FileModule.updateActiveFileContent(cm.getValue());
        });

        // Felix: Event-Listener für die Menü-Buttons (Undo/Redo)
        this.setupMenuListeners();
    },

    setupMenuListeners() {
        const undoBtn = document.querySelector("#btn-undo");
        const redoBtn = document.querySelector("#btn-redo");

        if (undoBtn) {
            undoBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.undo();
                // Alexandros: Dropdown nach Klick schließen
                document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
            });
        }

        if (redoBtn) {
            redoBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.redo();
                // Alexandros: Dropdown nach Klick schließen
                document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
            });
        }
    },

    // Felix: Manuelles Auslösen der Rückgängig-Funktion
    undo() {
        if (this.editorInstance) {
            this.editorInstance.undo();
            this.editorInstance.focus(); // Fokus zurück in den Editor
        }
    },

    // Felix: Manuelles Auslösen der Wiederholen-Funktion
    redo() {
        if (this.editorInstance) {
            this.editorInstance.redo();
            this.editorInstance.focus();
        }
    },

    setContent(text) {
        if (!this.editorInstance) return;
        this.isProgrammaticUpdate = true;
        this.editorInstance.setValue(text);

        // Felix: Historie beim Laden eines neuen Tabs löschen, 
        // damit man nicht in die Datei davor "zurück-undon" kann.
        this.editorInstance.clearHistory();

        this.isProgrammaticUpdate = false;
    },

    jumpToKey(keyName) {
        if (!this.editorInstance) return;
        const cursor = this.editorInstance.getSearchCursor(keyName);
        if (cursor.findNext()) {
            this.editorInstance.setSelection(cursor.from(), cursor.to());
            this.editorInstance.scrollIntoView(cursor.from(), 200);
            this.editorInstance.focus();
        }
    }
};

// --- 5. SIDEBAR MODULE (Verantwortung: Martin) ---
const SidebarModule = {
    citationListUl: document.querySelector("#citation-list"),
    sortSelect: document.querySelector("#selektor"),
    allEntries: [],
    currentSearch: "",
    currentSort: "original",

    init() {
        if (!this.citationListUl) return;
        // Martin: Listener für Sortier-Änderungen in der Seitenleiste
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

    // Martin: Regex-basierter Parser zur Extraktion von Key, Typ, Autor, Jahr und Link
    parseBibtexEntries(text) {
        const entries = [];
        // Martin: Erkennt komplexe BibTeX-Strukturen via Multiline-Regex
        const entryRegex = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\r?\n\}/g;
        let match;

        while ((match = entryRegex.exec(text)) !== null) {
            const type = match[1].toLowerCase();
            const key = match[2].trim();
            const content = match[3];

            // Martin: Extrahiert Metadaten (Author/Year) aus dem Rumpf des Eintrags
            const authorMatch = content.match(/author\s*=\s*["{]([^"}]*)["}]/i);
            const author = authorMatch ? authorMatch[1] : "Unbekannt";

            const yearMatch = content.match(/year\s*=\s*["{]?(\d{4})["}]?/i);
            const year = yearMatch ? yearMatch[1] : "????";

            // Extrahiert URL oder DOI für einen klickbaren Link
            const urlMatch = content.match(/url\s*=\s*["{]([^"}]*)["}]/i);
            const doiMatch = content.match(/doi\s*=\s*["{]([^"}]*)["}]/i);
            let link = null;
            if (urlMatch) {
                link = urlMatch[1].trim();
            } else if (doiMatch) {
                const doi = doiMatch[1].trim();
                link = doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
            }

            entries.push({ type, key, author, year, link });
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

    // Martin: Verarbeitet Sortierung und Filterung der BibTeX-Liste
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
        // Martin: Generiert die HTML-Elemente für die Listeneinträge in der Top-Bar
        entriesArray.forEach(entry => {
            const li = document.createElement("li");

            // Baut den optionalen Link-Button, falls URL/DOI vorhanden
            const linkHtml = entry.link
                ? `<a href="${entry.link}" target="_blank" rel="noopener noreferrer" class="sidebar-link-btn" title="${entry.link}" style="font-size:0.75em; color:#7abaff; text-decoration:none; margin-left:6px; white-space:nowrap;">🔗 Link</a>`
                : '';

            li.innerHTML = `
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:bold; color: #fff;">${entry.key}${linkHtml}</span>
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

            // stopPropagation auf dem Link, damit nur der Link geöffnet wird
            const anchor = li.querySelector('.sidebar-link-btn');
            if (anchor) {
                anchor.addEventListener('click', (e) => e.stopPropagation());
            }

            // Interaktion: Springt zum entsprechenden Key im Felix-Editor
            li.onclick = () => EditorModule.jumpToKey(entry.key);
            this.citationListUl.appendChild(li);
        });
    },
    getFirstVisibleKey() {
        const firstLi = this.citationListUl.querySelector("li div span");
        return firstLi ? firstLi.textContent : null;
    }
};

// --- 6. RESIZER MODULE (Verantwortung: Alexandros) ---
const ResizerModule = {
    init() {
        const resizer = document.getElementById("resizer");
        const body = document.body;
        let isResizing = false;
        if (!resizer) return;
        // Alexandros: Initialisierung des Resize-Vorgangs (Sidebar/Top-Bar Höhe)
        resizer.addEventListener("mousedown", (e) => {
            isResizing = true;
            body.style.cursor = "row-resize";
            body.style.userSelect = "none";
        });
        window.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            const headerHeight = document.querySelector(".top-nav").offsetHeight;
            let newSidebarHeight = e.clientY - headerHeight;
            // Alexandros: Begrenzung der Resize-Dimensionen
            if (newSidebarHeight < 50) newSidebarHeight = 50;
            if (newSidebarHeight > window.innerHeight * 0.8) newSidebarHeight = window.innerHeight * 0.8;
            body.style.gridTemplateRows = `${headerHeight}px ${newSidebarHeight}px 5px 1fr`;
            // Felix: Refresh des Editors nach Layout-Änderung
            if (EditorModule.editorInstance) EditorModule.editorInstance.refresh();
        });

        window.addEventListener("mouseup", () => {
            isResizing = false;
            body.style.cursor = "default";
            body.style.userSelect = "auto";
        });
    }
};

// --- 7. SEARCH MODULE (Verantwortung: Martin) ---
const SearchModule = {
    init() {
        const form = document.querySelector("#search-form");
        const input = document.querySelector("#input1");
        if (form && input) {
            // Martin: Reagiert auf Tastatureingaben für die Filterung
            input.addEventListener("input", (e) => SidebarModule.setSearchTerm(e.target.value));
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                const key = SidebarModule.getFirstVisibleKey();
                if (key) EditorModule.jumpToKey(key);
            });
        }
    }
};

// --- 8. DROPDOWN MODULE (Verantwortung: Alexandros) ---
const DropdownModule = {
    init() { this.setupListeners(); },
    setupListeners() {
        const ids = ["#datei", "#edit", "#import", "#help"];
        const contents = ["#dropdownDateiContent", "#dropdownEditContent", "#dropdownImportContent", "#dropdownHelpContent"];
        ids.forEach((id, index) => {
            const btn = document.querySelector(id);
            const content = document.querySelector(contents[index]);
            if (btn && content) {
                // Alexandros: Steuerung der Dropdown-Menüs im Header
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    contents.forEach((c, cIndex) => {
                        if (cIndex !== index) document.querySelector(c)?.classList.remove('show');
                    });
                    content.classList.toggle("show");
                });
            }
        });
        window.addEventListener("click", (e) => {
            if (!e.target.matches('.datei-btn, .edit-btn, .import-btn, .help-btn') &&
                !e.target.closest('.dropdownDateiClass, .dropdownEditClass, .dropdownImportClass, .dropdownHelpClass')) {
                contents.forEach(c => document.querySelector(c)?.classList.remove('show'));
            }
        });
    }
};

// --- 9. LINTER MODULE (Verantwortung: Felix) ---
const LinterModule = {
    validTypes: [
        "article", "book", "booklet", "conference", "inbook",
        "incollection", "inproceedings", "manual", "mastersthesis",
        "misc", "phdthesis", "proceedings", "techreport", "unpublished"
    ],
    validFields: [
        "address", "annote", "author", "booktitle", "chapter", "crossref",
        "edition", "editor", "howpublished", "institution", "journal",
        "key", "month", "note", "number", "organization", "pages",
        "publisher", "school", "series", "title", "type", "volume", "year",
        "doi", "isbn", "issn", "url", "abstract", "keywords", "eprint",
        "numpages", "location", "issue_date"
    ],
    init() {
        // Felix: Integriert den Linter in die CodeMirror stex Umgebung
        CodeMirror.registerHelper("lint", "stex", (text) => {
            return this.validate(text);
        });
    },
    validate(text) {
        const errors = [];
        const lines = text.split("\n");
        const entryStartRegex = /^\s*@(\w+)\s*\{/;
        const fieldRegex = /^\s*(OPT)?(\w+)\s*=/;
        let openBraces = 0;
        lines.forEach((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (trimmed.startsWith("%")) return;
            // Felix: Prüft auf korrekte BibTeX-Eintragstypen
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
            // Felix: Prüft auf korrekte Feldnamen und fehlende Kommata
            if (!trimmed.startsWith("@") && trimmed.includes("=")) {
                const fieldMatch = trimmed.match(fieldRegex);
                if (fieldMatch) {
                    const fieldName = fieldMatch[2].toLowerCase();
                    if (!this.validFields.includes(fieldName)) {
                        const startCol = line.indexOf(fieldMatch[2]);
                        errors.push({
                            from: CodeMirror.Pos(i, startCol),
                            to: CodeMirror.Pos(i, startCol + fieldName.length),
                            message: `Unbekanntes Feld: "${fieldName}".`,
                            severity: "warning"
                        });
                    }
                    if (!trimmed.endsWith(",") && !trimmed.endsWith("}")) {
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
                    errors.push({
                        from: CodeMirror.Pos(i, 0),
                        to: CodeMirror.Pos(i, line.length),
                        message: "Syntaxfehler: Unerwartetes Format bei Zuweisung.",
                        severity: "error"
                    });
                }
            }
            // Felix: Einfache Prüfung der Klammer-Balance
            const opens = (line.match(/\{/g) || []).length;
            const closes = (line.match(/\}/g) || []).length;
            openBraces += (opens - closes);
        });
        if (openBraces !== 0) {
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

