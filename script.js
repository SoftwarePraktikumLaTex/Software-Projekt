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
            FileModule.addFile("Unbenannt.bib", "");
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
                                alert('Diese .txt-Datei enthÃƒÂ¤lt keinen erkennbaren BibTeX-Inhalt und wird nicht importiert.');
                                return;
                            }
                        }
                        this.addFile(file.name, content, handle);
                        this.addToRecentFiles(file.name, content);
                        if (this.files.length > 0) this.switchToTab(this.files[this.files.length - 1].id);
                    } catch (err) {
                        if (err.name !== 'AbortError') console.error("Ãƒâ€“ffnen fehlgeschlagen:", err);
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
        // Alexandros: UnterstÃƒÂ¼tzung fÃƒÂ¼r Ordner-Import
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

    // Alexandros: Implementierung der Speicherlogik (Direktes ÃƒÅ“berschreiben via FileHandle)
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
                // Dirty-Flag zurÃƒÂ¼cksetzen und Tabs aktualisieren
                file.dirty = false;
                this.renderTabs();
                console.log("Erfolgreich ÃƒÂ¼berschrieben:", file.name);
                alert(`"${file.name}" gespeichert!`);
            } catch (err) {
                console.error("Fehler beim ÃƒÅ“berschreiben:", err);
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
                // Dirty-Flag zurÃƒÂ¼cksetzen
                file.dirty = false;
                this.renderTabs();
                alert("Gespeichert!");
            } catch (err) { /* Abbruch */ }
        } else {
            this.legacyDownload(file.name, file.content);
            // Dirty-Flag zurÃƒÂ¼cksetzen nach Download
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
        // FIX: BUG-3 behoben Ã¢â‚¬â€œ Fehlermeldung nennt jetzt beide akzeptierten Dateitypen
        if (count === 0) alert("Keine .bib oder .txt Dateien gefunden.");
    },

    readFileAndAdd(fileObj) {
        const reader = new FileReader();
        reader.onload = (e) => {
            let content = e.target.result;
            // TXT-Import: BibTeX-BlÃƒÂ¶cke extrahieren, Rest verwerfen
            if (fileObj.name.toLowerCase().endsWith('.txt')) {
                content = this.extractBibtex(content);
                if (!content) {
                    alert('Diese .txt-Datei enthÃƒÂ¤lt keinen erkennbaren BibTeX-Inhalt und wird nicht importiert.');
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
        const name = `Unbenannt_${this.files.length + 1}.bib`;
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

        // FIX: BUG-1 behoben Ã¢â‚¬â€œ Defensiver Guard: prÃƒÂ¼fe ob Funktion existiert
        this.editorInstance.on("change", (cm) => {
            if (this.isProgrammaticUpdate) return;
            if (typeof FileModule.updateActiveFileContent === 'function') {
                FileModule.updateActiveFileContent(cm.getValue());
            }
            // Dirty-Flag setzen: Datei hat ungespeicherte Ãƒâ€žnderungen
            FileModule.markActiveDirty();
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

        // Felix: Historie beim Laden eines neuen Tabs lÃƒÂ¶schen, 
        // damit man nicht in die Datei davor "zurÃƒÂ¼ck-undon" kann.
        this.editorInstance.clearHistory();

        this.isProgrammaticUpdate = false;
    },

    updateSortedContent(text) {
        if (!this.editorInstance) return;
        this.isProgrammaticUpdate = true;
        this.editorInstance.setValue(text);
        this.isProgrammaticUpdate = false;
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
     * Scrollt den Eintrag bündig an den oberen Bildschirmrand und
     * hebt den gesamten Block kurzzeitig farblich hervor.
     */
    jumpToKey(keyName) {
        if (!this.editorInstance) return;
        this.isJumping = true; // Ping-Pong Effekt verhindern
        const cm = this.editorInstance;
        const cursor = cm.getSearchCursor(keyName);
        if (!cursor.findNext()) {
            setTimeout(() => this.isJumping = false, 300);
            return;
        }

        const matchLine = cursor.from().line;

        // Finde den Start des @type{-Blocks (rückwärts ab Treffer-Zeile)
        let blockStart = matchLine;
        for (let i = matchLine; i >= 0; i--) {
            if (cm.getLine(i).trim().startsWith('@')) {
                blockStart = i;
                break;
            }
        }

        // Finde das Ende des Blocks (vorwärts per Klammertiefe)
        let blockEnd = matchLine;
        let depth = 0;
        const totalLines = cm.lineCount();
        for (let i = blockStart; i < totalLines; i++) {
            const line = cm.getLine(i);
            for (const ch of line) {
                if (ch === '{') depth++;
                else if (ch === '}') depth--;
            }
            if (depth <= 0) {
                blockEnd = i;
                break;
            }
        }

        // Selektion auf den Key setzen
        cm.setSelection(cursor.from(), cursor.to());

        // Scroll: Eintrag bündig oben am Bildschirmrand
        const topCoord = cm.charCoords({ line: blockStart, ch: 0 }, 'local').top;
        cm.scrollTo(null, topCoord);

        // Farbliches Highlighting des gesamten Blocks (temporär)
        const markers = [];
        for (let i = blockStart; i <= blockEnd; i++) {
            cm.addLineClass(i, 'background', 'jumptokey-highlight');
            markers.push(i);
        }
        // Highlight nach 1.5s wieder entfernen
        setTimeout(() => {
            markers.forEach(line => {
                cm.removeLineClass(line, 'background', 'jumptokey-highlight');
            });
        }, 1500);

        cm.focus();
        setTimeout(() => this.isJumping = false, 300);
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
    trailingText: "",

    init() {
        this.countDisplay = document.querySelector("#citation-count");
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
     * Bereinigt einen extrahierten Feldwert für die UI-Anzeige in der Cite-Liste.
     * Entfernt geschweifte Klammern (auch innere Klammern wie {FF}) und normalisiert Whitespaces,
     * ohne den Rohtext im Editor zu verändern.
     */
    cleanValueForUI(rawVal) {
        if (!rawVal) return "";
        return rawVal.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    },

    // Martin: Parser zur Extraktion von Key, Typ, Titel, Autor, Jahr und Link
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

                // Verschachtelungssicheres Parsing aller Felder
                const rawTitle = this.extractFieldValue(content, 'title');
                const title = this.cleanValueForUI(rawTitle);

                const rawAuthor = this.extractFieldValue(content, 'author');
                const author = rawAuthor ? this.cleanValueForUI(rawAuthor) : "Unbekannt";

                const rawYear = this.extractFieldValue(content, 'year');
                const yearMatch = rawYear ? rawYear.match(/\d{4}/) : null;
                const year = yearMatch ? yearMatch[0] : "????";

                // Extrahiert URL oder DOI für einen klickbaren Link (mit Unterstützung für OPT-Präfixe)
                const rawDoi = this.extractFieldValue(content, 'doi');
                const rawUrl = this.extractFieldValue(content, 'url');
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
        this.currentSearch = term.toLowerCase();
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

    // Martin: Verarbeitet Sortierung und Filterung der BibTeX-Liste
    updateView() {
        // Erweiterte Suche: durchsucht alle Felder (Key, Titel, Autor, Jahr, Typ)
        let processed = this.allEntries;
        if (this.currentSearch) {
            const q = this.currentSearch;
            processed = processed.filter(entry =>
                entry.key.toLowerCase().includes(q) ||
                entry.title.toLowerCase().includes(q) ||
                entry.author.toLowerCase().includes(q) ||
                entry.year.toLowerCase().includes(q) ||
                entry.type.toLowerCase().includes(q)
            );
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

    // Neugestaltete Eintrags-Anzeige: Titel/Autor/Jahr im Fokus, Key sekundaer
    renderList(entriesArray) {
        if (!this.citationListUl) return;
        this.citationListUl.innerHTML = "";

        // Statistik und Treffer-Anzahl
        if (this.countDisplay) {
            const total = this.allEntries.length;
            const shown = entriesArray.length;
            if (this.currentSearch) {
                this.countDisplay.textContent = shown + " Treffer gefunden";
            } else {
                this.countDisplay.textContent = "Gesamt: " + total + " Eintr\u00e4ge";
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

        entriesArray.forEach(entry => {
            const li = document.createElement("li");
            li.setAttribute("data-key", entry.key); // Hinzugefügt für Reverse-Nav

            const infoDiv = document.createElement("div");
            infoDiv.className = "entry-info";

            const titleSpan = document.createElement("span");
            titleSpan.className = "entry-title";
            titleSpan.textContent = entry.title || entry.key;
            infoDiv.appendChild(titleSpan);

            const metaSpan = document.createElement("span");
            metaSpan.className = "entry-meta";
            metaSpan.textContent = entry.author + " (" + entry.year + ")";
            infoDiv.appendChild(metaSpan);

            const keySpan = document.createElement("span");
            keySpan.className = "entry-key";
            keySpan.textContent = entry.key;

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

            const badge = document.createElement("span");
            badge.className = "entry-type-badge";
            badge.textContent = entry.type;

            li.appendChild(infoDiv);
            li.appendChild(badge);

            li.onclick = () => EditorModule.jumpToKey(entry.key);
            this.citationListUl.appendChild(li);
        });
    },

    getFirstVisibleKey() {
        const firstKeySpan = this.citationListUl.querySelector("li:not([data-empty]) .entry-key");
        if (!firstKeySpan) return null;
        const clone = firstKeySpan.cloneNode(true);
        const linkChild = clone.querySelector('.sidebar-link-btn');
        if (linkChild) linkChild.remove();
        return clone.textContent.trim() || null;
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
                alert("Es konnten keine Referenzen in dieser PDF gefunden werden.\n\nMoegliche Gruende:\n- Die PDF enthaelt kein erkennbares Literaturverzeichnis\n- Die PDF ist bildbasiert (Scan) und enthaelt keinen extrahierbaren Text");
                return;
            }

            // Ergebnis als neuen Tab hinzufuegen
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
     * Bereinigt Worttrennungen am Zeilenende und PDF-Ligaturen.
     */
    cleanHyphenation(text) {
        return text
            // Worttrennungen mit Bindestrich: "metama- terials" -> "metamaterials"
            .replace(/([a-zA-Z]{2,})-\s+([a-zA-Z]{2,})/g, '$1$2')
            // Ligatur-Artefakte beheben: "e ffi cient" -> "efficient", "di ff ractive" -> "diffractive"
            .replace(/\b([a-zA-Z]+)\s+(ffi|ff|fl|fi)\s+([a-zA-Z]+)\b/g, '$1$2$3')
            .replace(/\b([a-zA-Z]+)\s+(ffi|ff|fl|fi)\b/g, '$1$2')
            .replace(/\b(ffi|ff|fl|fi)\s+([a-zA-Z]+)\b/g, '$1$2')
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
        if (cutMatch && cutMatch.index > 500) {
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

        // Eventuelle Reste von Kopf-/Fusszeilen am Anfang oder Ende entfernen
        text = text.replace(/Authorized licensed use limited to:.*$/i, "").trim();
        text = text.replace(/Downloaded on .*$/i, "").trim();
        text = text.replace(/^\d+\s+IEEE TRANSACTIONS ON[^\n]*\s*/i, "").trim();
        text = text.replace(/^AN et al\.:[^\n]*\d+\s*/i, "").trim();

        // --- 1. Typ bestimmen ---
        let type = 'article';
        const isThesis = /\b(?:Ph\.?D\.?\s+(?:dissertation|thesis)|doctoral\s+dissertation)\b/i.test(text);
        const isMasters = /\b(?:M\.?S\.?\s+thesis|Master(?:'s)?\s+thesis)\b/i.test(text);
        const isTechReport = /\b(?:Tech\.?\s+Rep\.?|Technical\s+Report|Standard|Std\.)\b/i.test(text);
        const isConference = /\b(?:in\s+Proc|in\s+Proceedings|Conference|Symposium|Workshop|Congress)\b/i.test(text) ||
                             /\b(?:ICC|GLOBECOM|INFOCOM|ICASSP|VTC|WCNC|APWCS|IJCNN|EUSIPCO|SPAWC|SIGCOMM|MobiCom)\b/.test(text);
        const isArxiv = /\barXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)\b/i.test(text) || /\barXiv\s+Preprint\b/i.test(text);
        const isBook = /\b(?:Cambridge\s+Univ\.?\s+Press|Oxford\s+Univ\.?\s+Press|MIT\s+Press|Springer(?:\s+Nature)?|Wiley(?:\s*&\s*Sons)?|Elsevier|Prentice[\s\-]*Hall|McGraw[\s\-]*Hill|Academic\s+Press|Addison[\s\-]*Wesley|De\s+Gruyter|CRC\s+Press|IEEE\s+Press|[A-Z][a-zA-Z\s]+(?:Press|Publishers?))\b/i.test(text) &&
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
        const monthMatch = text.match(/\b(Jan\.?|Feb\.?|Mar\.?|Apr\.?|May|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\b/i);
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
        const quoteMatch = text.match(/"([^"]{5,})"/);
        if (quoteMatch) {
            title = quoteMatch[1].trim().replace(/[,\.\s]+$/, '').trim();
            author = text.substring(0, quoteMatch.index).trim().replace(/[,;:\s]+$/, '').trim();
            venuePart = text.substring(quoteMatch.index + quoteMatch[0].length).trim().replace(/^[,\.\s]+/, '').trim();
        } else if (type === 'book') {
            // Fall B: Buch (z. B. "D. Tse and P. Viswanath, Fundamentals of Wireless Communication . Cambridge, U.K.: Cambridge Univ. Press, 2005.")
            const pubRegex = /\b(Cambridge\s+Univ\.?\s+Press|Oxford\s+Univ\.?\s+Press|MIT\s+Press|Springer(?:\s+Nature)?|Wiley(?:\s*&\s*Sons)?|Elsevier|Prentice[\s\-]*Hall|McGraw[\s\-]*Hill|Academic\s+Press|Addison[\s\-]*Wesley|De\s+Gruyter|CRC\s+Press|IEEE\s+Press|[A-Z][a-zA-Z\s]+(?:Press|Publishers?))\b/i;
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
            journal = journal.replace(/^[,\.\s]+|[,\.\s]+$/g, '').trim();
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
                        message: "Unbekannter Eintragstyp: \"@" + type + "\". Meinten Sie \"@article\"?",
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
                            message: "Doppelter BibTeX-Key: Dieser Zitationsschluessel existiert bereits weiter oben.",
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
                                message: "Das Feld \"" + fieldName + "\" ist fuer den Typ \"@" + currentType + "\" unueblich.",
                                severity: "warning"
                            });
                        }
                    } else if (!this.isFieldValidForType(fieldName, null)) {
                        // Fallback: komplett unbekanntes Feld
                        const startCol = line.indexOf(fieldMatch[2]);
                        errors.push({
                            from: CodeMirror.Pos(i, startCol),
                            to: CodeMirror.Pos(i, startCol + fieldName.length),
                            message: "Unbekanntes Feld: \"" + fieldName + "\".",
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
                                message: "Fehlendes Komma am Ende der Feldzuweisung.",
                                severity: "error"
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

            // Klammer-Balance pro Zeile
            const opens = (line.match(/\{/g) || []).length;
            const closes = (line.match(/\}/g) || []).length;
            openBraces += (opens - closes);
        });

        if (openBraces !== 0) {
            errors.push({
                from: CodeMirror.Pos(lines.length - 1, 0),
                to: CodeMirror.Pos(lines.length - 1, lines[lines.length - 1].length),
                message: "Klammern sind nicht ausgeglichen! (Offen: " + openBraces + ")",
                severity: "error"
            });
        }
        return errors;
    }
};

// --- 10.5 HELP MODULE (Keyboard Shortcuts & Contact Modals) ---
const HelpModule = {
    shortcutsModal: null,
    contactModal: null,

    init() {
        this.shortcutsModal = document.querySelector("#shortcuts-modal");
        this.contactModal = document.querySelector("#contact-modal");
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

        // Contact Modal
        const showContactBtn = document.querySelector("#btn-show-contact");
        const closeContactBtn = document.querySelector("#btn-close-contact");

        if (showContactBtn && this.contactModal) {
            showContactBtn.addEventListener("click", (e) => {
                e.preventDefault();
                this.contactModal.classList.add("show-modal");
                document.querySelectorAll(".dropdownHelpClass").forEach(el => el.classList.remove("show"));
            });
        }
        if (closeContactBtn && this.contactModal) {
            closeContactBtn.addEventListener("click", () => {
                this.contactModal.classList.remove("show-modal");
            });
        }

        // Beide Modals: Klick auf Overlay schlieÃƒÅ¸t
        [this.shortcutsModal, this.contactModal].forEach(modal => {
            if (modal) {
                modal.addEventListener("click", (e) => {
                    if (e.target === modal) modal.classList.remove("show-modal");
                });
            }
        });
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

// Starten
document.addEventListener("DOMContentLoaded", () => {
    LinterModule.init();
    App.init();
});
