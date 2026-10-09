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
        HelpModule.init();

        // Alexandros: Layout-Toggle Initialisierung
        LayoutModule.init();

        // Clipboard-Watcher (optional, falls vorhanden)
        if (typeof ClipboardModule !== 'undefined') ClipboardModule.init();

        // Sitzung aus LocalStorage wiederherstellen
        FileModule.loadSession();

        // Fallback: Wenn kein gespeicherter Zustand vorhanden ist, leeren Tab erstellen
        if (FileModule.files.length === 0) {
            FileModule.addFile("Untitled.bib", "");
            FileModule.switchToTab(FileModule.files[0].id);
        }
    },
};

// --- 2. FORMATTER MODUL (Verantwortung: Felix) ---
const FormatterModule = {
    settingsModal: document.querySelector("#settings-modal"),
    openBtn: document.querySelector("#btn-open-settings"),
    formatCodeBtn: null,
    removeFieldsBtn: null,
    insertTemplateBtn: null,
    saveBtn: document.querySelector("#btn-save-settings"),
    closeBtn: document.querySelector("#btn-close-settings"),
    checkboxes: document.querySelectorAll(".checkbox-grid input"),
    activeFields: new Set(['author', 'title', 'year', 'journal', 'publisher']),

    init() {
        if (!this.settingsModal) return;
        this.formatCodeBtn = document.querySelector("#btn-format-code");
        this.removeFieldsBtn = document.querySelector("#btn-remove-fields");
        this.insertTemplateBtn = document.querySelector("#btn-insert-template");
        this.loadSettings();
        this.setupListeners();
    },

    setupListeners() {
        // Felix: Listener fuer das Modal-Fenster der Formatierungs-Einstellungen
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
            this.runRemoveFields();
            this.settingsModal.classList.remove("show-modal");
        });

        // Code formatieren (nur Einruecken, nichts loeschen)
        if (this.formatCodeBtn) {
            this.formatCodeBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.runFormatCode();
                document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
            });
        }

        // Abgewaehlte Felder loeschen
        if (this.removeFieldsBtn) {
            this.removeFieldsBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.runRemoveFields();
                document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
            });
        }

        // Leeren Artikel erstellen (Template)
        if (this.insertTemplateBtn) {
            this.insertTemplateBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.runInsertTemplate();
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

    // ---- 1) Code formatieren: Nur Einruecken, nichts loeschen ----
    runFormatCode() {
        if (!EditorModule.editorInstance) return;
        const originalText = EditorModule.editorInstance.getValue();
        const formatted = this.formatIndentation(originalText);
        EditorModule.editorInstance.setValue(formatted);
        console.log("Code formatieren ausgefuehrt.");
    },

    /**
     * Formatiert den BibTeX-Code: saubere Einrueckung, Alignment der = Zeichen.
     * Loescht KEINE Felder, behaelt alles bei.
     */
    formatIndentation(text) {
        const lines = text.split('\n');
        let result = "";
        let insideEntry = false;
        const fieldAssignRegex = /^\s*(?:OPT)?([a-zA-Z][a-zA-Z0-9_]*)\s*=/;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith("@")) {
                result += trimmed + "\n";
                insideEntry = true;
                return;
            }
            if (trimmed === "}" && insideEntry) {
                result += "}\n\n";
                insideEntry = false;
                return;
            }
            if (insideEntry) {
                const fieldMatch = trimmed.match(fieldAssignRegex);
                if (fieldMatch) {
                    const key = fieldMatch[1].toLowerCase();
                    const eqIndex = trimmed.indexOf('=');
                    const value = trimmed.substring(eqIndex + 1).trim();
                    result += "  " + key.padEnd(12) + " = " + value + "\n";
                    return;
                }
            }
            if (trimmed !== "") {
                result += line + "\n";
            }
        });
        return result.trim();
    },

    // ---- 2) Abgewaehlte Felder loeschen ----
    runRemoveFields() {
        if (!EditorModule.editorInstance) return;
        const originalText = EditorModule.editorInstance.getValue();
        const cleaned = this.removeUncheckedFields(originalText);
        EditorModule.editorInstance.setValue(cleaned);
        console.log("Abgewaehlte Felder geloescht.");
    },

    /**
     * Entfernt nur die Felder, die NICHT in activeFields stehen.
     * Behaelt die Formatierung bei, loescht nur Zeilen abgewaehlter Felder.
     */
    removeUncheckedFields(text) {
        const lines = text.split('\n');
        let result = "";
        let insideEntry = false;
        const fieldAssignRegex = /^\s*(?:OPT)?([a-zA-Z][a-zA-Z0-9_]*)\s*=/;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith("@")) {
                result += line + "\n";
                insideEntry = true;
                return;
            }
            if (trimmed === "}" && insideEntry) {
                result += line + "\n";
                insideEntry = false;
                return;
            }
            if (insideEntry) {
                const fieldMatch = trimmed.match(fieldAssignRegex);
                if (fieldMatch) {
                    const key = fieldMatch[1].toLowerCase();
                    // Nur AKTIVE Felder behalten, abgewaehlte werden uebersprungen
                    if (this.activeFields.has(key)) {
                        result += line + "\n";
                    }
                    return;
                }
            }
            // Nicht-Feld-Zeilen (Leerzeilen, Kommentare etc.) beibehalten
            result += line + "\n";
        });
        return result.trim();
    },

    // ---- 3) Leeren Artikel erstellen (Template) ----
    runInsertTemplate() {
        if (!EditorModule.editorInstance) return;
        const template = this.buildTemplate();
        const cm = EditorModule.editorInstance;
        const cursor = cm.getCursor();
        // An aktueller Cursor-Position einfuegen
        cm.replaceRange(template, cursor);
        cm.focus();
        console.log("Leeres Template eingefuegt.");
    },

    /**
     * Erzeugt ein leeres @article{}-Template mit nur den aktuell
     * in den Voreinstellungen (Checkboxen) ausgewaehlten Feldern.
     */
    buildTemplate() {
        const fields = [...this.activeFields];
        let template = "\n@article{new_key,\n";
        fields.forEach(field => {
            template += "  " + field.padEnd(12) + " = {},\n";
        });
        template += "}\n";
        return template;
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
        // "Zuletzt geändert"-Liste im Datei-Menü rendern
        this.renderRecentFiles();
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
                        let content = await file.text();
                        // TXT-Import: BibTeX-BlÃƒÂ¶cke extrahieren, Rest verwerfen
                        if (file.name.toLowerCase().endsWith('.txt')) {
                            content = this.extractBibtex(content);
                            if (!content) {
                                alert('This .txt file does not contain recognizable BibTeX content and will not be imported.');
                                return;
                            }
                        }
                        this.addFile(file.name, content, handle);
                        this.addToRecentFiles(file.name, content);
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
                // Dirty-Flag zurücksetzen und Tabs aktualisieren
                file.dirty = false;
                this.renderTabs();
                console.log("Erfolgreich überschrieben:", file.name);
                alert(`"${file.name}" saved!`);
            } catch (err) {
                console.error("Fehler beim Überschreiben:", err);
                alert("Error saving file. Try 'Save As'.");
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
                // Dirty-Flag zurÃƒÂ¼cksetzen
                file.dirty = false;
                this.renderTabs();
                alert("Saved!");
            } catch (err) { /* Abbruch */ }
        } else {
            this.legacyDownload(file.name, file.content);
            // Dirty-Flag zurücksetzen nach Download
            file.dirty = false;
            this.renderTabs();
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
        if (count === 0) alert("No .bib or .txt files found.");
    },

    readFileAndAdd(fileObj) {
        const reader = new FileReader();
        reader.onload = (e) => {
            let content = e.target.result;
            // TXT-Import: BibTeX-Blöcke extrahieren, Rest verwerfen
            if (fileObj.name.toLowerCase().endsWith('.txt')) {
                content = this.extractBibtex(content);
                if (!content) {
                    alert('This .txt file does not contain recognizable BibTeX content and will not be imported.');
                    return;
                }
            }
            this.addFile(fileObj.name, content, null);
            this.addToRecentFiles(fileObj.name, content);
            if (this.files.length === 1) this.switchToTab(this.files[0].id);
            else this.switchToTab(this.files[this.files.length - 1].id);
        };
        reader.readAsText(fileObj);
    },

    createNewFile() {
        const name = `Untitled_${this.files.length + 1}.bib`;
        this.addFile(name, "", null);
        this.switchToTab(this.files[this.files.length - 1].id);
    },

    addFile(name, content, handle = null) {
        const newFile = {
            id: 'file_' + Date.now() + Math.random().toString(36).substr(2, 9),
            name: name,
            content: content,
            handle: handle,
            dirty: false
        };
        this.files.push(newFile);
        this.renderTabs();
        this.saveSession();
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
        this.saveSession();
        if (typeof ClipboardModule !== 'undefined' && typeof ClipboardModule.onTabSwitched === 'function') {
            ClipboardModule.onTabSwitched();
        }
    },

    closeFile(id, event) {
        if (event) event.stopPropagation();
        this.files = this.files.filter(f => f.id !== id);
        if (this.activeFileId === id) {
            if (this.files.length > 0) this.switchToTab(this.files[this.files.length - 1].id);
            else {
                this.addFile("Untitled.bib", "", null);
                this.switchToTab(this.files[0].id);
            }
        } else {
            this.renderTabs();
        }
        this.saveSession();
    },

    renderTabs() {
        if (!this.tabContainer) return;
        this.tabContainer.innerHTML = "";
        this.files.forEach(file => {
            const tab = document.createElement("div");
            tab.className = `tab ${file.id === this.activeFileId ? 'active' : ''}`;
            // Icon fÃƒÂ¼r den Tab
            const icon = document.createElement("span");
            icon.className = "material-symbols-outlined tab-icon";
            icon.textContent = "description";
            tab.appendChild(icon);
            const span = document.createElement("span");
            span.className = "tab-filename";
            // Dirty-Flag: Ungespeicherte Ãƒâ€žnderungen mit * markieren
            span.textContent = (file.dirty ? '* ' : '') + file.name;
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
            this.saveSession();
        }
    },

    /**
     * Markiert die aktive Datei als "ungespeichert" (dirty).
     * Wird vom EditorModule bei jeder Benutzer-Ãƒâ€žnderung aufgerufen.
     */
    markActiveDirty() {
        const file = this.files.find(f => f.id === this.activeFileId);
        if (file && !file.dirty) {
            file.dirty = true;
            this.renderTabs();
        }
    },

    // --- Sitzungswiederherstellung (LocalStorage) ---

    /**
     * Speichert den aktuellen Zustand aller Tabs (Name + Inhalt) und
     * die activeFileId in den LocalStorage.
     * FileHandles werden nicht serialisiert (nicht JSON-kompatibel).
     */
    saveSession() {
        try {
            const data = {
                activeFileId: this.activeFileId,
                files: this.files.map(f => ({ id: f.id, name: f.name, content: f.content }))
            };
            localStorage.setItem('bibstream-session', JSON.stringify(data));
        } catch (err) {
            console.warn('Sitzung konnte nicht gespeichert werden:', err);
        }
    },

    /**
     * LÃƒÂ¤dt Tabs und aktiven Tab aus dem LocalStorage.
     * Stellt files[] wieder her und wechselt zum zuletzt aktiven Tab.
     */
    loadSession() {
        try {
            const raw = localStorage.getItem('bibstream-session');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.files) || data.files.length === 0) return;
            data.files.forEach(f => {
                this.files.push({ id: f.id, name: f.name, content: f.content || '', handle: null });
            });
            this.renderTabs();
            // Zum zuletzt aktiven Tab wechseln (oder ersten Tab)
            const targetId = data.activeFileId && this.files.find(f => f.id === data.activeFileId)
                ? data.activeFileId
                : this.files[0].id;
            this.switchToTab(targetId);
        } catch (err) {
            console.warn('Sitzung konnte nicht geladen werden:', err);
        }
    },

    // --- Premium-Feature: Zuletzt geänderten Dateien ---

    /**
     * FÃƒÂ¼gt eine Datei (Name + Inhalt) zur "Zuletzt geändert"-Liste hinzu.
     * Max. 5 EintrÃƒÂ¤ge, keine Duplikate (FIFO). Speichert Name UND Content.
     */
    addToRecentFiles(name, content) {
        try {
            let recent = JSON.parse(localStorage.getItem('bibstream-recent-files') || '[]');
            // Duplikat entfernen, falls vorhanden
            recent = recent.filter(entry => entry.name !== name);
            // Am Anfang einfÃƒÂ¼gen (Name + Content)
            recent.unshift({ name: name, content: content || '' });
            // Max. 5 EintrÃƒÂ¤ge behalten
            if (recent.length > 5) recent = recent.slice(0, 5);
            localStorage.setItem('bibstream-recent-files', JSON.stringify(recent));
            this.renderRecentFiles();
        } catch (err) {
            console.warn('Zuletzt geänderten Dateien konnten nicht gespeichert werden:', err);
        }
    },

    /**
     * Rendert die "Zuletzt geändert"-Liste im Datei-Dropdown.
     * FÃƒÂ¼gt EintrÃƒÂ¤ge unterhalb einer <hr> im #dropdownDateiContent ein.
     */
    renderRecentFiles() {
        const dropdown = document.querySelector('#dropdownDateiContent');
        if (!dropdown) return;

        // Alte "Zuletzt geändert"-EintrÃƒÂ¤ge entfernen
        dropdown.querySelectorAll('.recent-file-item, .recent-file-header').forEach(el => el.remove());

        let recent = [];
        try {
            recent = JSON.parse(localStorage.getItem('bibstream-recent-files') || '[]');
        } catch (e) { /* leer lassen */ }

        if (recent.length === 0) return;

        // Trennlinie
        const hr = document.createElement('hr');
        hr.className = 'recent-file-header';
        dropdown.appendChild(hr);

        // ÃƒÅ“berschrift
        const header = document.createElement('span');
        header.className = 'recent-file-header';
        header.textContent = 'Zuletzt Bearbeitet';
        header.style.cssText = 'display:block;padding:6px 12px 2px;font-size:0.75em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;pointer-events:none;';
        dropdown.appendChild(header);

        // DateieintrÃƒÂ¤ge (jeder Eintrag ist ein {name, content}-Objekt)
        recent.forEach(entry => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'recent-file-item';
            a.textContent = entry.name;
            a.title = entry.name;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                // PrÃƒÂ¼fen ob Datei bereits geÃƒÂ¶ffnet ist
                const existing = this.files.find(f => f.name === entry.name);
                if (existing) {
                    this.switchToTab(existing.id);
                } else {
                    // Tab mit gespeichertem Inhalt erstellen
                    this.addFile(entry.name, entry.content || '');
                    this.switchToTab(this.files[this.files.length - 1].id);
                }
                this.closeDropdowns();
            });
            dropdown.appendChild(a);
        });
    },

    // --- TXT-Import: BibTeX-Extraktion ---

    /**
     * Extrahiert alle gÃƒÂ¼ltigen BibTeX-BlÃƒÂ¶cke (@type{...}) aus einem Rohtext.
     * Verwendet Klammertiefe-ZÃƒÂ¤hlung, um verschachtelte {} korrekt zu behandeln.
     * Gibt den bereinigten String zurÃƒÂ¼ck, oder '' wenn nichts gefunden wurde.
     */
    extractBibtex(rawText) {
        const blocks = [];
        // Finde jedes @type{-Vorkommen
        const headerRegex = /@\w+\s*\{/g;
        let match;
        while ((match = headerRegex.exec(rawText)) !== null) {
            const start = match.index;
            // Ab der ÃƒÂ¶ffnenden { die passende schlieÃƒÅ¸ende } per TiefenzÃƒÂ¤hlung finden
            const braceStart = start + match[0].length - 1; // Position der {
            let depth = 1;
            let i = braceStart + 1;
            while (i < rawText.length && depth > 0) {
                if (rawText[i] === '{') depth++;
                else if (rawText[i] === '}') depth--;
                i++;
            }
            if (depth === 0) {
                blocks.push(rawText.substring(start, i));
            }
            // Regex-Index hinter den Block setzen, damit wir nicht innerhalb suchen
            headerRegex.lastIndex = i;
        }
        return blocks.length > 0 ? blocks.join('\n\n') : '';
    }
};

// --- 4. EDITOR-MODUL (Verantwortung: Felix) ---
const EditorModule = {
    editorInstance: null,
    isProgrammaticUpdate: false,
    isJumping: false,
    cursorTimeout: null,
    searchMarkers: [],
    activeSearchTerms: [],

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
            // Dirty-Flag setzen: Datei hat ungespeicherte Änderungen
            FileModule.markActiveDirty();
            this.reapplySearchHighlights();
            this.scheduleUpdateDeleteButtons();
        });

        // Felix: Synchronisierung Editor -> Sidebar
        this.editorInstance.on("cursorActivity", (cm) => {
            if (this.isProgrammaticUpdate || this.isJumping) return;
            
            clearTimeout(this.cursorTimeout);
            this.cursorTimeout = setTimeout(() => {
                const cursor = cm.getCursor();
                const key = this.findBibtexKeyAtCursor(cm, cursor);
                if (key && typeof SidebarModule.highlightKey === 'function') {
                    SidebarModule.highlightKey(key);
                }
            }, 150);
        });

        // Felix: Event-Listener für die Menü-Buttons (Undo/Redo)
        this.setupMenuListeners();

        // Löschbuttons an allen Quell-Definitionszeilen im Editor initialisieren
        this.scheduleUpdateDeleteButtons();
    },

    setupMenuListeners() {
        const undoBtn = document.querySelector("#btn-undo");
        const redoBtn = document.querySelector("#btn-redo");

        if (undoBtn) {
            undoBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.undo();
                // Alexandros: Dropdown nach Klick schlieÃƒÅ¸en
                document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
            });
        }

        if (redoBtn) {
            redoBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.redo();
                // Alexandros: Dropdown nach Klick schlieÃƒÅ¸en
                document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
            });
        }
    },

    // Felix: Manuelles AuslÃƒÂ¶sen der RÃƒÂ¼ckgÃƒÂ¤ngig-Funktion
    undo() {
        if (this.editorInstance) {
            this.editorInstance.undo();
            this.editorInstance.focus(); // Fokus zurÃƒÂ¼ck in den Editor
        }
    },

    // Felix: Manuelles AuslÃƒÂ¶sen der Wiederholen-Funktion
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
        this.reapplySearchHighlights();
        this.scheduleUpdateDeleteButtons();
    },

    updateSortedContent(text) {
        if (!this.editorInstance) return;
        this.isProgrammaticUpdate = true;
        this.editorInstance.setValue(text);
        this.isProgrammaticUpdate = false;
        this.reapplySearchHighlights();
        this.scheduleUpdateDeleteButtons();
    },

    /**
     * Markiert alle Vorkommen der übergebenen Suchbegriffe im CodeMirror-Editor ("unten im Text").
     * Nutzt searchcursor und markText für sauberes, performantes Highlighting.
     */
    highlightSearchMatches(terms) {
        this.activeSearchTerms = Array.isArray(terms) ? terms : [];
        if (!this.editorInstance) return;
        const cm = this.editorInstance;

        // Vorherige Markierungen entfernen
        if (this.searchMarkers && this.searchMarkers.length > 0) {
            this.searchMarkers.forEach(marker => {
                try { marker.clear(); } catch (_) {}
            });
        }
        this.searchMarkers = [];

        if (!this.activeSearchTerms || this.activeSearchTerms.length === 0) return;

        cm.operation(() => {
            this.activeSearchTerms.forEach(term => {
                if (!term || term.trim().length === 0) return;
                const cursor = cm.getSearchCursor(term, null, { caseFold: true });
                let count = 0;
                while (cursor.findNext() && count < 1000) {
                    const marker = cm.markText(cursor.from(), cursor.to(), {
                        className: "cm-search-highlight"
                    });
                    this.searchMarkers.push(marker);
                    count++;
                }
            });
        });
    },

    reapplySearchHighlights() {
        if (this.activeSearchTerms && this.activeSearchTerms.length > 0) {
            this.highlightSearchMatches(this.activeSearchTerms);
        }
    },

    findBibtexKeyAtCursor(cm, cursor) {
        // Sucht vom aktuellen Cursor nach oben nach dem nächsten BibTeX-Eintrag
        for (let i = cursor.line; i >= 0; i--) {
            const line = cm.getLine(i);
            const match = line.match(/@\w+\s*\{\s*([^,]*),/);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    },

    /**
     * Springt zum BibTeX-Eintrag mit dem gegebenen Key.
     * Markiert die gesamte ausgewählte Quelle im Editor, scrollt sie bündig nach oben
     * und fokussiert den Editor, sodass der Eintrag direkt per Strg+C / Strg+V kopiert werden kann.
     */
    jumpToKey(keyName, selectWholeBlock = true) {
        if (!this.editorInstance) return;
        this.isJumping = true; // Ping-Pong Effekt verhindern
        const cm = this.editorInstance;
        const totalLines = cm.lineCount();
        const escapedKey = keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const headerRegex = new RegExp(`^\\s*@\\w+\\s*\\{\\s*${escapedKey}\\s*(?:,|$)`, 'i');

        // 1. Suche die Header-Zeile des Eintrags (@type{key,)
        let blockStart = -1;
        for (let i = 0; i < totalLines; i++) {
            if (headerRegex.test(cm.getLine(i))) {
                blockStart = i;
                break;
            }
        }

        // Fallback: Suche über getSearchCursor, falls Header mehrzeilig umbrochen ist oder Whitespace abweicht
        if (blockStart === -1) {
            const cursor = cm.getSearchCursor(keyName);
            while (cursor.findNext()) {
                const matchLine = cursor.from().line;
                for (let i = matchLine; i >= 0; i--) {
                    if (cm.getLine(i).trim().startsWith('@')) {
                        const snippet = cm.getRange({ line: i, ch: 0 }, { line: matchLine + 1, ch: 0 });
                        if (new RegExp(`@\\w+\\s*\\{\\s*${escapedKey}\\s*[,\\s]`, 'i').test(snippet)) {
                            blockStart = i;
                        }
                        break;
                    }
                }
                if (blockStart !== -1) break;
            }
        }

        // Letzter Fallback: Erstes Vorkommen von keyName
        if (blockStart === -1) {
            const cursor = cm.getSearchCursor(keyName);
            if (!cursor.findNext()) {
                setTimeout(() => this.isJumping = false, 300);
                return;
            }
            const matchLine = cursor.from().line;
            blockStart = matchLine;
            for (let i = matchLine; i >= 0; i--) {
                if (cm.getLine(i).trim().startsWith('@')) {
                    blockStart = i;
                    break;
                }
            }
        }

        // 2. Finde das Ende des Blocks (vorwärts per Klammertiefe)
        let blockEnd = blockStart;
        let depth = 0;
        let foundOpenBrace = false;
        for (let i = blockStart; i < totalLines; i++) {
            const line = cm.getLine(i);
            for (const ch of line) {
                if (ch === '{' || ch === '(') {
                    depth++;
                    foundOpenBrace = true;
                } else if (ch === '}' || ch === ')') {
                    depth--;
                }
            }
            if (foundOpenBrace && depth <= 0) {
                blockEnd = i;
                break;
            }
        }

        if (selectWholeBlock) {
            cm.setSelection(
                { line: blockStart, ch: 0 },
                { line: blockEnd, ch: cm.getLine(blockEnd).length }
            );
        } else {
            // Selektion nur auf den Key setzen
            const keyCursor = cm.getSearchCursor(keyName, { line: blockStart, ch: 0 });
            if (keyCursor.findNext()) {
                cm.setSelection(keyCursor.from(), keyCursor.to());
            }
        }

        // Scroll: Eintrag bündig oben am Bildschirmrand
        const topCoord = cm.charCoords({ line: blockStart, ch: 0 }, 'local').top;
        cm.scrollTo(null, topCoord);

        // Farbliches Highlighting des gesamten Blocks (temporär)
        const markers = [];
        for (let i = blockStart; i <= blockEnd; i++) {
            cm.addLineClass(i, 'background', 'jumptokey-highlight');
            markers.push(i);
        }
        // Highlight nach 3.5s wieder entfernen
        setTimeout(() => {
            markers.forEach(line => {
                cm.removeLineClass(line, 'background', 'jumptokey-highlight');
            });
        }, 3500);

        cm.focus();
        setTimeout(() => {
            if (this.editorInstance) {
                this.editorInstance.focus();
            }
            this.isJumping = false;
        }, 50);
    },

    /**
     * Löscht einen BibTeX-Eintrag anhand seines Keys aus dem CodeMirror-Editor.
     * Nutzt präzises Klammer-Matching und cm.replaceRange(), wodurch das change-Event
     * automatisch gefeuert wird und der Undo-Verlauf (Strg+Z) erhalten bleibt.
     */
    deleteEntryByKey(keyName) {
        if (!this.editorInstance) {
            if (FileModule.activeFileId) {
                const file = FileModule.files.find(f => f.id === FileModule.activeFileId);
                if (file) {
                    const escaped = keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`@\\w+\\s*\\{\\s*${escaped}\\s*,[\\s\\S]*?\\n\\}\\n?`, 'i');
                    const updated = file.content.replace(regex, '');
                    FileModule.updateActiveFileContent(updated);
                    FileModule.markActiveDirty();
                    return true;
                }
            }
            return false;
        }

        const cm = this.editorInstance;
        const totalLines = cm.lineCount();
        const escapedKey = keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const headerRegex = new RegExp(`^\\s*@\\w+\\s*\\{\\s*${escapedKey}\\s*,`, 'i');

        // 1. Suche die Header-Zeile des Eintrags (@type{key,)
        let blockStart = -1;
        for (let i = 0; i < totalLines; i++) {
            if (headerRegex.test(cm.getLine(i))) {
                blockStart = i;
                break;
            }
        }

        // Fallback: Suche über getSearchCursor, falls Header mehrzeilig umbrochen wurde
        if (blockStart === -1) {
            const cursor = cm.getSearchCursor(keyName);
            while (cursor.findNext()) {
                const matchLine = cursor.from().line;
                for (let i = matchLine; i >= 0; i--) {
                    if (cm.getLine(i).trim().startsWith('@')) {
                        const snippet = cm.getRange({ line: i, ch: 0 }, { line: matchLine + 1, ch: 0 });
                        if (headerRegex.test(snippet)) {
                            blockStart = i;
                        }
                        break;
                    }
                }
                if (blockStart !== -1) break;
            }
        }

        if (blockStart === -1) return false;

        // 2. Finde das Ende des Eintrags per Klammertiefe (Brace Depth)
        let blockEnd = blockStart;
        let depth = 0;
        let foundOpenBrace = false;

        for (let i = blockStart; i < totalLines; i++) {
            const line = cm.getLine(i);
            for (const ch of line) {
                if (ch === '{') {
                    depth++;
                    foundOpenBrace = true;
                } else if (ch === '}') {
                    depth--;
                }
            }
            if (foundOpenBrace && depth <= 0) {
                blockEnd = i;
                break;
            }
        }

        // 3. Zu löschenden Zeilenbereich ermitteln (inklusive nachfolgender/vorangehender Leerzeile)
        let fromLine = blockStart;
        let toLine = blockEnd;
        let fromCh = 0;
        let toCh = cm.getLine(blockEnd).length;

        if (blockEnd + 1 < totalLines) {
            toLine = blockEnd + 1;
            toCh = 0;
            if (toLine < totalLines && cm.getLine(toLine).trim() === '') {
                toLine = toLine + 1;
            }
        } else if (blockStart > 0) {
            fromLine = blockStart - 1;
            fromCh = cm.getLine(blockStart - 1).length;
        }

        // 4. In CodeMirror ersetzen (löst on("change") aus -> aktualisiert File & Sidebar automatisch)
        cm.replaceRange("", { line: fromLine, ch: fromCh }, { line: toLine, ch: toCh });
        cm.focus();
        return true;
    },

    deleteMarkers: [],
    deleteBtnTimeout: null,

    scheduleUpdateDeleteButtons() {
        clearTimeout(this.deleteBtnTimeout);
        this.deleteBtnTimeout = setTimeout(() => {
            this.renderLineDeleteButtons();
        }, 80);
    },

    /**
     * Erzeugt an jeder Zeile, an der eine Quelle definiert wird (@typ{key...),
     * ganz rechts am Rand einen roten Mülleimer-Löschbutton.
     */
    renderLineDeleteButtons() {
        if (!this.editorInstance) return;
        const cm = this.editorInstance;

        // Vorherige Marker bereinigen
        if (this.deleteMarkers && this.deleteMarkers.length > 0) {
            this.deleteMarkers.forEach(m => {
                if (m && typeof m.clear === 'function') {
                    m.clear();
                }
            });
        }
        this.deleteMarkers = [];

        const totalLines = cm.lineCount();
        const headerRegex = /^\s*@(\w+)\s*[{(]\s*([^,\s]*)/;

        for (let i = 0; i < totalLines; i++) {
            const lineText = cm.getLine(i);
            const match = lineText.match(headerRegex);
            if (match) {
                const type = match[1];
                const key = match[2];

                const btn = document.createElement("button");
                btn.className = "cm-entry-delete-btn";
                btn.type = "button";
                btn.title = `Delete entry @${type}{${key}}`;
                btn.innerHTML = '<span class="material-symbols-outlined">delete</span>';

                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const entryObj = (SidebarModule.allEntries || []).find(ent => ent.key === key) || {
                        type: type,
                        key: key,
                        title: "",
                        author: "",
                        year: ""
                    };

                    SidebarModule.openDeleteModal(entryObj);
                });

                btn.addEventListener("mousedown", (e) => {
                    e.stopPropagation();
                });

                const marker = cm.setBookmark(
                    { line: i, ch: lineText.length },
                    { widget: btn, insertLeft: false, handleMouseEvents: true }
                );
                this.deleteMarkers.push(marker);
            }
        }
    }
};

// --- 5. SIDEBAR MODULE (Verantwortung: Martin) ---
const SidebarModule = {
    citationListUl: document.querySelector("#citation-list"),
    sortSelect: document.querySelector("#selektor"),
    countDisplay: document.querySelector("#citation-count"),
    deleteModal: null,
    deletePreview: null,
    confirmDeleteBtn: null,
    cancelDeleteBtn: null,
    entryToDelete: null,
    allEntries: [],
    currentSearch: "",
    searchTerms: [],
    currentSort: "original",
    trailingText: "",

    init() {
        this.countDisplay = document.querySelector("#citation-count");
        this.deleteModal = document.querySelector("#delete-modal");
        this.deletePreview = document.querySelector("#delete-modal-preview");
        this.confirmDeleteBtn = document.querySelector("#btn-confirm-delete");
        this.cancelDeleteBtn = document.querySelector("#btn-cancel-delete");

        if (this.confirmDeleteBtn) {
            this.confirmDeleteBtn.addEventListener("click", () => this.confirmDelete());
        }
        if (this.cancelDeleteBtn) {
            this.cancelDeleteBtn.addEventListener("click", () => this.closeDeleteModal());
        }
        if (this.deleteModal) {
            this.deleteModal.addEventListener("click", (e) => {
                if (e.target === this.deleteModal) this.closeDeleteModal();
            });
            window.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && this.deleteModal.classList.contains("show-modal")) {
                    this.closeDeleteModal();
                }
            });
        }

        if (!this.citationListUl) return;
        if (this.sortSelect) {
            this.sortSelect.addEventListener("change", (e) => {
                this.setSortMode(e.target.value);
            });
        }

        // Falls Fokus auf der Sidebar liegt und Strg+C gedrückt wird: Editor fokussieren, damit die markierte Quelle kopiert wird
        window.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 'c') {
                if (document.activeElement && document.activeElement.closest('.sidebar')) {
                    if (typeof EditorModule !== "undefined" && EditorModule.editorInstance && EditorModule.editorInstance.somethingSelected()) {
                        EditorModule.editorInstance.focus();
                    }
                }
            }
        });
    },

    parseAndRefresh(text) {
        this.allEntries = this.parseBibtexEntries(text);
        this.updateView();
        if (typeof EditorModule.highlightSearchMatches === 'function') {
            EditorModule.highlightSearchMatches(this.searchTerms);
        }
    },

    /**
     * Extrahiert den Wert eines BibTeX-Feldes verschachtelungssicher (Brace Matching).
     * Unterstützt geschweifte Klammern {...}, Anführungszeichen "..." und unquotierte Werte.
     * Bilanziert Klammern per Depth-Zählung, damit verschachtelte Klammern wie z.B.
     * {{FF}itts Law: Modeling Finger Touch with {F}itts' {L}aw} vollständig
     * bis zur schließenden Hauptklammer extrahiert werden.
     */
    extractFieldValue(content, fieldName) {
        // Suche nach "fieldName =" bzw. "(?:OPT)?fieldName =" (case-insensitive)
        const regex = new RegExp(`(?:\\b(?:OPT)?${fieldName}\\s*=\\s*)`, 'i');
        const match = regex.exec(content);
        if (!match) return null;

        let startIdx = match.index + match[0].length;

        // Führende Leerzeichen/Umbruche überspringen
        while (startIdx < content.length && /\s/.test(content[startIdx])) {
            startIdx++;
        }

        if (startIdx >= content.length) return null;

        const firstChar = content[startIdx];
        let value = "";

        if (firstChar === '{') {
            // Klammertiefen-Zählung für verschachtelte geschweifte Klammern
            let depth = 1;
            let i = startIdx + 1;
            while (i < content.length && depth > 0) {
                if (content[i] === '{') depth++;
                else if (content[i] === '}') depth--;
                if (depth > 0) i++;
            }
            if (depth === 0) {
                // Extrahierter Inhalt zwischen den äußeren Hauptklammern
                value = content.substring(startIdx + 1, i);
            }
        } else if (firstChar === '"') {
            // Anführungszeichen: Bis zum schließenden Anführungszeichen lesen (unter Beachtung von Escapes)
            let i = startIdx + 1;
            while (i < content.length) {
                if (content[i] === '"' && content[i - 1] !== '\\') {
                    break;
                }
                i++;
            }
            value = content.substring(startIdx + 1, i);
        } else {
            // Unquotierte Werte (z.B. Zahlen `year = 2024` oder Makros)
            let i = startIdx;
            while (i < content.length && content[i] !== ',' && content[i] !== '\n' && content[i] !== '}') {
                i++;
            }
            value = content.substring(startIdx, i);
        }

        return value;
    },

    /**
     * Zerlegt den Suchstring in einzelne Suchbegriffe.
     * Unterstützt Trennung durch '||' oder '|' (logisches ODER).
     * Bereinigt Leerzeichen und ignoriert leere Teilbegriffe (z. B. "ny ||" -> ["ny"]).
     */
    getSearchTerms(queryString) {
        if (!queryString) return [];
        const parts = queryString.split(/\|\||\|/);
        const terms = [];
        parts.forEach(part => {
            const trimmed = part.trim();
            if (trimmed.length > 0) {
                terms.push(trimmed);
            }
        });
        return terms;
    },

    /**
     * Sicheres HTML-Escaping zur Vermeidung von XSS-Injektionen bei der Treffermarkierung.
     */
    escapeHTML(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Markiert alle Vorkommen der übergebenen Suchbegriffe in einem Text mit <mark class="search-match">.
     */
    highlightTextToHTML(text, terms) {
        if (!text) return "";
        if (!terms || terms.length === 0) {
            return this.escapeHTML(text);
        }

        const validTerms = terms
            .map(t => (t ? t.trim() : ''))
            .filter(t => t.length > 0);

        if (validTerms.length === 0) {
            return this.escapeHTML(text);
        }

        const escapedTerms = validTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

        const parts = String(text).split(regex);
        let html = "";
        parts.forEach(part => {
            if (!part) return;
            const isMatch = validTerms.some(t => t.toLowerCase() === part.toLowerCase());
            if (isMatch) {
                html += `<mark class="search-match">${this.escapeHTML(part)}</mark>`;
            } else {
                html += this.escapeHTML(part);
            }
        });
        return html;
    },

    /**
     * Extrahiert alle Felder eines BibTeX-Eintrags verschachtelungssicher (Brace Matching).
     * Erfasst beliebige Standard- und benutzerdefinierte Felder wie address, location, ort,
     * publisher, journal, booktitle, pages, abstract usw.
     */
    extractAllFields(content) {
        const fields = {};
        if (!content) return fields;

        const fieldRegex = /(?:^|[\s,;])(?:OPT)?([a-zA-Z0-9_-]+)\s*=\s*/g;
        let match;

        while ((match = fieldRegex.exec(content)) !== null) {
            const fieldName = match[1].toLowerCase();
            let startIdx = match.index + match[0].length;

            while (startIdx < content.length && /\s/.test(content[startIdx])) {
                startIdx++;
            }
            if (startIdx >= content.length) continue;

            const firstChar = content[startIdx];
            let value = "";
            let endIdx = startIdx;

            if (firstChar === '{') {
                let depth = 1;
                let i = startIdx + 1;
                while (i < content.length && depth > 0) {
                    if (content[i] === '{') depth++;
                    else if (content[i] === '}') depth--;
                    if (depth > 0) i++;
                }
                if (depth === 0) {
                    value = content.substring(startIdx + 1, i);
                    endIdx = i + 1;
                }
            } else if (firstChar === '"') {
                let i = startIdx + 1;
                while (i < content.length) {
                    if (content[i] === '"' && content[i - 1] !== '\\') {
                        break;
                    }
                    i++;
                }
                value = content.substring(startIdx + 1, i);
                endIdx = i + 1;
            } else {
                let i = startIdx;
                while (i < content.length && content[i] !== ',' && content[i] !== '\n' && content[i] !== '}') {
                    i++;
                }
                value = content.substring(startIdx, i);
                endIdx = i;
            }

            fields[fieldName] = this.cleanValueForUI(value);
            fieldRegex.lastIndex = endIdx;
        }

        return fields;
    },

    /**
     * Bereinigt einen extrahierten Feldwert für die UI-Anzeige in der Cite-Liste.
     * Entfernt geschweifte Klammern (auch innere Klammern wie {FF}) und normalisiert Whitespaces,
     * ohne den Rohtext im Editor zu verändern.
     */
    cleanValueForUI(rawVal) {
        if (!rawVal) return "";
        return rawVal.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    },

    // Martin: Parser zur Extraktion von Key, Typ, Titel, Autor, Jahr, Link und aller Felder
    parseBibtexEntries(text) {
        const entries = [];
        const seenKeys = new Set();
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const headerRegex = /@(\w+)\s*\{\s*([^,]*),/g;
        let headerMatch;
        let lastEnd = 0;

        while ((headerMatch = headerRegex.exec(normalizedText)) !== null) {
            const type = headerMatch[1].toLowerCase();
            const key = headerMatch[2].trim();

            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            const bodyStart = headerMatch.index + headerMatch[0].length;
            let depth = 1;
            let i = bodyStart;
            while (i < normalizedText.length && depth > 0) {
                if (normalizedText[i] === '{') depth++;
                else if (normalizedText[i] === '}') depth--;
                if (depth > 0) i++;
            }

            if (depth === 0) {
                const content = normalizedText.substring(bodyStart, i);

                // Verschachtelungssicheres Parsing aller Felder (inkl. Ort, Address, Journal etc.)
                const allFields = this.extractAllFields(content);

                const rawTitle = allFields['title'] || this.extractFieldValue(content, 'title');
                const title = this.cleanValueForUI(rawTitle);

                const rawAuthor = allFields['author'] || this.extractFieldValue(content, 'author');
                const author = rawAuthor ? this.cleanValueForUI(rawAuthor) : "Unbekannt";

                const rawYear = allFields['year'] || this.extractFieldValue(content, 'year');
                const yearMatch = rawYear ? rawYear.match(/\d{4}/) : null;
                const year = yearMatch ? yearMatch[0] : "????";

                // Extrahiert URL oder DOI für einen klickbaren Link (mit Unterstützung für OPT-Präfixe)
                const rawDoi = allFields['doi'] || this.extractFieldValue(content, 'doi');
                const rawUrl = allFields['url'] || this.extractFieldValue(content, 'url');
                let link = null;
                let linkType = null; // 'doi' oder 'url'

                if (rawDoi) {
                    // DOI hat Priorität (wissenschaftlicher Standard)
                    let doi = this.cleanValueForUI(rawDoi);
                    // Falls die DOI bereits als URL (z.B. https://doi.org/) formatiert ist, bereinigen wir sie
                    doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
                    link = `https://doi.org/${doi}`;
                    linkType = 'doi';
                } else if (rawUrl) {
                    // Fallback zur URL, wenn keine DOI vorhanden ist
                    link = this.cleanValueForUI(rawUrl);
                    linkType = 'url';
                }

                const entryStart = headerMatch.index;
                const entryEnd = i + 1;
                const precedingText = normalizedText.substring(lastEnd, entryStart);
                const rawText = normalizedText.substring(entryStart, entryEnd);

                entries.push({ 
                    type, key, title, author, year, link, linkType,
                    fields: allFields,
                    precedingText, rawText,
                    originalIndex: entries.length
                });

                lastEnd = entryEnd;
                headerRegex.lastIndex = entryEnd;
            }
        }
        
        this.trailingText = normalizedText.substring(lastEnd);
        return entries;
    },

    setSearchTerm(term) {
        this.currentSearch = (term || "").trim().toLowerCase();
        this.searchTerms = this.getSearchTerms(term || "");
        if (typeof EditorModule.highlightSearchMatches === 'function') {
            EditorModule.highlightSearchMatches(this.searchTerms);
        }
        this.updateView();
    },

    setSortMode(mode) {
        this.currentSort = mode;
        this.sortAndSyncEditor();
        this.updateView();
    },

    sortAndSyncEditor() {
        let editorEntries = [...this.allEntries];
        switch (this.currentSort) {
            case 'title-asc':
                editorEntries.sort((a, b) => (a.title || a.key).localeCompare(b.title || b.key));
                break;
            case 'title-desc':
                editorEntries.sort((a, b) => (b.title || b.key).localeCompare(a.title || a.key));
                break;
            case 'author-asc':
                editorEntries.sort((a, b) => a.author.localeCompare(b.author));
                break;
            case 'author-desc':
                editorEntries.sort((a, b) => b.author.localeCompare(a.author));
                break;
            case 'year-desc':
                editorEntries.sort((a, b) => {
                    const aY = parseInt(a.year, 10) || 0;
                    const bY = parseInt(b.year, 10) || 0;
                    return bY - aY;
                });
                break;
            case 'year-asc':
                editorEntries.sort((a, b) => {
                    const aY = parseInt(a.year, 10) || 0;
                    const bY = parseInt(b.year, 10) || 0;
                    return aY - bY;
                });
                break;
            case 'type':
                editorEntries.sort((a, b) => a.type.localeCompare(b.type) || (a.title || a.key).localeCompare(b.title || b.key));
                break;
            case 'original':
            default:
                editorEntries.sort((a, b) => a.originalIndex - b.originalIndex);
                break;
        }

        let newText = "";
        editorEntries.forEach(entry => {
            newText += entry.precedingText + entry.rawText;
        });
        newText += this.trailingText || "";

        if (EditorModule.editorInstance && EditorModule.editorInstance.getValue() !== newText) {
            EditorModule.updateSortedContent(newText);
            
            if (FileModule.activeFileId) {
                const file = FileModule.files.find(f => f.id === FileModule.activeFileId);
                if (file) {
                    file.content = newText;
                }
            }
            
            this.allEntries = editorEntries;
            this.allEntries.forEach((e, idx) => e.originalIndex = idx);
        }
    },

    // Martin: Verarbeitet Sortierung und Filterung der BibTeX-Liste über alle Felder
    updateView() {
        // Umfassende Suche: durchsucht alle Felder (Author, Title, Ort/Address, Location, Publisher, Type, Key etc.)
        let processed = this.allEntries;
        if (this.searchTerms && this.searchTerms.length > 0) {
            const queryTerms = this.searchTerms.map(t => t.toLowerCase());
            processed = processed.filter(entry => {
                // Ein Eintrag matcht, wenn mindestens ein Suchbegriff (ODER-Logik) zutrifft
                return queryTerms.some(q => {
                    // 1. Key & Typ prüfen
                    if (entry.key && entry.key.toLowerCase().includes(q)) return true;
                    if (entry.type && entry.type.toLowerCase().includes(q)) return true;

                    // 2. Alle extrahierten Felder prüfen (address, location, ort, publisher, booktitle, journal etc.)
                    if (entry.fields) {
                        for (const val of Object.values(entry.fields)) {
                            if (typeof val === 'string' && val.toLowerCase().includes(q)) {
                                return true;
                            }
                        }
                    }

                    // 3. Titel, Autor, Jahr direkt prüfen
                    if (entry.title && entry.title.toLowerCase().includes(q)) return true;
                    if (entry.author && entry.author.toLowerCase().includes(q)) return true;
                    if (entry.year && entry.year.toLowerCase().includes(q)) return true;

                    // 4. Fallback: Volltext des Eintrags
                    if (entry.rawText && entry.rawText.toLowerCase().includes(q)) return true;

                    return false;
                });
            });
        }

        // Konsistente Sortierung mit bidirektionalen Optionen
        switch (this.currentSort) {
            case 'title-asc':
                processed.sort((a, b) => (a.title || a.key).localeCompare(b.title || b.key));
                break;
            case 'title-desc':
                processed.sort((a, b) => (b.title || b.key).localeCompare(a.title || a.key));
                break;
            case 'author-asc':
                processed.sort((a, b) => a.author.localeCompare(b.author));
                break;
            case 'author-desc':
                processed.sort((a, b) => b.author.localeCompare(a.author));
                break;
            case 'year-desc':
                processed.sort((a, b) => {
                    const aY = parseInt(a.year, 10) || 0;
                    const bY = parseInt(b.year, 10) || 0;
                    return bY - aY;
                });
                break;
            case 'year-asc':
                processed.sort((a, b) => {
                    const aY = parseInt(a.year, 10) || 0;
                    const bY = parseInt(b.year, 10) || 0;
                    return aY - bY;
                });
                break;
            case 'type':
                processed.sort((a, b) => a.type.localeCompare(b.type) || (a.title || a.key).localeCompare(b.title || b.key));
                break;
            // 'original' - keine Sortierung
        }
        this.renderList(processed);
    },

    // Neugestaltete Eintrags-Anzeige: Titel/Autor/Jahr im Fokus, Key sekundär & Treffer-Hervorhebung
    renderList(entriesArray) {
        if (!this.citationListUl) return;
        this.citationListUl.innerHTML = "";

        // Statistik und Treffer-Anzahl
        if (this.countDisplay) {
            const total = this.allEntries.length;
            const shown = entriesArray.length;
            if (this.searchTerms && this.searchTerms.length > 0) {
                this.countDisplay.textContent = shown + (shown === 1 ? " match found" : " matches found");
            } else {
                this.countDisplay.textContent = "Total: " + total + (total === 1 ? " entry" : " entries");
            }
        }

        if (entriesArray.length === 0) {
            const emptyLi = document.createElement("li");
            emptyLi.setAttribute("data-empty", "true");
            emptyLi.style.padding = "10px";
            emptyLi.style.color = "var(--text-muted)";
            emptyLi.textContent = "No matches found";
            this.citationListUl.appendChild(emptyLi);
            return;
        }

        const queryTerms = (this.searchTerms || []).map(t => t.toLowerCase());

        entriesArray.forEach(entry => {
            const li = document.createElement("li");
            li.setAttribute("data-key", entry.key); // Für Reverse-Nav & Jump

            const infoDiv = document.createElement("div");
            infoDiv.className = "entry-info";

            const titleSpan = document.createElement("span");
            titleSpan.className = "entry-title";
            titleSpan.innerHTML = this.highlightTextToHTML(entry.title || entry.key, this.searchTerms);
            infoDiv.appendChild(titleSpan);

            const metaSpan = document.createElement("span");
            metaSpan.className = "entry-meta";
            metaSpan.innerHTML = this.highlightTextToHTML(entry.author + " (" + entry.year + ")", this.searchTerms);
            infoDiv.appendChild(metaSpan);

            const keySpan = document.createElement("span");
            keySpan.className = "entry-key";
            keySpan.innerHTML = this.highlightTextToHTML(entry.key, this.searchTerms);

            if (entry.link) {
                const anchor = document.createElement("a");
                anchor.href = entry.link;
                anchor.target = "_blank";
                anchor.rel = "noopener noreferrer";
                anchor.className = "sidebar-link-btn";
                // UI-Feedback: Tooltip (title) und Icon je nach Link-Typ
                anchor.title = entry.linkType === 'doi' ? `DOI: ${entry.link}` : `URL: ${entry.link}`;
                anchor.textContent = entry.linkType === 'doi' ? "DOI" : "Link";
                // stopPropagation auf dem Link, damit nur der Link geöffnet wird
                anchor.addEventListener('click', (e) => e.stopPropagation());
                keySpan.appendChild(anchor);
            }
            infoDiv.appendChild(keySpan);

            // Match-Vorschau: Wenn ein Feld außerhalb von title, author, year gematcht hat (z.B. address, ort, publisher)
            if (queryTerms.length > 0 && entry.fields) {
                const matchedFields = Object.entries(entry.fields).filter(([k, v]) => {
                    if (['title', 'author', 'year'].includes(k)) return false;
                    return typeof v === 'string' && queryTerms.some(q => v.toLowerCase().includes(q));
                });

                if (matchedFields.length > 0) {
                    // Zeige bis zu 2 getroffene Zusatzfelder als Vorschau an
                    matchedFields.slice(0, 2).forEach(([k, val]) => {
                        const previewDiv = document.createElement("div");
                        previewDiv.className = "entry-match-preview";

                        let label = k;
                        if (['address', 'location', 'ort', 'city'].includes(k)) {
                            label = "Location (" + k + ")";
                        } else {
                            label = k.charAt(0).toUpperCase() + k.slice(1);
                        }

                        const labelSpan = document.createElement("span");
                        labelSpan.className = "match-field-label";
                        labelSpan.textContent = label + ":";

                        const valSpan = document.createElement("span");
                        valSpan.className = "match-field-value";
                        valSpan.innerHTML = this.highlightTextToHTML(val, this.searchTerms);

                        previewDiv.appendChild(labelSpan);
                        previewDiv.appendChild(valSpan);
                        infoDiv.appendChild(previewDiv);
                    });
                }
            }

            const actionsDiv = document.createElement("div");
            actionsDiv.className = "entry-actions";

            const badge = document.createElement("span");
            badge.className = "entry-type-badge";
            badge.innerHTML = this.highlightTextToHTML(entry.type, this.searchTerms);
            actionsDiv.appendChild(badge);

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "entry-delete-btn";
            deleteBtn.title = "Delete entry";
            deleteBtn.setAttribute("aria-label", "Delete entry");
            deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.openDeleteModal(entry);
            });
            actionsDiv.appendChild(deleteBtn);

            li.appendChild(infoDiv);
            li.appendChild(actionsDiv);

            li.onclick = () => {
                this.highlightKey(entry.key);
                EditorModule.jumpToKey(entry.key, true);
            };
            this.citationListUl.appendChild(li);
        });
    },

    getFirstVisibleKey() {
        const firstLi = this.citationListUl.querySelector("li:not([data-empty])");
        if (!firstLi) return null;
        return firstLi.getAttribute("data-key") || null;
    },

    highlightKey(key) {
        if (!this.citationListUl) return;
        
        const items = this.citationListUl.querySelectorAll("li:not([data-empty])");
        let targetLi = null;
        
        items.forEach(li => {
            if (li.getAttribute("data-key") === key) {
                li.classList.add("active-cite");
                targetLi = li;
            } else {
                li.classList.remove("active-cite");
            }
        });
        
        if (targetLi) {
            targetLi.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    },

    openDeleteModal(entry) {
        this.entryToDelete = entry;
        if (this.deletePreview) {
            const titleDisplay = entry.title ? `"${entry.title}"` : 'Untitled';
            this.deletePreview.textContent = `@${entry.type}{${entry.key}}\n${titleDisplay} (${entry.author}, ${entry.year})`;
        }
        if (this.deleteModal) {
            this.deleteModal.classList.add("show-modal");
        }
    },

    closeDeleteModal() {
        if (this.deleteModal) {
            this.deleteModal.classList.remove("show-modal");
        }
        this.entryToDelete = null;
    },

    confirmDelete() {
        if (!this.entryToDelete) return;
        const key = this.entryToDelete.key;
        this.closeDeleteModal();
        EditorModule.deleteEntryByKey(key);
    }
};

// --- 6. RESIZER MODULE (Verantwortung: Alexandros) ---
const ResizerModule = {
    init() {
        const resizer = document.getElementById("resizer");
        const body = document.body;
        let isResizing = false;
        if (!resizer) return;
        // Alexandros: Initialisierung des Resize-Vorgangs (Sidebar/Top-Bar HÃƒÂ¶he oder Breite)
        resizer.addEventListener("mousedown", (e) => {
            isResizing = true;
            const isSideBySide = body.classList.contains('layout-side-by-side');
            body.style.cursor = isSideBySide ? "col-resize" : "row-resize";
            body.style.userSelect = "none";
        });
        window.addEventListener("mousemove", (e) => {
            if (!isResizing) return;
            const isSideBySide = body.classList.contains('layout-side-by-side');

            if (isSideBySide) {
                // Side-by-Side-Modus: X-Achse Ã¢â€ â€™ Sidebar-Breite ÃƒÂ¤ndern
                let newSidebarWidth = e.clientX;
                if (newSidebarWidth < 150) newSidebarWidth = 150;
                if (newSidebarWidth > window.innerWidth * 0.5) newSidebarWidth = window.innerWidth * 0.5;
                body.style.gridTemplateColumns = `${newSidebarWidth}px 5px 1fr`;
            } else {
                // Standard-Modus: Y-Achse Ã¢â€ â€™ Sidebar-HÃƒÂ¶he ÃƒÂ¤ndern
                const headerHeight = document.querySelector(".top-nav").offsetHeight;
                let newSidebarHeight = e.clientY - headerHeight;
                if (newSidebarHeight < 50) newSidebarHeight = 50;
                if (newSidebarHeight > window.innerHeight * 0.8) newSidebarHeight = window.innerHeight * 0.8;
                body.style.gridTemplateRows = `${headerHeight}px ${newSidebarHeight}px 5px 1fr`;
            }
            // Felix: Refresh des Editors nach Layout-Ãƒâ€žnderung
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
            // Martin: Reagiert auf Tastatureingaben fÃƒÂ¼r die Filterung
            input.addEventListener("input", (e) => SidebarModule.setSearchTerm(e.target.value));
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                const key = SidebarModule.getFirstVisibleKey();
                if (key) {
                    SidebarModule.highlightKey(key);
                    EditorModule.jumpToKey(key, true);
                }
            });
        }
    }
};

// --- 7.4 IDENTIFIER IMPORT MODULE (DOI, arXiv, ISBN, URL) ---
const IdentifierImportModule = {
    modal: null,
    openBtn: null,
    input: null,
    fetchBtn: null,
    fetchIcon: null,
    fetchText: null,
    badge: null,
    statusText: null,
    previewContainer: null,
    previewTextarea: null,
    keyTag: null,
    cancelBtn: null,
    confirmBtn: null,
    currentDetected: null,

    init() {
        this.modal = document.querySelector("#identifier-modal");
        this.openBtn = document.querySelector("#btn-import-identifier");
        if (!this.modal || !this.openBtn) return;

        this.input = document.querySelector("#identifier-input");
        this.fetchBtn = document.querySelector("#btn-fetch-identifier");
        this.fetchIcon = document.querySelector("#identifier-fetch-icon");
        this.fetchText = document.querySelector("#identifier-fetch-text");
        this.badge = document.querySelector("#identifier-type-badge");
        this.statusText = document.querySelector("#identifier-status-text");
        this.previewContainer = document.querySelector("#identifier-preview-container");
        this.previewTextarea = document.querySelector("#identifier-preview-textarea");
        this.keyTag = document.querySelector("#identifier-key-tag");
        this.cancelBtn = document.querySelector("#btn-cancel-identifier");
        this.confirmBtn = document.querySelector("#btn-confirm-identifier");

        this.setupListeners();
    },

    setupListeners() {
        this.openBtn.addEventListener("click", (e) => {
            e.preventDefault();
            document.querySelectorAll(".dropdownImportClass").forEach(el => el.classList.remove("show"));
            this.openModal();
        });

        if (this.cancelBtn) {
            this.cancelBtn.addEventListener("click", () => this.closeModal());
        }

        if (this.modal) {
            this.modal.addEventListener("click", (e) => {
                if (e.target === this.modal) this.closeModal();
            });
        }

        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.modal && this.modal.classList.contains("show-modal")) {
                this.closeModal();
            }
        });

        if (this.input) {
            this.input.addEventListener("input", () => this.handleInputChange());
            this.input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    this.fetchMetadata();
                }
            });
        }

        if (this.fetchBtn) {
            this.fetchBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.fetchMetadata();
            });
        }

        if (this.confirmBtn) {
            this.confirmBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.importEntry();
            });
        }

        if (this.previewTextarea) {
            this.previewTextarea.addEventListener("input", () => {
                this.updateKeyTagFromPreview();
            });
            this.previewTextarea.addEventListener("keydown", (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    this.importEntry();
                }
            });
        }
    },

    openModal() {
        this.modal.classList.add("show-modal");
        this.resetState();
        setTimeout(() => {
            if (this.input) this.input.focus();
        }, 60);
    },

    closeModal() {
        this.modal.classList.remove("show-modal");
    },

    resetState() {
        if (this.input) this.input.value = "";
        this.currentDetected = null;
        if (this.badge) {
            this.badge.style.display = "none";
            this.badge.className = "identifier-badge";
            this.badge.textContent = "";
        }
        if (this.statusText) {
            this.statusText.textContent = "";
            this.statusText.className = "identifier-status";
        }
        if (this.previewContainer) this.previewContainer.style.display = "none";
        if (this.previewTextarea) this.previewTextarea.value = "";
        if (this.keyTag) this.keyTag.textContent = "";
        if (this.confirmBtn) this.confirmBtn.disabled = true;
        this.setLoading(false);
    },

    setLoading(isLoading, message = "") {
        if (!this.fetchBtn) return;
        this.fetchBtn.disabled = isLoading;
        if (this.input) this.input.disabled = isLoading;
        if (this.confirmBtn && isLoading) this.confirmBtn.disabled = true;

        if (isLoading) {
            if (this.fetchIcon) {
                this.fetchIcon.textContent = "progress_activity";
                this.fetchIcon.classList.add("spin-icon");
            }
            if (this.fetchText) this.fetchText.textContent = "Loading...";
            if (this.statusText) {
                this.statusText.textContent = message || "Fetching metadata...";
                this.statusText.className = "identifier-status status-loading";
            }
        } else {
            if (this.fetchIcon) {
                this.fetchIcon.textContent = "sync";
                this.fetchIcon.classList.remove("spin-icon");
            }
            if (this.fetchText) this.fetchText.textContent = "Fetch";
        }
    },

    handleInputChange() {
        const val = this.input ? this.input.value : "";
        const detected = this.detectIdentifier(val);
        this.currentDetected = detected;

        if (detected) {
            this.badge.style.display = "inline-flex";
            this.badge.className = `identifier-badge badge-${detected.type}`;
            this.badge.textContent = detected.label;
            this.statusText.textContent = "";
            this.statusText.className = "identifier-status";
        } else if (val.trim()) {
            this.badge.style.display = "none";
            this.statusText.textContent = "Please enter a valid DOI, arXiv-ID, ISBN, or URL";
            this.statusText.className = "identifier-status";
        } else {
            this.badge.style.display = "none";
            this.statusText.textContent = "";
            this.statusText.className = "identifier-status";
        }
    },

    detectIdentifier(raw) {
        const trimmed = (raw || "").trim();
        if (!trimmed) return null;

        // 1. DOI Pattern
        const doiMatch = trimmed.match(/(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
        if (doiMatch) {
            let cleanDoi = doiMatch[1].replace(/[.,;)]+$/, '');
            const arxivDoiMatch = cleanDoi.match(/^10\.48550\/arXiv\.(.+)$/i);
            if (arxivDoiMatch) {
                return {
                    type: 'arxiv',
                    value: arxivDoiMatch[1].replace(/v\d+$/i, ''),
                    label: 'arXiv (via DataCite)'
                };
            }
            return {
                type: 'doi',
                value: cleanDoi,
                label: 'DOI (Crossref / DataCite)'
            };
        }

        // 2. arXiv Pattern
        const arxivUrlMatch = trimmed.match(/arxiv\.org\/(?:abs|pdf)\/([a-z\-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?/i);
        if (arxivUrlMatch) {
            return {
                type: 'arxiv',
                value: arxivUrlMatch[1],
                label: 'arXiv (via DataCite)'
            };
        }
        const arxivPrefixMatch = trimmed.match(/^arxiv:\s*([a-z\-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/i);
        if (arxivPrefixMatch) {
            return {
                type: 'arxiv',
                value: arxivPrefixMatch[1],
                label: 'arXiv (via DataCite)'
            };
        }
        const arxivRawNewMatch = trimmed.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/);
        if (arxivRawNewMatch) {
            return {
                type: 'arxiv',
                value: arxivRawNewMatch[1],
                label: 'arXiv (via DataCite)'
            };
        }
        const arxivRawOldMatch = trimmed.match(/^([a-z\-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i);
        if (arxivRawOldMatch) {
            return {
                type: 'arxiv',
                value: arxivRawOldMatch[1],
                label: 'arXiv (via DataCite)'
            };
        }

        // 3. ISBN Pattern
        const isbnClean = trimmed.replace(/^(?:isbn(?:-1[03])?:?\s*)/i, '').replace(/[-\s]/g, '');
        if (/^(?:97[89]\d{10}|\d{9}[\dX])$/i.test(isbnClean)) {
            return {
                type: 'isbn',
                value: isbnClean,
                label: 'ISBN (Open Library)'
            };
        }

        // 4. URL
        if (/^https?:\/\//i.test(trimmed)) {
            return {
                type: 'url',
                value: trimmed,
                label: 'Web URL (@misc)'
            };
        }

        return null;
    },

    async fetchMetadata() {
        const val = this.input ? this.input.value.trim() : "";
        if (!val) {
            this.statusText.textContent = "Please enter an identifier or URL.";
            this.statusText.className = "identifier-status status-error";
            return;
        }

        const detected = this.detectIdentifier(val);
        if (!detected) {
            this.statusText.textContent = "Unrecognized identifier format. Enter a DOI, arXiv ID, ISBN, or URL.";
            this.statusText.className = "identifier-status status-error";
            return;
        }

        this.setLoading(true, `Querying metadata for ${detected.label}...`);

        try {
            let bibtexRaw = "";
            switch (detected.type) {
                case "doi":
                    bibtexRaw = await this.fetchDoi(detected.value);
                    break;
                case "arxiv":
                    bibtexRaw = await this.fetchArxiv(detected.value);
                    break;
                case "isbn":
                    bibtexRaw = await this.fetchIsbn(detected.value);
                    break;
                case "url":
                    bibtexRaw = await this.fetchUrl(detected.value);
                    break;
                default:
                    throw new Error("Unsupported identifier type.");
            }

            if (!bibtexRaw || !bibtexRaw.trim()) {
                throw new Error("No metadata returned for this identifier.");
            }

            const formatted = this.normalizeBibtex(bibtexRaw.trim(), detected);
            this.previewTextarea.value = formatted;
            this.previewContainer.style.display = "flex";
            this.updateKeyTagFromPreview();
            this.confirmBtn.disabled = false;

            this.statusText.textContent = "Metadata successfully retrieved!";
            this.statusText.className = "identifier-status status-success";
            setTimeout(() => this.confirmBtn.focus(), 50);

        } catch (err) {
            console.error("[IdentifierImportModule] Fetch error:", err);
            this.statusText.textContent = err.message || "Failed to retrieve metadata.";
            this.statusText.className = "identifier-status status-error";
            this.previewContainer.style.display = "none";
            this.confirmBtn.disabled = true;
        } finally {
            this.setLoading(false);
        }
    },

    async fetchDoi(cleanDoi) {
        // 1. Crossref Content Transformation (direkt BibTeX)
        try {
            const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}/transform/application/x-bibtex`;
            const res = await fetch(url, { headers: { 'Accept': 'application/x-bibtex; charset=utf-8' } });
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('@')) {
                    return text.trim();
                }
            }
        } catch (e) {
            console.warn("[IdentifierImportModule] Crossref failed, trying DataCite...", e);
        }

        // 2. DataCite / CrossCite Content Negotiation
        try {
            const url = `https://data.crosscite.org/${encodeURIComponent(cleanDoi)}`;
            const res = await fetch(url, { headers: { 'Accept': 'application/x-bibtex; charset=utf-8' } });
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('@')) {
                    return text.trim();
                }
            }
        } catch (e) {
            console.warn("[IdentifierImportModule] DataCite failed, trying doi.org...", e);
        }

        // 3. doi.org Direct Content Negotiation
        try {
            const url = `https://doi.org/${encodeURIComponent(cleanDoi)}`;
            const res = await fetch(url, { headers: { 'Accept': 'application/x-bibtex; charset=utf-8' } });
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('@')) {
                    return text.trim();
                }
            }
        } catch (e) {
            console.error("[IdentifierImportModule] doi.org failed:", e);
        }

        throw new Error(`Could not resolve DOI "${cleanDoi}". Please verify the identifier.`);
    },

    async fetchArxiv(cleanArxivId) {
        const baseId = cleanArxivId.replace(/v\d+$/i, '');
        const arxivDoi = `10.48550/arXiv.${baseId}`;

        // 1. DataCite via arXiv DOI
        try {
            const url = `https://data.crosscite.org/${encodeURIComponent(arxivDoi)}`;
            const res = await fetch(url, { headers: { 'Accept': 'application/x-bibtex; charset=utf-8' } });
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('@')) {
                    return text.trim();
                }
            }
        } catch (e) {
            console.warn("[IdentifierImportModule] DataCite arXiv failed, trying doi.org...", e);
        }

        // 2. doi.org via arXiv DOI
        try {
            const url = `https://doi.org/${encodeURIComponent(arxivDoi)}`;
            const res = await fetch(url, { headers: { 'Accept': 'application/x-bibtex; charset=utf-8' } });
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('@')) {
                    return text.trim();
                }
            }
        } catch (e) {
            console.warn("[IdentifierImportModule] doi.org arXiv failed...", e);
        }

        // 3. Fallback: Standard @misc entry for arXiv
        const yearPrefix = /^\d{2}/.test(baseId) ? `20${baseId.slice(0, 2)}` : `${new Date().getFullYear()}`;
        return `@misc{arxiv_${baseId.replace(/[./]/g, '_')},
  title        = {arXiv preprint arXiv:${cleanArxivId}},
  eprint       = {${cleanArxivId}},
  archiveprefix = {arXiv},
  url          = {https://arxiv.org/abs/${cleanArxivId}},
  year         = {${yearPrefix}}
}`;
    },

    async fetchIsbn(cleanIsbn) {
        const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Open Library API error (${res.status}).`);
        }
        const data = await res.json();
        const book = data[`ISBN:${cleanIsbn}`];
        if (!book) {
            throw new Error(`No book found for ISBN ${cleanIsbn} on Open Library.`);
        }

        const title = book.title ? (book.subtitle ? `${book.title}: ${book.subtitle}` : book.title) : "Untitled";
        const authors = Array.isArray(book.authors) && book.authors.length > 0
            ? book.authors.map(a => a.name).join(" and ")
            : "";
        const publisher = Array.isArray(book.publishers) && book.publishers.length > 0
            ? book.publishers[0].name
            : "";
        const yearMatch = (book.publish_date || "").match(/\b(19\d\d|20\d\d)\b/);
        const year = yearMatch ? yearMatch[1] : "";

        let authorLast = "";
        if (book.authors && book.authors[0] && book.authors[0].name) {
            const parts = book.authors[0].name.trim().split(/\s+/);
            authorLast = parts[parts.length - 1].replace(/[^a-zA-Z0-9]/g, '');
        }
        const key = (authorLast && year) ? `${authorLast}${year}` : `isbn_${cleanIsbn}`;

        let bibtex = `@book{${key},\n`;
        if (authors) bibtex += `  author       = {${authors}},\n`;
        bibtex += `  title        = {${title}},\n`;
        if (publisher) bibtex += `  publisher    = {${publisher}},\n`;
        if (year) bibtex += `  year         = {${year}},\n`;
        bibtex += `  isbn         = {${cleanIsbn}},\n`;
        if (book.number_of_pages) bibtex += `  pages        = {${book.number_of_pages}},\n`;
        if (book.url) bibtex += `  url          = {${book.url}},\n`;
        bibtex = bibtex.replace(/,\n$/, '\n') + `}`;

        return bibtex;
    },

    async fetchUrl(rawUrl) {
        const doiMatch = rawUrl.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i);
        if (doiMatch) {
            return this.fetchDoi(doiMatch[0]);
        }
        const arxivMatch = rawUrl.match(/(\d{4}\.\d{4,5})/);
        if (rawUrl.includes("arxiv.org") && arxivMatch) {
            return this.fetchArxiv(arxivMatch[1]);
        }

        let hostname = "";
        try {
            hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
        } catch (_) {
            hostname = "webpage";
        }

        const currentYear = new Date().getFullYear();
        const today = new Date().toISOString().split('T')[0];
        const key = `${hostname.replace(/[^a-zA-Z0-9]/g, '')}_${currentYear}`;

        return `@misc{${key},
  title        = {${hostname}},
  url          = {${rawUrl}},
  note         = {Accessed: ${today}},
  year         = {${currentYear}}
}`;
    },

    normalizeBibtex(bibtexStr, detectedInfo) {
        const headerMatch = bibtexStr.match(/^@([a-zA-Z]+)\s*\{\s*([^,]+),/m);
        if (!headerMatch) return bibtexStr;
        const type = headerMatch[1];
        let key = headerMatch[2].trim();

        // Wenn der Key eine URL oder ein DOI-Pfad ist, erzeuge einen sauberen Key (Autor + Jahr)
        if (key.startsWith('http') || key.includes('/') || key.includes(':')) {
            const authorMatch = bibtexStr.match(/\bauthor\s*=\s*[\"{]([^,\"}]+)/i);
            const yearMatch = bibtexStr.match(/\byear\s*=\s*[\"{]?(\d{4})/i);
            let authorPart = "";
            if (authorMatch) {
                const authorRaw = authorMatch[1].trim();
                if (authorRaw.includes(',')) {
                    authorPart = authorRaw.split(',')[0].trim().replace(/[^a-zA-Z0-9]/g, '');
                } else {
                    const parts = authorRaw.split(/\s+/);
                    authorPart = parts[parts.length - 1].replace(/[^a-zA-Z0-9]/g, '');
                }
            }
            const yearPart = yearMatch ? yearMatch[1] : "";
            if (authorPart && yearPart) {
                key = `${authorPart}${yearPart}`;
            } else if (detectedInfo && detectedInfo.type === 'arxiv') {
                key = `arxiv_${detectedInfo.value.replace(/[./]/g, '_')}`;
            } else {
                key = `ref_${Date.now().toString().slice(-6)}`;
            }
        }

        // Ersetze unhandliche Keys
        let cleanedBibtex = bibtexStr.replace(/^(@[a-zA-Z]+\s*\{\s*)[^,]+,/m, `$1${key},`);

        // Formatierung vereinheitlichen mit ClipboardModule, falls vorhanden
        if (typeof ClipboardModule !== 'undefined' && typeof ClipboardModule.extractBibtexEntries === 'function') {
            const parsedList = ClipboardModule.extractBibtexEntries(cleanedBibtex);
            if (parsedList && parsedList.length > 0) {
                parsedList[0].key = key;
                return ClipboardModule.formatEntry(parsedList[0]);
            }
        }

        return cleanedBibtex;
    },

    updateKeyTagFromPreview() {
        if (!this.previewTextarea || !this.keyTag) return;
        const match = this.previewTextarea.value.match(/^@([a-zA-Z]+)\s*\{\s*([^,]+),/m);
        if (match) {
            this.keyTag.textContent = `@${match[1]}{${match[2].trim()}}`;
            if (this.confirmBtn) this.confirmBtn.disabled = false;
        } else {
            this.keyTag.textContent = "";
            if (this.confirmBtn) this.confirmBtn.disabled = true;
        }
    },

    importEntry() {
        if (!this.previewTextarea) return;
        let entryText = this.previewTextarea.value.trim();
        if (!entryText) return;

        const match = entryText.match(/^@([a-zA-Z]+)\s*\{\s*([^,]+),/m);
        if (!match) {
            alert("The entry does not appear to be valid BibTeX code. Please check the preview.");
            return;
        }

        const type = match[1];
        const baseKey = match[2].trim();

        if (!EditorModule.editorInstance) {
            if (FileModule.files.length === 0) {
                FileModule.addFile("Untitled.bib", "", null);
                FileModule.switchToTab(FileModule.files[0].id);
            }
        }

        const cm = EditorModule.editorInstance;
        if (!cm) {
            alert("No active editor found to insert the citation.");
            return;
        }

        const currentDoc = cm.getValue();

        // 1. Duplikatprüfung: Existiert der Key bereits im Dokument?
        let uniqueKey = baseKey;
        let counter = 1;
        const escapedBase = baseKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let keyExistsRegex = new RegExp(`^\\s*@\\w+\\s*\\{\\s*${escapedBase}\\s*,`, 'm');

        if (keyExistsRegex.test(currentDoc)) {
            while (keyExistsRegex.test(currentDoc)) {
                uniqueKey = `${baseKey}_${counter}`;
                const escapedNext = uniqueKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                keyExistsRegex = new RegExp(`^\\s*@\\w+\\s*\\{\\s*${escapedNext}\\s*,`, 'm');
                counter++;
            }
            entryText = entryText.replace(
                new RegExp(`^(\\s*@\\w+\\s*\\{\\s*)${escapedBase}(\\s*,)`, 'm'),
                `$1${uniqueKey}$2`
            );
        }

        // 2. Im Editor am Dokumentende anfügen
        const separator = (currentDoc.trim().length > 0)
            ? (currentDoc.endsWith('\n\n') ? '' : (currentDoc.endsWith('\n') ? '\n' : '\n\n'))
            : '';
        const insertionText = separator + entryText + '\n';
        const lastLine = cm.lineCount();
        cm.replaceRange(insertionText, { line: lastLine, ch: 0 });

        // 3. Modal schließen
        this.closeModal();

        // 4. Zum neuen Eintrag navigieren und hervorheben
        setTimeout(() => {
            EditorModule.jumpToKey(uniqueKey, true);
            if (typeof SidebarModule.highlightKey === "function") {
                SidebarModule.highlightKey(uniqueKey);
            }
        }, 80);

        // 5. Toast-Benachrichtigung
        this.showToast(
            "Imported from Identifier",
            `@${type}{${uniqueKey}} added to document`
        );
    },

    showToast(title, message) {
        if (typeof ClipboardModule !== 'undefined' && typeof ClipboardModule.showToast === 'function') {
            ClipboardModule.showToast(title, message);
            return;
        }
        const container = document.getElementById("toast-container");
        if (!container) return;
        const toast = document.createElement("div");
        toast.className = "toast-notification";
        toast.innerHTML = `
            <span class="material-symbols-outlined toast-icon">fingerprint</span>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add("hide");
            setTimeout(() => toast.remove(), 350);
        }, 3800);
    }
};

// --- 7.5 IMPORT MODULE (PDF- & Identifier-Import) ---
const ImportModule = {
    pdfBtn: null,
    pdfInput: null,

    init() {
        this.pdfBtn = document.querySelector("#btn-import-pdf");
        this.pdfInput = document.querySelector("#hidden-pdf-input");
        this.setupListeners();
        IdentifierImportModule.init();
    },

    setupListeners() {
        if (this.pdfBtn && this.pdfInput) {
            this.pdfBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.pdfInput.value = '';
                this.pdfInput.click();
                // Dropdown schliessen
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
     * filtert Kopf- und Fusszeilen heraus, isoliert das Literaturverzeichnis
     * und konvertiert alle Referenzen in typisierte BibTeX-Eintraege.
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
                const viewport = page.getViewport({ scale: 1.0 });
                const content = await page.getTextContent();

                // Laufende Kopf- und Fusszeilen anhand der vertikalen Position herausfiltern
                const items = content.items.filter(item => {
                    if (!item.transform) return true;
                    const y = item.transform[5];
                    return !(y > viewport.height - 40 || y < 35);
                });

                const pageText = items.map(item => item.str).join(" ");
                fullText += pageText + "\n";
            }

            console.log("PDF-Text extrahiert, Laenge:", fullText.length);

            const bibtex = this.extractReferences(fullText);

            if (!bibtex || bibtex.trim().length === 0) {
                alert("No references could be found in this PDF.\n\nPossible reasons:\n- The PDF does not contain a recognizable bibliography\n- The PDF is image-based (scan) without extractable text");
                return;
            }

            // Ergebnis als neuen Tab hinzufuegen
            const tabName = "import_" + file.name.replace(/\.pdf$/i, ".bib");
            FileModule.addFile(tabName, bibtex, null);
            FileModule.switchToTab(FileModule.files[FileModule.files.length - 1].id);
            console.log("PDF-Import abgeschlossen:", tabName);

        } catch (err) {
            console.error("Fehler beim PDF-Import:", err);
            alert("Error reading PDF file: " + err.message);
        }
    },

    /**
     * Bereinigt Worttrennungen am Zeilenende und PDF-Ligaturen.
     */
    cleanHyphenation(text) {
        return text
            // Worttrennungen mit Bindestrich: "metama- terials" -> "metamaterials"
            .replace(/([a-zA-Z]{2,})-\s+([a-zA-Z]{2,})/g, '$1$2')
            // PDF-Ligatur-Trennungen im Wortinneren
            .replace(/\bco\s*e\s+ffi\s*ci/gi, 'coeffici')
            .replace(/\be\s+ffi\s*ci/gi, 'effici')
            .replace(/\be\s+ffi\s*ca/gi, 'effica')
            .replace(/\be\s+ff\s*ect/gi, 'effect')
            .replace(/\ba\s+ff\s*ect/gi, 'affect')
            .replace(/\bdi\s+ff\s*ract/gi, 'diffract')
            .replace(/\bdi\s+ff\s*us/gi, 'diffus')
            .replace(/\bdi\s+ff\s*er/gi, 'differ')
            .replace(/\btra\s+ffi\s*c/gi, 'traffic')
            // PDF-Ligatur-Trennungen am Wortanfang
            .replace(/\bfl\s+(ow|exible|oat|at|oor|ip|ight)/gi, 'fl$1')
            .replace(/\bfi\s+(eld|rst|ve|lter|nite|nal|gure|le|rm|nd|xed|ber)/gi, 'fi$1')
            // Typografische Anfuehrungszeichen und Gedankenstriche vereinheitlichen
            .replace(/[\u2018\u2019´`]/g, "'")
            .replace(/[\u201C\u201D„‟]/g, '"')
            .replace(/[\u2013\u2014]/g, '--');
    },

    /**
     * Kernheuristik: Findet und isoliert den Referenz-Abschnitt im PDF-Text
     * und wandelt die einzelnen Referenzen in BibTeX-Eintraege um.
     */
    extractReferences(fullText) {
        // Schritt 1: Referenz-Abschnitt finden
        const refSection = this.findReferencesSection(fullText);

        if (!refSection || refSection.trim().length === 0) {
            console.warn("Kein Referenz-Abschnitt gefunden.");
            return "";
        }

        // Schritt 2: Einzelne Referenzen isolieren
        const rawRefs = this.splitReferences(refSection);

        if (rawRefs.length === 0) {
            console.warn("Keine einzelnen Referenzen extrahiert.");
            return "";
        }

        // Schritt 3: Jede Referenz in typisierten BibTeX-Eintrag umwandeln
        const seenKeys = new Set();
        const bibtexEntries = rawRefs
            .map((ref, i) => this.parseOneReference(ref.trim(), i + 1, seenKeys))
            .filter(e => e && e.trim().length > 0);

        return this.buildBibtexString(bibtexEntries);
    },

    /**
     * Erkennt den Beginn des Referenzabschnitts im Dokument.
     * Unterstuetzt Standard-Ueberschriften, Spationierung (z.B. IEEE "R EFERENCES")
     * und bietet einen Fallback auf sequenzielle Zitationsnummern.
     */
    findReferencesSection(fullText) {
        const refPatterns = [
            /(?:^|\n|\s{2,})(R\s*E\s*F\s*E\s*R\s*E\s*N\s*C\s*E\s*S|B\s*I\s*B\s*L\s*I\s*O\s*G\s*R\s*A\s*P\s*H\s*Y)\b/i,
            /(?:^|\n|\s{2,})(References|Bibliography|Literaturverzeichnis|Quellenverzeichnis|Literatur|Works\s+Cited)\b/i
        ];

        let bestIndex = -1;
        let matchLength = 0;

        for (const pattern of refPatterns) {
            const matches = [...fullText.matchAll(new RegExp(pattern, 'gi'))];
            for (const m of matches) {
                // Pruefen, ob nach der Ueberschrift Zitate wie [1] oder 1. folgen
                const afterText = fullText.substring(m.index, m.index + 400);
                if (/\[1\]|\b1\.\s+[A-Z]/.test(afterText)) {
                    bestIndex = m.index;
                    matchLength = m[0].length;
                    break;
                }
            }
            if (bestIndex !== -1) break;
            if (matches.length > 0) {
                const last = matches[matches.length - 1];
                bestIndex = last.index;
                matchLength = last[0].length;
            }
        }

        // Fallback: Falls keine Ueberschrift erkannt wurde, nach erstem [1] suchen
        if (bestIndex === -1) {
            const bracketSeq = fullText.match(/(?:^|\n|\s{2,})\[1\]\s+[A-Z]/);
            if (bracketSeq && fullText.includes('[2]')) {
                bestIndex = bracketSeq.index;
                matchLength = 0;
            }
        }

        if (bestIndex === -1) return "";

        let refSection = fullText.substring(bestIndex + matchLength).trim();

        // Optional: Abschneiden bei nachfolgenden Autoren-Biografien oder Anhang
        const cutoffPattern = /(?:\n\s*|\s{3,})(Biographies|About the Authors|APPENDIX\b|Anhang\b)/i;
        const cutMatch = refSection.match(cutoffPattern);
        if (cutMatch && cutMatch.index > 50) {
            refSection = refSection.substring(0, cutMatch.index).trim();
        }

        return refSection;
    },

    /**
     * Splittet den Referenz-Block in einzelne Referenzen.
     * Unterstuetzt nummerierte Formate: [1], [2] ... oder 1., 2., ... sowie Absaetze.
     */
    splitReferences(refText) {
        // Versuch 1: Nummerierung mit eckigen Klammern [1], [2], ...
        let parts = refText.split(/(?=(?:^|\s+)\[\d+\])/).map(p => p.trim()).filter(p => /^\[\d+\]/.test(p));
        if (parts.length >= 2) {
            return parts.map(p => p.replace(/^\[\d+\]\s*/, "").trim());
        }

        // Versuch 2: Nummerierung mit Punkt 1., 2., ...
        parts = refText.split(/(?=(?:^|\n)\s*\d{1,3}\.\s+[A-Z])/).map(p => p.trim()).filter(p => /^\d{1,3}\.\s+[A-Z]/.test(p));
        if (parts.length >= 2) {
            return parts.map(p => p.replace(/^\d{1,3}\.\s*/, "").trim());
        }

        // Fallback 1: Doppelte Zeilenumbrueche
        parts = refText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
        if (parts.length >= 2) return parts;

        // Fallback 2: Einzelne Zeilen, die lang genug sind
        return refText.split(/\n/).map(l => l.trim()).filter(l => l.length > 30);
    },

    /**
     * Versucht aus einem rohen Referenz-String BibTeX-Felder zu extrahieren.
     * Erkennt Typen (@article, @inproceedings, @book, @techreport, @phdthesis, @mastersthesis, @misc)
     * und extrahiert Felder wie author, title, journal, booktitle, publisher, address, year, pages etc.
     */
    parseOneReference(refText, index, seenKeys = new Set()) {
        if (!refText || refText.length < 10) return null;

        // Bereinigung von Hyphenation, Ligaturen und Whitespaces
        let text = this.cleanHyphenation(refText).replace(/\s+/g, " ").trim();

        // Fuehrende Zitationsnummern [1] oder 1. entfernen
        text = text.replace(/^(?:\[\d+\]|\d{1,3}\.)\s*/, '').trim();

        // Eventuelle Reste von Kopf-/Fusszeilen am Anfang oder Ende entfernen
        text = text.replace(/Authorized licensed use limited to:.*$/i, "").trim();
        text = text.replace(/Downloaded on .*$/i, "").trim();
        text = text.replace(/^\d+\s+IEEE TRANSACTIONS ON[^\n]*\s*/i, "").trim();
        text = text.replace(/^AN et al\.:[^\n]*\d+\s*/i, "").trim();

        // --- 1. Typ bestimmen ---
        let type = 'article';
        const isThesis = /\b(?:Ph\.?D\.?\s+(?:dissertation|thesis)|doctoral\s+dissertation|Dissertation)\b/i.test(text);
        const isMasters = /\b(?:M\.?S\.?\s+thesis|Master(?:'s)?\s+thesis|Masterarbeit|Bachelorarbeit)\b/i.test(text);
        const isTechReport = /\b(?:Tech\.?\s+Rep\.?|Technical\s+Report|Standard|Std\.)\b/i.test(text);
        const isConference = /\b(?:in\s+Proc|in\s+Proceedings|Conference|Symposium|Workshop|Congress)\b/i.test(text) ||
                             /\b(?:ICC|GLOBECOM|INFOCOM|ICASSP|VTC|WCNC|APWCS|IJCNN|EUSIPCO|SPAWC|SIGCOMM|MobiCom)\b/.test(text);
        const isArxiv = /\barXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)\b/i.test(text) || /\barXiv\s+Preprint\b/i.test(text);
        const isBook = /\b(?:Cambridge\s+Univ\.?\s+Press|Oxford\s+Univ\.?\s+Press|MIT\s+Press|Springer(?:\s+Nature|\s+Vieweg)?|Wiley(?:\s*&\s*Sons)?|Elsevier|Prentice[\s\-]*Hall|McGraw[\s\-]*Hill|Academic\s+Press|Addison[\s\-]*Wesley|De\s+Gruyter|CRC\s+Press|IEEE\s+Press|Hanser(?:\s+Verlag)?|[A-Z][a-zA-Z\s]+(?:Press|Publishers?|Verlag))\b/i.test(text) &&
                       !text.includes('"');

        if (isThesis) {
            type = 'phdthesis';
        } else if (isMasters) {
            type = 'mastersthesis';
        } else if (isTechReport) {
            type = 'techreport';
        } else if (isConference) {
            type = 'inproceedings';
        } else if (isBook) {
            type = 'book';
        } else if (isArxiv && !text.includes('IEEE Trans') && !text.includes('Nature') && !text.includes('Science')) {
            type = 'misc';
        } else {
            type = 'article';
        }

        // --- 2. Jahr und Monat extrahieren ---
        let year = '';
        const yearMatches = [...text.matchAll(/\b((?:19|20)\d{2})\b/g)];
        if (yearMatches.length > 0) {
            year = yearMatches[yearMatches.length - 1][1];
        }

        let month = '';
        const monthMatch = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i);
        if (monthMatch) {
            month = monthMatch[1].toLowerCase().substring(0, 3);
        }

        // --- 3. Autoren, Titel und Venue extrahieren ---
        let author = '';
        let title = '';
        let venuePart = '';
        let publisher = '';
        let address = '';

        // Fall A: Titel in Anfuehrungszeichen (Standard IEEE)
        const quoteMatch = text.match(/"([^"]{2,})"/);
        if (quoteMatch) {
            title = quoteMatch[1].trim().replace(/[,\.\s]+$/, '').trim();
            author = text.substring(0, quoteMatch.index).trim().replace(/[,;:\s]+$/, '').trim();
            venuePart = text.substring(quoteMatch.index + quoteMatch[0].length).trim().replace(/^[,\.\s]+/, '').trim();
        } else if (type === 'book') {
            // Fall B: Buch (z. B. "D. Tse and P. Viswanath, Fundamentals of Wireless Communication . Cambridge, U.K.: Cambridge Univ. Press, 2005.")
            const pubRegex = /\b(Cambridge\s+Univ\.?\s+Press|Oxford\s+Univ\.?\s+Press|MIT\s+Press|Springer(?:\s+Nature|\s+Vieweg)?|Wiley(?:\s*&\s*Sons)?|Elsevier|Prentice[\s\-]*Hall|McGraw[\s\-]*Hill|Academic\s+Press|Addison[\s\-]*Wesley|De\s+Gruyter|CRC\s+Press|IEEE\s+Press|Hanser(?:\s+Verlag)?|[A-Z][a-zA-Z\s]+(?:Press|Publishers?|Verlag))\b/i;
            const pubMatch = text.match(pubRegex);

            if (pubMatch) {
                publisher = pubMatch[0].trim().replace(/^[,\.\s]+|[,\.\s]+$/g, '');
                const beforePub = text.substring(0, pubMatch.index).trim();
                venuePart = text.substring(pubMatch.index).trim();

                let contentBefore = beforePub;
                if (beforePub.includes(':')) {
                    const colonIdx = beforePub.lastIndexOf(':');
                    const preColon = beforePub.substring(0, colonIdx).trim();
                    const addrMatch = preColon.match(/(?:^|[\.\n]\s*)([A-Z][a-zA-Z\s\.]+,\s*[A-Z\.\s]+)$/);
                    if (addrMatch) {
                        address = addrMatch[1].trim();
                        contentBefore = preColon.substring(0, addrMatch.index).trim();
                    } else {
                        const lastDot = preColon.lastIndexOf('.');
                        if (lastDot !== -1) {
                            address = preColon.substring(lastDot + 1).trim();
                            contentBefore = preColon.substring(0, lastDot).trim();
                        }
                    }
                }

                // Split author und title
                const andMatch = contentBefore.match(/^(.*?\band\s+[A-Z][a-zA-Z\.\s]+),\s*(.+)$/i);
                if (andMatch) {
                    author = andMatch[1].trim();
                    title = andMatch[2].trim();
                } else {
                    const singleMatch = contentBefore.match(/^([A-Z][a-zA-Z\.\s]+),\s*(.+)$/);
                    if (singleMatch) {
                        author = singleMatch[1].trim();
                        title = singleMatch[2].trim();
                    } else {
                        title = contentBefore;
                    }
                }
            } else {
                title = text;
            }
        } else {
            // Fall C: Kein Titel in Anfuehrungszeichen (z. B. APA / Harvard)
            if (yearMatches.length > 0) {
                const firstYear = yearMatches[0];
                author = text.substring(0, firstYear.index).trim().replace(/[\(\),;:\s]+$/, '');
                const afterYear = text.substring(firstYear.index + firstYear[0].length).trim().replace(/^[\)\.,;:\s]+/, '');
                const dot = afterYear.indexOf('.');
                if (dot > 5) {
                    title = afterYear.substring(0, dot).trim();
                    venuePart = afterYear.substring(dot + 1).trim();
                } else {
                    title = afterYear;
                }
            } else {
                const dotIdx = text.indexOf('.');
                if (dotIdx > 3 && dotIdx < 80) {
                    author = text.substring(0, dotIdx).trim();
                    title = text.substring(dotIdx + 1).trim();
                } else {
                    title = text;
                }
            }
        }

        // Autoren und Titel saeubern
        author = author.replace(/[\(\)\[\]]+/g, '').replace(/\s+/g, ' ').trim();
        title = title.replace(/^[,\.\s]+|[,\.\s]+$/g, '').trim();

        // --- 4. Spezifische Felder extrahieren ---
        let journal = '';
        let booktitle = '';
        let volume = '';
        let number = '';
        let pages = '';
        let doi = '';
        let eprint = '';
        let note = '';

        // DOI
        const doiMatch = text.match(/\b(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)\b/);
        if (doiMatch) {
            doi = doiMatch[1].replace(/[\.,\s]+$/, '');
        }

        // Volume / Number / Pages
        const volMatch = venuePart.match(/\bvol\.\s*(\d+)\b/i);
        if (volMatch) volume = volMatch[1];

        const noMatch = venuePart.match(/\bno\.\s*(\d+)\b/i);
        if (noMatch) number = noMatch[1];

        const ppMatch = venuePart.match(/\bpp?\.\s*([a-zA-Z]?\d+[\s\u2013\u2014\-]+[a-zA-Z]?\d+|\d+)\b/i);
        if (ppMatch) {
            pages = ppMatch[1].replace(/[\s\u2013\u2014\-]+/, '--');
        } else {
            const artMatch = venuePart.match(/\bArt\.\s*no\.\s*([a-zA-Z0-9]+)\b/i) || venuePart.match(/\bp\.\s*([a-zA-Z]\d+|\d+)\b/i);
            if (artMatch) pages = artMatch[1];
        }

        // ArXiv
        const arxivMatch = text.match(/arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)/i);
        if (arxivMatch) {
            eprint = arxivMatch[1];
            note = `arXiv:${eprint}`;
        }

        if (type === 'article') {
            let jText = venuePart;
            const jCutMatch = jText.match(/,\s*(?:vol\.|no\.|pp?\.|\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
            if (jCutMatch) {
                journal = jText.substring(0, jCutMatch.index).trim();
            } else {
                const comma = jText.indexOf(',');
                journal = (comma !== -1 ? jText.substring(0, comma) : jText).trim();
            }
            journal = journal.replace(/^[\s,;:]+|[\s,;:]+$/g, '').trim();
            if (!journal && isArxiv) {
                journal = `arXiv preprint arXiv:${eprint}`;
            }
        } else if (type === 'inproceedings') {
            const procMatch = venuePart.match(/\bin\s+(Proc\.[^,]+|Proceedings[^,]+|[^,]+Conference[^,]*|[^,]+Symposium[^,]*)/i);
            if (procMatch) {
                booktitle = procMatch[1].trim();
            } else {
                const comma = venuePart.indexOf(',');
                booktitle = (comma !== -1 ? venuePart.substring(0, comma) : venuePart).trim();
            }
            booktitle = booktitle.replace(/^[,\.\s]+|[,\.\s]+$/g, '').trim();
        }

        // --- 5. Zitationsschluessel (Key) erzeugen ---
        let firstAuthor = 'ref';
        if (author) {
            const firstA = author.split(/,|&|\band\b/i)[0].trim();
            const words = firstA.split(/\s+/).filter(w => {
                const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
                return clean.length > 1 && clean !== 'et' && clean !== 'al';
            });
            if (words.length > 0) {
                firstAuthor = words[words.length - 1];
            } else {
                firstAuthor = firstA.replace(/[^a-zA-Z]/g, '');
            }
        }
        firstAuthor = firstAuthor.replace(/[^a-zA-Z]/g, '').toLowerCase() || 'ref';

        let titleWord = '';
        if (title) {
            const stopWords = new Set(['with', 'from', 'that', 'this', 'using', 'over', 'into', 'under', 'towards', 'through']);
            const words = title.split(/\s+/).map(w => w.replace(/[^a-zA-Z]/g, '').toLowerCase()).filter(w => w.length > 3 && !stopWords.has(w));
            if (words.length > 0) titleWord = words[0];
        }

        let baseKey = `${firstAuthor}${year || ''}${titleWord ? '_' + titleWord : '_' + index}`;
        let finalKey = baseKey;
        let counter = 1;
        while (seenKeys.has(finalKey)) {
            counter++;
            finalKey = `${baseKey}_${counter}`;
        }
        seenKeys.add(finalKey);

        // --- 6. BibTeX-Eintrag aufbauen ---
        let entry = `@${type}{${finalKey},\n`;
        if (author) entry += `  author       = {${author}},\n`;
        if (title) entry += `  title        = {${title}},\n`;
        if (type === 'article' && journal) entry += `  journal      = {${journal}},\n`;
        if (type === 'inproceedings' && booktitle) entry += `  booktitle    = {${booktitle}},\n`;
        if (type === 'book' && publisher) entry += `  publisher    = {${publisher}},\n`;
        if (type === 'book' && address) entry += `  address      = {${address}},\n`;
        if (year) entry += `  year         = {${year}},\n`;
        if (month) entry += `  month        = {${month}},\n`;
        if (volume) entry += `  volume       = {${volume}},\n`;
        if (number) entry += `  number       = {${number}},\n`;
        if (pages) entry += `  pages        = {${pages}},\n`;
        if (doi) entry += `  doi          = {${doi}},\n`;
        if (eprint) {
            entry += `  eprint       = {${eprint}},\n`;
            entry += `  archiveprefix = {arXiv},\n`;
        }
        if (note && type === 'misc') entry += `  note         = {${note}},\n`;
        entry += `}`;

        return entry;
    },

    /**
     * Fuegt alle BibTeX-Eintraege zu einem String zusammen.
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
                // Alexandros: Steuerung der Dropdown-MenÃƒÂ¼s im Header
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

    // Globale Felder: in jedem Typ erlaubt
    globalFields: [
        "key", "note", "url", "doi", "isbn", "issn", "abstract",
        "keywords", "eprint", "crossref", "annote", "month", "archiveprefix"
    ],

    // Typspezifisches Feld-Mapping: welche Felder sind fuer welchen Typ ueblich
    fieldsForType: {
        article: [
            "author", "title", "journal", "year", "volume", "number",
            "pages", "numpages", "articleno", "issue_date"
        ],
        book: [
            "author", "editor", "title", "publisher", "year",
            "volume", "number", "series", "address", "edition"
        ],
        booklet: [
            "title", "author", "howpublished", "address", "year"
        ],
        conference: [
            "author", "title", "booktitle", "year", "editor",
            "volume", "number", "series", "pages", "address",
            "organization", "publisher", "numpages", "articleno", "location"
        ],
        inbook: [
            "author", "editor", "title", "chapter", "pages",
            "publisher", "year", "volume", "number", "series",
            "address", "edition", "type"
        ],
        incollection: [
            "author", "title", "booktitle", "publisher", "year",
            "editor", "volume", "number", "series", "type",
            "chapter", "pages", "address", "edition"
        ],
        inproceedings: [
            "author", "title", "booktitle", "year", "editor",
            "volume", "number", "series", "pages", "address",
            "organization", "publisher", "numpages", "articleno", "location"
        ],
        manual: [
            "title", "author", "organization", "address", "edition", "year"
        ],
        mastersthesis: [
            "author", "title", "school", "year", "type", "address"
        ],
        misc: [
            "author", "title", "howpublished", "year"
        ],
        phdthesis: [
            "author", "title", "school", "year", "type", "address"
        ],
        proceedings: [
            "title", "year", "editor", "volume", "number",
            "series", "address", "organization", "publisher"
        ],
        techreport: [
            "author", "title", "institution", "year", "type",
            "number", "address"
        ],
        unpublished: [
            "author", "title", "note", "year"
        ]
    },

    init() {
        // Felix: Integriert den Linter in die CodeMirror stex Umgebung
        CodeMirror.registerHelper("lint", "stex", (text) => {
            return this.validate(text);
        });
    },

    /**
     * Prueft ob ein Feldname fuer den gegebenen Typ gueltig ist.
     * Erlaubt: typspezifische Felder + globale Felder.
     */
    isFieldValidForType(fieldName, typeName) {
        // Globale Felder sind immer erlaubt
        if (this.globalFields.includes(fieldName)) return true;
        // Typspezifische Felder pruefen
        const typeFields = this.fieldsForType[typeName];
        if (typeFields) return typeFields.includes(fieldName);
        // Unbekannter Typ: Alle Felder aus allen Typen als Fallback sammeln
        const allFields = new Set(this.globalFields);
        Object.values(this.fieldsForType).forEach(fields => {
            fields.forEach(f => allFields.add(f));
        });
        return allFields.has(fieldName);
    },

    validate(text) {
        const errors = [];
        const lines = text.split("\n");
        const entryStartRegex = /^\s*@(\w+)\s*\{/;
        const fieldRegex = /^\s*(OPT)?([a-zA-Z][a-zA-Z0-9_]*)\s*=/;
        const keyExtractRegex = /^\s*@\w+\s*\{\s*([^,]+)/;
        const seenKeys = new Set();

        let openBraces = 0;
        let currentType = null;     // Merkt sich den aktuellen @type
        let insideEntry = false;

        // Vorverarbeitung: naechste nicht-leere Zeile nach jeder Zeile finden
        // (fuer praezise Komma-Pruefung)
        const nextMeaningfulLine = (fromIndex) => {
            for (let j = fromIndex + 1; j < lines.length; j++) {
                const t = lines[j].trim();
                if (t !== "" && !t.startsWith("%")) return t;
            }
            return null;
        };

        lines.forEach((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (trimmed.startsWith("%")) return;

            // Prueft auf korrekte BibTeX-Eintragstypen
            const typeMatch = trimmed.match(entryStartRegex);
            if (typeMatch) {
                const type = typeMatch[1].toLowerCase();
                currentType = type;
                insideEntry = true;

                if (!this.validTypes.includes(type)) {
                    errors.push({
                        from: CodeMirror.Pos(i, line.indexOf(typeMatch[1])),
                        to: CodeMirror.Pos(i, line.indexOf(typeMatch[1]) + typeMatch[1].length),
                        message: "Unknown entry type: \"@" + type + "\". Did you mean \"@article\"?",
                        severity: "error"
                    });
                }

                // Duplikat-Handling
                const keyMatch = trimmed.match(keyExtractRegex);
                if (keyMatch) {
                    const citationKey = keyMatch[1].trim();
                    if (seenKeys.has(citationKey)) {
                        const keyStart = line.indexOf(citationKey);
                        errors.push({
                            from: CodeMirror.Pos(i, keyStart),
                            to: CodeMirror.Pos(i, keyStart + citationKey.length),
                            message: "Duplicate BibTeX key: This citation key already exists above.",
                            severity: "error"
                        });
                    } else {
                        seenKeys.add(citationKey);
                    }
                }
            }

            // Ende eines Eintrags
            if (trimmed === "}" && insideEntry) {
                insideEntry = false;
                currentType = null;
            }

            // Feld-Pruefung innerhalb eines Eintrags
            if (insideEntry && !trimmed.startsWith("@") && trimmed.includes("=")) {
                const fieldMatch = trimmed.match(fieldRegex);
                if (fieldMatch) {
                    const fieldName = fieldMatch[2].toLowerCase();

                    // Typspezifische Feld-Validierung
                    if (currentType && this.validTypes.includes(currentType)) {
                        if (!this.isFieldValidForType(fieldName, currentType)) {
                            const startCol = line.indexOf(fieldMatch[2]);
                            errors.push({
                                from: CodeMirror.Pos(i, startCol),
                                to: CodeMirror.Pos(i, startCol + fieldName.length),
                                message: "The field \"" + fieldName + "\" is unusual for type \"@" + currentType + "\".",
                                severity: "warning"
                            });
                        }
                    } else if (!this.isFieldValidForType(fieldName, null)) {
                        // Fallback: komplett unbekanntes Feld
                        const startCol = line.indexOf(fieldMatch[2]);
                        errors.push({
                            from: CodeMirror.Pos(i, startCol),
                            to: CodeMirror.Pos(i, startCol + fieldName.length),
                            message: "Unknown field: \"" + fieldName + "\".",
                            severity: "warning"
                        });
                    }

                    // Praezise Komma-Pruefung: Zeile muss mit Komma enden,
                    // AUSSER die naechste nicht-leere Zeile ist }
                    if (!trimmed.endsWith(",")) {
                        const nextLine = nextMeaningfulLine(i);
                        if (nextLine && nextLine !== "}") {
                            errors.push({
                                from: CodeMirror.Pos(i, line.length - 1),
                                to: CodeMirror.Pos(i, line.length),
                                message: "Missing comma at the end of the field assignment.",
                                severity: "error"
                            });
                        }
                    }
                } else {
                    errors.push({
                        from: CodeMirror.Pos(i, 0),
                        to: CodeMirror.Pos(i, line.length),
                        message: "Syntax error: Unexpected format in assignment.",
                        severity: "error"
                    });
                }
            }

            // Klammer-Balance pro Zeile
            const opens = (line.match(/\{/g) || []).length;
            const closes = (line.match(/\}/g) || []).length;
            openBraces += (opens - closes);
        });

        if (openBraces !== 0) {
            errors.push({
                from: CodeMirror.Pos(lines.length - 1, 0),
                to: CodeMirror.Pos(lines.length - 1, lines[lines.length - 1].length),
                message: "Braces are unbalanced! (Open: " + openBraces + ")",
                severity: "error"
            });
        }
        return errors;
    }
};

// --- 10.5 HELP MODULE (Keyboard Shortcuts Modal) ---
const HelpModule = {
    shortcutsModal: null,

    init() {
        this.shortcutsModal = document.querySelector("#shortcuts-modal");
        this.setupListeners();
    },

    setupListeners() {
        // Shortcuts Modal
        const showShortcutsBtn = document.querySelector("#btn-show-shortcuts");
        const closeShortcutsBtn = document.querySelector("#btn-close-shortcuts");

        if (showShortcutsBtn && this.shortcutsModal) {
            showShortcutsBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.shortcutsModal.classList.add("show-modal");
                document.querySelectorAll(".dropdownHelpClass").forEach(el => el.classList.remove("show"));
            });
        }
        if (closeShortcutsBtn && this.shortcutsModal) {
            closeShortcutsBtn.addEventListener("click", () => {
                this.shortcutsModal.classList.remove("show-modal");
            });
        }

        // Klick auf Overlay schließt Modal
        if (this.shortcutsModal) {
            this.shortcutsModal.addEventListener("click", (e) => {
                if (e.target === this.shortcutsModal) this.shortcutsModal.classList.remove("show-modal");
            });
        }
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

// --- 12. LAYOUT MODULE (Layout-Toggle: Top-Bar Ã¢â€ â€ Side-by-Side) ---
const LayoutModule = {
    init() {
        const btn = document.getElementById('layout-toggle');
        const icon = document.getElementById('layout-toggle-icon');
        if (!btn || !icon) return;

        // Gespeichertes Layout aus localStorage wiederherstellen
        const saved = localStorage.getItem('bibstream-layout');
        if (saved === 'side-by-side') {
            document.body.classList.add('layout-side-by-side');
            icon.textContent = 'horizontal_split';
        }

        btn.addEventListener('click', () => this.toggle());
    },

    toggle() {
        const body = document.body;
        const icon = document.getElementById('layout-toggle-icon');
        const isSideBySide = body.classList.toggle('layout-side-by-side');

        // Icon anpassen: zeigt das jeweils andere Layout
        icon.textContent = isSideBySide ? 'horizontal_split' : 'vertical_split';

        // Inline-Grid-Styles zurÃƒÂ¼cksetzen, damit das CSS-Grid sauber greift
        body.style.gridTemplateRows = '';
        body.style.gridTemplateColumns = '';

        // Layout-Wahl persistieren
        localStorage.setItem('bibstream-layout', isSideBySide ? 'side-by-side' : 'default');

        // Editor muss nach Layout-Wechsel neu gerendert werden
        if (EditorModule.editorInstance) {
            setTimeout(() => EditorModule.editorInstance.refresh(), 50);
        }
    }
};

// --- 13. CLIPBOARD MODULE (Automatische Überwachung & Zitat-Import) ---
const ClipboardModule = {
    isEnabled: true,
    isChecking: false,
    hasPermissionFailed: false,
    lastCheckTime: 0,
    lastClipboardText: "",
    importedSignatures: new Set(),
    toastContainer: null,
    toggleBtn: null,

    wasOutside: false,

    init() {
        this.toastContainer = document.getElementById("toast-container");
        this.toggleBtn = document.getElementById("clipboard-toggle");

        // Vorherige Sitzungssignaturen bereinigen
        try {
            sessionStorage.removeItem("bibstream_imported_signatures");
        } catch (e) {}
        this.importedSignatures.clear();

        // Gespeicherten Zustand laden (Standard: aktiv)
        const savedPref = localStorage.getItem("bibstream-clipboard-watcher");
        if (savedPref !== null) {
            this.isEnabled = savedPref === "true";
        }
        this.updateToggleBtnState();

        if (this.toggleBtn) {
            this.toggleBtn.addEventListener("click", () => this.toggle());
        }

        const menuToggle = document.getElementById("menu-toggle-clipboard");
        if (menuToggle) {
            menuToggle.addEventListener("click", (e) => {
                e.preventDefault();
                this.toggle();
                document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
            });
        }


        // 1. Erkennung, wenn Benutzer den BibStream-Tab verlässt und zurückkehrt
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                this.wasOutside = true;
            } else if (document.visibilityState === "visible") {
                if (this.wasOutside && this.isEnabled) {
                    this.wasOutside = false;
                    // Beim Zurückkehren von einer externen Seite (z.B. IEEE) sofort prüfen
                    setTimeout(() => this.checkClipboard(false, true), 50);
                }
            }
        });

        // 2. Fenster-Fokus (z.B. bei geteiltem Bildschirm / zwei Fenstern)
        window.addEventListener("blur", () => {
            this.wasOutside = true;
        });

        window.addEventListener("focus", () => {
            if (this.wasOutside && this.isEnabled) {
                this.wasOutside = false;
                setTimeout(() => this.checkClipboard(false, true), 60);
            }
        });

        // 3. Erster Klick nach Rückkehr von extern (garantiert Browser-User-Activation)
        document.addEventListener("pointerdown", () => {
            if (this.wasOutside && this.isEnabled) {
                this.wasOutside = false;
                this.checkClipboard(true, true);
            }
        }, { capture: true });

        // 4. Internes Kopieren in BibStream: Kopierten Text als bekannt markieren,
        // damit dieser nicht unbeabsichtigt als neues Zitat auto-importiert wird
        document.addEventListener("copy", () => {
            const sel = window.getSelection ? window.getSelection().toString() : "";
            if (sel) {
                this.lastClipboardText = sel.trim();
            }
        });

        // 5. Normales Einfügen (Strg+V): Funktioniert IMMER ohne Browser-Berechtigungs-Prompt
        window.addEventListener("paste", (e) => {
            const pastedText = e.clipboardData ? e.clipboardData.getData("text") : "";
            if (pastedText) {
                const entries = this.extractBibtexEntries(pastedText);
                if (entries.length > 0) {
                    e.preventDefault();
                    this.processText(pastedText);
                }
            }
        });

        // Beim ersten Laden den aktuellen Clipboard-Inhalt initial synchronisieren
        this.syncCurrentClipboard();
    },

    /**
     * Wird aufgerufen, wenn der Benutzer zwischen Bib-Dateien (Tabs) wechselt.
     * Verhindert zuverlässig, dass das zuvor kopierte Zitat in die neu gewählte Datei eingefügt wird.
     */
    async onTabSwitched() {
        this.wasOutside = false;
        await this.syncCurrentClipboard();
    },

    async syncCurrentClipboard() {
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") return;
        try {
            const text = await navigator.clipboard.readText();
            if (text && typeof text === "string") {
                this.lastClipboardText = text.trim();
            }
        } catch (err) {}
    },

    toggle() {
        this.isEnabled = !this.isEnabled;
        localStorage.setItem("bibstream-clipboard-watcher", this.isEnabled ? "true" : "false");
        this.updateToggleBtnState();
        if (this.isEnabled) {
            this.showToast("Auto-import active", "Checks for citations when switching to BibStream");
            this.checkClipboard(true, true);
        } else {
            this.showToast("Auto-import paused", "Automatic detection disabled");
        }
    },

    updateToggleBtnState() {
        const btn = document.getElementById("clipboard-toggle");
        const label = document.getElementById("clipboard-toggle-label");
        const menuIcon = document.getElementById("menu-clipboard-icon");
        const menuStatus = document.getElementById("menu-clipboard-status");

        if (btn) {
            if (this.isEnabled) {
                btn.classList.add("active");
                btn.title = "Auto-import: Active - Click to disable";
                if (label) label.textContent = "Auto-Import: On";
            } else {
                btn.classList.remove("active");
                btn.title = "Auto-import: Inactive - Click to enable";
                if (label) label.textContent = "Auto-Import: Off";
            }
        }

        if (menuIcon) {
            menuIcon.textContent = this.isEnabled ? "toggle_on" : "toggle_off";
        }
        if (menuStatus) {
            menuStatus.textContent = this.isEnabled ? "On" : "Off";
        }
    },

    async checkClipboard(isUserGesture = false, forceCheck = false) {
        if (!this.isEnabled) return;
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") return;

        // Keine parallelen Abfragen
        if (this.isChecking) return;

        // Cooldown bei automatischen Fokus-Events (mindestens 300ms)
        const now = Date.now();
        if (!isUserGesture && !forceCheck && (now - this.lastCheckTime < 300)) return;
        this.lastCheckTime = now;

        this.isChecking = true;
        try {
            const text = await navigator.clipboard.readText();
            if (text && typeof text === "string") {
                const trimmed = text.trim();
                if (trimmed) {
                    this.lastClipboardText = trimmed;
                    this.processText(trimmed);
                }
            }
        } catch (err) {
            console.log("[ClipboardModule] readText:", err && err.message);
        } finally {
            this.isChecking = false;
        }
    },

    /**
     * Prüft, ob der gegebene Text einen oder mehrere BibTeX-Einträge enthält.
     * Unterstützt IEEE (@INPROCEEDINGS{11404116, ...}), ACM, Springer, arXiv etc.
     */
    processText(rawText) {
        const entries = this.extractBibtexEntries(rawText);
        if (!entries || entries.length === 0) return;

        entries.forEach(entry => {
            this.handleDetectedEntry(entry);
        });
    },

    /**
     * Robustes Parsing und Extrahieren von BibTeX-Zitaten aus Rohtext.
     * Berücksichtigt Brace-Depth, Klammern, Quotes und IEEE-Besonderheiten.
     */
    extractBibtexEntries(text) {
        const results = [];
        const regex = /@([a-zA-Z]+)\s*([{(])/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const type = match[1];
            const openDelim = match[2];
            const closeDelim = openDelim === '{' ? '}' : ')';
            const startIndex = match.index;
            const bodyStart = match.index + match[0].length;

            let depth = 1;
            let i = bodyStart;
            let inQuotes = false;

            while (i < text.length && depth > 0) {
                const char = text[i];
                const prevChar = i > 0 ? text[i - 1] : '';

                if (char === '"' && prevChar !== '\\') {
                    inQuotes = !inQuotes;
                } else if (!inQuotes) {
                    if (char === openDelim) {
                        depth++;
                    } else if (char === closeDelim) {
                        depth--;
                    }
                }
                if (depth > 0) i++;
            }

            if (depth === 0) {
                const fullRaw = text.substring(startIndex, i + 1);
                const afterDelim = text.substring(bodyStart, i);
                
                // Key extrahieren: alles bis zum ersten Komma
                const firstComma = afterDelim.indexOf(',');
                if (firstComma > 0) {
                    const key = afterDelim.substring(0, firstComma).trim();
                    const body = afterDelim.substring(firstComma + 1);

                    // Validierung: Mindestens ein '=' Zeichen im Body
                    if (key && body.includes('=')) {
                        results.push({
                            type: type,
                            key: key,
                            raw: fullRaw,
                            openDelim: openDelim,
                            closeDelim: closeDelim,
                            body: body
                        });
                        regex.lastIndex = i + 1;
                    }
                }
            }
        }
        return results;
    },

    /**
     * Formatiert den BibTeX-Eintrag sauber (Einrückung 2 Spaces, Ausrichtung '='-Zeichen,
     * schließende Klammer auf eigener Zeile).
     */
    formatEntry(entryObj) {
        const typeLower = entryObj.type.toLowerCase();
        const key = entryObj.key;
        const fields = this.parseFieldsFromBody(entryObj.body);

        let formatted = `@${typeLower}{${key},\n`;
        fields.forEach((f, idx) => {
            const fieldName = f.name.toLowerCase().padEnd(12);
            const valFormatted = (f.value.startsWith('{') || f.value.startsWith('"')) ? f.value : `{${f.value}}`;
            const isLast = idx === fields.length - 1;
            formatted += `  ${fieldName} = ${valFormatted}${isLast ? '' : ','}\n`;
        });
        formatted += `}`;
        return formatted;
    },

    /**
     * Zerlegt den Body eines BibTeX-Eintrags in einzelne Feld-Wert-Paare.
     */
    parseFieldsFromBody(body) {
        const fields = [];
        let i = 0;
        const len = body.length;

        while (i < len) {
            // Whitespace & Kommas überspringen
            while (i < len && (/\s/.test(body[i]) || body[i] === ',')) i++;
            if (i >= len) break;

            // Feldname lesen
            const nameStart = i;
            while (i < len && body[i] !== '=' && !/\s/.test(body[i]) && body[i] !== '}' && body[i] !== ')') i++;
            const name = body.substring(nameStart, i).trim();
            if (!name) break;

            // Bis '=' laufen
            while (i < len && body[i] !== '=') i++;
            if (i >= len) break;
            i++; // '=' überspringen

            // Führende Whitespaces vor Wert überspringen
            while (i < len && /\s/.test(body[i])) i++;
            if (i >= len) break;

            // Wert ermitteln
            const valChar = body[i];
            let value = "";
            if (valChar === '{') {
                let depth = 1;
                const valStart = i;
                i++;
                while (i < len && depth > 0) {
                    if (body[i] === '{') depth++;
                    else if (body[i] === '}') depth--;
                    if (depth > 0) i++;
                }
                value = body.substring(valStart, i + 1);
                i++;
            } else if (valChar === '"') {
                const valStart = i;
                i++;
                while (i < len) {
                    if (body[i] === '"' && body[i - 1] !== '\\') break;
                    i++;
                }
                value = body.substring(valStart, i + 1);
                i++;
            } else {
                // Unquoted Wert bis zum nächsten Komma oder Zeilenende
                const valStart = i;
                while (i < len && body[i] !== ',' && body[i] !== '\n' && body[i] !== '}' && body[i] !== ')') {
                    i++;
                }
                value = body.substring(valStart, i).trim();
            }

            if (name && value) {
                fields.push({ name, value: value.trim() });
            }
        }

        return fields;
    },

    /**
     * Fügt einen erkannten BibTeX-Eintrag in den Editor ein und hebt ihn hervor.
     * Stellt sicher, dass das Zitat nur ein einziges Mal eingefügt wird
     * und niemals beim Wechseln von Bib-Dateien wiederholt wird.
     */
    handleDetectedEntry(entryObj) {
        if (!EditorModule.editorInstance) return;
        const cm = EditorModule.editorInstance;
        const currentDoc = cm.getValue();

        const escapedKey = entryObj.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const keyExistsRegex = new RegExp(`@\\w+\\s*\\{\\s*${escapedKey}\\s*,`, 'i');

        // 1. Prüfen, ob dieser Eintrag bereits im aktuellen Dokument vorhanden ist
        if (keyExistsRegex.test(currentDoc)) {
            console.log(`[ClipboardModule] Eintrag ${entryObj.key} existiert bereits in dieser Datei.`);
            EditorModule.jumpToKey(entryObj.key, true);
            if (typeof SidebarModule.highlightKey === "function") {
                SidebarModule.highlightKey(entryObj.key);
            }
            this.showToast("Already exists", `@${entryObj.type}{${entryObj.key}} already exists`);
            return;
        }

        const finalKey = entryObj.key;

        // 2. Sauber formatieren
        const formatted = this.formatEntry(entryObj);

        // 3. Im Editor am Ende anfügen
        const separator = (currentDoc.trim().length > 0)
            ? (currentDoc.endsWith('\n\n') ? '' : (currentDoc.endsWith('\n') ? '\n' : '\n\n'))
            : '';
        const insertionText = separator + formatted + '\n';
        const lastLine = cm.lineCount();
        const insertFrom = { line: lastLine, ch: 0 };

        cm.replaceRange(insertionText, insertFrom);

        // 4. Zum neuen Eintrag springen, den gesamten Block markieren und fokussieren
        setTimeout(() => {
            EditorModule.jumpToKey(finalKey, true);
            if (typeof SidebarModule.highlightKey === "function") {
                SidebarModule.highlightKey(finalKey);
            }
        }, 80);

        // 5. Toast-Benachrichtigung anzeigen
        this.showToast(
            "New citation added from clipboard",
            `@${entryObj.type}{${finalKey}}`
        );
        console.log(`[ClipboardModule] Neuer Eintrag hinzugefügt: ${finalKey}`);
    },

    showToast(title, message) {
        if (!this.toastContainer) {
            this.toastContainer = document.getElementById("toast-container");
            if (!this.toastContainer) return;
        }

        const toast = document.createElement("div");
        toast.className = "toast-notification";
        toast.innerHTML = `
            <span class="material-symbols-outlined toast-icon">content_paste_go</span>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
        `;

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("hide");
            setTimeout(() => toast.remove(), 350);
        }, 3800);
    }
};

// Starten
document.addEventListener("DOMContentLoaded", () => {
    LinterModule.init();
    App.init();
});
