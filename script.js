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
        ImportModule.init();

        // Felix: Setup der Editor-Komponenten und Validierung
        EditorModule.init();
        FormatterModule.init();
        LinterModule.init();
        ThemeModule.init();

        // Clipboard-Watcher (optional, falls vorhanden)
        if (typeof ClipboardModule !== 'undefined') ClipboardModule.init();

        // Alexandros: Automatischer Startzustand - Erstellt einen Tab aus dem Fallback-Textarea
        if (FileModule.files.length === 0) {
            const initialTextElement = document.getElementById("editor-textarea");
            const initialText = initialTextElement ? initialTextElement.value : "";
            FileModule.addFile("Unbenannt.bib", initialText);
            FileModule.switchToTab(FileModule.files[0].id);
        }
    },
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

    // FIX: BUG-2 behoben – Parser splittet nur am ersten '=' nach einem Feldnamen,
    // sodass '=' innerhalb von Werten (URLs, mehrzeilige Strings) nicht zerstört werden.
    formatBibtex(text) {
        const lines = text.split('\n');
        let newText = "";
        let insideEntry = false;
        // Regex erkennt nur echte BibTeX-Felder: optionales OPT-Prefix, dann Buchstabe gefolgt von Wortzeichen
        const fieldAssignRegex = /^\s*(?:OPT)?([a-zA-Z][a-zA-Z0-9_]*)\s*=/;

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
            if (insideEntry) {
                const fieldMatch = trimmed.match(fieldAssignRegex);
                if (fieldMatch) {
                    const key = fieldMatch[1].toLowerCase();
                    // FIX: BUG-2 – Split nur am Index des ersten '=' statt split("=")
                    const eqIndex = trimmed.indexOf('=');
                    const value = trimmed.substring(eqIndex + 1).trim();
                    if (this.activeFields.has(key)) {
                        newText += `  ${key.padEnd(12)} = ${value}\n`;
                    }
                    return;
                }
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
        // FIX: BUG-3 behoben – Fehlermeldung nennt jetzt beide akzeptierten Dateitypen
        if (count === 0) alert("Keine .bib oder .txt Dateien gefunden.");
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
            // Icon für den Tab
            const icon = document.createElement("span");
            icon.className = "material-symbols-outlined tab-icon";
            icon.textContent = "description";
            tab.appendChild(icon);
            const span = document.createElement("span");
            span.className = "tab-filename";
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

        // FIX: BUG-1 behoben – Defensiver Guard: prüfe ob Funktion existiert
        this.editorInstance.on("change", (cm) => {
            if (this.isProgrammaticUpdate) return;
            if (typeof FileModule.updateActiveFileContent === 'function') {
                FileModule.updateActiveFileContent(cm.getValue());
            }
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
    countDisplay: document.querySelector("#citation-count"),
    allEntries: [],
    currentSearch: "",
    currentSort: "original",

    init() {
        this.countDisplay = document.querySelector("#citation-count");
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
    // FIX: Edge-Case 2 behoben – Zeilenumbrüche werden normalisiert und der Regex
    // akzeptiert die schließende Klammer auch mit umgebendem Whitespace.
    parseBibtexEntries(text) {
        const entries = [];
        // FIX: Edge-Case 2 – Normalisiere alle Zeilenumbrüche zu \n
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // FIX: Edge-Case 2 – Flexiblerer Regex: schließende Klammer muss nicht
        // allein auf einer Zeile stehen, erlaubt Whitespace davor
        const entryRegex = /@(\w+)\s*\{\s*([^,]+),([\s\S]*?)\n\s*\}/g;
        let match;

        while ((match = entryRegex.exec(normalizedText)) !== null) {
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
            // FIX: BUG-4 behoben – parseInt mit Fallback auf 0 verhindert NaN bei "????"
            processed.sort((a, b) => {
                const aYear = parseInt(a.year, 10) || 0;
                const bYear = parseInt(b.year, 10) || 0;
                return bYear - aYear;
            });
        }
        this.renderList(processed);
    },

    // FIX: Edge-Case 1 (XSS) behoben – Alle Benutzerdaten werden via textContent
    // oder DOM-API eingefügt statt innerHTML, um XSS zu verhindern.
    renderList(entriesArray) {
        if (!this.citationListUl) return;
        this.citationListUl.innerHTML = "";

        // Martin: Quellen-Zähler aktualisieren
        if (this.countDisplay) {
            const total = this.allEntries.length;
            const shown = entriesArray.length;
            if (shown === total) {
                this.countDisplay.textContent = `${total} Quelle${total !== 1 ? 'n' : ''}`;
            } else {
                this.countDisplay.textContent = `${shown} von ${total} Quellen`;
            }
        }
        if (entriesArray.length === 0) {
            const emptyLi = document.createElement("li");
            emptyLi.setAttribute("data-empty", "true");
            emptyLi.style.padding = "10px";
            emptyLi.style.color = "var(--text-muted)";
            emptyLi.textContent = "Keine Treffer";
            this.citationListUl.appendChild(emptyLi);
            return;
        }
        // Martin: Generiert die HTML-Elemente für die Listeneinträge in der Sidebar
        entriesArray.forEach(entry => {
            const li = document.createElement("li");

            // Container für Key und Meta
            const div = document.createElement("div");
            div.style.display = "flex";
            div.style.flexDirection = "column";
            div.style.minWidth = "0";

            // Entry-Key Span (sicher via textContent)
            const keySpan = document.createElement("span");
            keySpan.className = "entry-key";
            keySpan.textContent = entry.key;

            // FIX: Edge-Case 1 – Link-Button sicher per DOM-API erstellt
            if (entry.link) {
                const anchor = document.createElement("a");
                anchor.href = entry.link;
                anchor.target = "_blank";
                anchor.rel = "noopener noreferrer";
                anchor.className = "sidebar-link-btn";
                anchor.title = entry.link;
                anchor.textContent = "🔗 Link";
                // stopPropagation auf dem Link, damit nur der Link geöffnet wird
                anchor.addEventListener('click', (e) => e.stopPropagation());
                keySpan.appendChild(anchor);
            }

            // Entry-Meta Span (sicher via textContent)
            const metaSpan = document.createElement("span");
            metaSpan.className = "entry-meta";
            metaSpan.textContent = `${entry.author} (${entry.year})`;

            div.appendChild(keySpan);
            div.appendChild(metaSpan);

            // Type-Badge (sicher via textContent)
            const badge = document.createElement("span");
            badge.className = "entry-type-badge";
            badge.textContent = entry.type;

            li.appendChild(div);
            li.appendChild(badge);

            // Interaktion: Springt zum entsprechenden Key im Felix-Editor
            li.onclick = () => EditorModule.jumpToKey(entry.key);
            this.citationListUl.appendChild(li);
        });
    },
    // FIX: BUG-6 behoben – Gibt null zurück wenn nur "Keine Treffer" angezeigt wird.
    // Verwendet spezifischeren Selektor und extrahiert nur den reinen Key-Text.
    getFirstVisibleKey() {
        // Überspringe das "Keine Treffer" Platzhalter-Element
        const firstKeySpan = this.citationListUl.querySelector("li:not([data-empty]) .entry-key");
        if (!firstKeySpan) return null;
        // Nur den direkten Textinhalt des Spans nehmen (ohne Link-Child-Text)
        const clone = firstKeySpan.cloneNode(true);
        const linkChild = clone.querySelector('.sidebar-link-btn');
        if (linkChild) linkChild.remove();
        return clone.textContent.trim() || null;
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

// --- 7.5 IMPORT MODULE (PDF-Import) ---
const ImportModule = {
    pdfBtn: null,
    pdfInput: null,

    init() {
        this.pdfBtn = document.querySelector("#btn-import-pdf");
        this.pdfInput = document.querySelector("#hidden-pdf-input");
        this.setupListeners();
    },

    setupListeners() {
        if (this.pdfBtn && this.pdfInput) {
            this.pdfBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.pdfInput.value = '';
                this.pdfInput.click();
                // Dropdown schließen
                document.querySelectorAll(".dropdownImportClass").forEach(el => el.classList.remove("show"));
            });
            this.pdfInput.addEventListener("change", (e) => {
                if (e.target.files[0]) {
                    this.handlePdfFile(e.target.files[0]);
                }
            });
        }
    },

    /**
     * Liest eine PDF-Datei aus, extrahiert den Text aller Seiten,
     * isoliert das Literaturverzeichnis und konvertiert es in BibTeX.
     */
    async handlePdfFile(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();

            // pdf.js laden (dynamischer Import, da als ES-Modul eingebunden)
            const pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
            pdfjsLib.GlobalWorkerOptions.workerSrc = window.PDFJS_WORKER_SRC || "";

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map(item => item.str).join(" ");
                fullText += pageText + "\n";
            }

            console.log("PDF-Text extrahiert, Länge:", fullText.length);

            const bibtex = this.extractReferences(fullText);

            if (!bibtex || bibtex.trim().length === 0) {
                alert("Es konnten keine Referenzen in dieser PDF gefunden werden.\n\nMögliche Gründe:\n- Die PDF enthält kein erkennbares Literaturverzeichnis\n- Die PDF ist bildbasiert (Scan) und enthält keinen extrahierbaren Text");
                return;
            }

            // Ergebnis als neuen Tab hinzufügen
            const tabName = "import_" + file.name.replace(/\.pdf$/i, ".bib");
            FileModule.addFile(tabName, bibtex, null);
            FileModule.switchToTab(FileModule.files[FileModule.files.length - 1].id);
            console.log("PDF-Import abgeschlossen:", tabName);

        } catch (err) {
            console.error("Fehler beim PDF-Import:", err);
            alert("Fehler beim Lesen der PDF-Datei: " + err.message);
        }
    },

    /**
     * Kernheuristik: Findet und isoliert den Referenz-Abschnitt im PDF-Text
     * und wandelt die einzelnen Referenzen in BibTeX-Einträge um.
     */
    extractReferences(fullText) {
        // Schritt 1: Referenz-Abschnitt finden
        const refHeaderRegex = /\b(References|Bibliography|Literaturverzeichnis|REFERENCES|BIBLIOGRAPHY|LITERATURVERZEICHNIS)\b/;
        const headerMatch = fullText.match(refHeaderRegex);

        if (!headerMatch) {
            console.warn("Kein Referenz-Abschnitt gefunden.");
            return "";
        }

        // Text ab der Überschrift isolieren
        let refSection = fullText.substring(headerMatch.index + headerMatch[0].length).trim();

        // Optional: Abschneiden bei nächstem Hauptkapitel (z.B. "Appendix", "Acknowledgments")
        const nextSectionRegex = /\b(Appendix|Acknowledgment|Acknowledgement|APPENDIX|Anhang|Danksagung)\b/i;
        const nextMatch = refSection.match(nextSectionRegex);
        if (nextMatch) {
            refSection = refSection.substring(0, nextMatch.index).trim();
        }

        // Schritt 2: Einzelne Referenzen isolieren
        const rawRefs = this.splitReferences(refSection);

        if (rawRefs.length === 0) {
            console.warn("Keine einzelnen Referenzen extrahiert.");
            return "";
        }

        // Schritt 3: Jede Referenz in BibTeX umwandeln
        const bibtexEntries = rawRefs.map((ref, i) => this.parseOneReference(ref.trim(), i + 1)).filter(e => e);

        return this.buildBibtexString(bibtexEntries);
    },

    /**
     * Splittet den Referenz-Block in einzelne Referenzen.
     * Unterstützt nummerierte Formate: [1], [2] ... oder 1., 2., ...
     */
    splitReferences(refText) {
        // Versuch 1: Nummerierung mit eckigen Klammern [1], [2], ...
        let parts = refText.split(/(?=\[\d+\]\s)/);
        if (parts.length > 2) {
            return parts.map(p => p.replace(/^\[\d+\]\s*/, "").trim()).filter(p => p.length > 10);
        }

        // Versuch 2: Nummerierung mit Punkt 1., 2., ...
        parts = refText.split(/(?=(?:^|\n)\s*\d{1,3}\.\s)/);
        if (parts.length > 2) {
            return parts.map(p => p.replace(/^\s*\d{1,3}\.\s*/, "").trim()).filter(p => p.length > 10);
        }

        // Fallback: Doppelte Zeilenumbrüche oder lange Lücken
        parts = refText.split(/\n\s*\n/);
        if (parts.length > 1) {
            return parts.map(p => p.trim()).filter(p => p.length > 10);
        }

        // Letzter Fallback: Einzelne Zeilen, die lang genug sind
        return refText.split(/\n/).map(l => l.trim()).filter(l => l.length > 30);
    },

    /**
     * Versucht aus einem rohen Referenz-String BibTeX-Felder zu extrahieren.
     * Gibt einen formatierten @article oder @misc Eintrag zurück.
     */
    parseOneReference(refText, index) {
        if (!refText || refText.length < 10) return null;

        // Normalisieren: Überflüssige Whitespaces entfernen
        let text = refText.replace(/\s+/g, " ").trim();

        // --- Jahr extrahieren ---
        const yearMatch = text.match(/\b((?:19|20)\d{2}[a-z]?)\b/);
        const year = yearMatch ? yearMatch[1].replace(/[a-z]$/, "") : "";

        // --- Autoren extrahieren ---
        // Heuristik: Alles vor der Jahreszahl oder vor einem Titel in Anführungszeichen
        let author = "";
        if (yearMatch) {
            // Text vor dem Jahr nehmen (oft "Autor1, A., Autor2, B. (2020)")
            const beforeYear = text.substring(0, yearMatch.index).trim();
            // Entferne abschließende Interpunktion und Klammern
            author = beforeYear.replace(/[\(\.,;:]+\s*$/, "").trim();
        }
        if (!author) {
            // Fallback: Alles vor dem ersten Punkt als Autor annehmen
            const dotIdx = text.indexOf(".");
            if (dotIdx > 3 && dotIdx < 80) {
                author = text.substring(0, dotIdx).trim();
            }
        }

        // --- Titel extrahieren ---
        let title = "";
        // Versuch 1: Text in Anführungszeichen
        const quotedMatch = text.match(/[\u201C\u201E"\u201D]([^\u201C\u201E"\u201D]{5,})[\u201D"\u201C]/)
            || text.match(/"([^"]{5,})"/);
        if (quotedMatch) {
            title = quotedMatch[1].trim();
        } else if (yearMatch) {
            // Versuch 2: Text nach dem Jahr bis zum nächsten Punkt
            const afterYear = text.substring(yearMatch.index + yearMatch[0].length);
            const cleanAfterYear = afterYear.replace(/^[\s\)\.,;:]+/, "").trim();
            const periodIdx = cleanAfterYear.indexOf(".");
            if (periodIdx > 5) {
                title = cleanAfterYear.substring(0, periodIdx).trim();
            } else if (cleanAfterYear.length > 5) {
                title = cleanAfterYear.substring(0, 120).trim();
            }
        }
        if (!title && text.length > 10) {
            // Fallback: Ersten Abschnitt als Titel nehmen
            title = text.substring(0, Math.min(text.length, 100));
        }

        // --- Journal/Konferenz erkennen ---
        let journal = "";
        const inMatch = text.match(/\bIn\s+([A-Z][^.]{3,60})/)
            || text.match(/(?:journal|proceedings|conference|transactions)\s*[:=]?\s*([^.,]{3,60})/i);
        if (inMatch) {
            journal = inMatch[1].trim().replace(/[,;]+$/, "");
        }

        // --- BibTeX-Key generieren ---
        const firstAuthor = author.split(/[,;&]|\band\b/)[0].trim().split(/\s+/).pop() || "unknown";
        const cleanKey = firstAuthor.replace(/[^a-zA-Z]/g, "").toLowerCase();
        const key = cleanKey + (year || index);

        // --- Typ bestimmen ---
        const type = journal ? "article" : "misc";

        // --- BibTeX-Eintrag bauen ---
        let entry = `@${type}{${key},\n`;
        if (author) entry += `  author       = {${author}},\n`;
        if (title) entry += `  title        = {${title}},\n`;
        if (year) entry += `  year         = {${year}},\n`;
        if (journal) entry += `  journal      = {${journal}},\n`;
        entry += `}`;

        return entry;
    },

    /**
     * Fügt alle BibTeX-Einträge zu einem String zusammen.
     */
    buildBibtexString(entries) {
        return entries.join("\n\n");
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
        // FIX: BUG-5 behoben – Feldname muss mit Buchstaben beginnen (BibTeX-Konvention)
        const fieldRegex = /^\s*(OPT)?([a-zA-Z][a-zA-Z0-9_]*)\s*=/;
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

// --- 11. THEME MODULE (Theme-Switcher Logik) ---
const ThemeModule = {
    init() {
        const saved = localStorage.getItem('bibstream-theme');
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
        }
        const btn = document.getElementById('theme-toggle');
        if (btn) {
            btn.addEventListener('click', () => this.toggle());
        }
    },

    toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('bibstream-theme', next);

        // Refresh CodeMirror so it picks up the new CSS variable colors
        if (EditorModule.editorInstance) {
            EditorModule.editorInstance.refresh();
        }
    }
};

// Starten
document.addEventListener("DOMContentLoaded", () => {
    LinterModule.init();
    App.init();
});
