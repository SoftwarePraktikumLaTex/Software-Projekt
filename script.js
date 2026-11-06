/**
 * BIBTEX SMART-EDITOR - GESAMTSKRIPT
 * Erstellt im Rahmen der Bachelorarbeit
 * Arbeitsaufteilung: Alexandros (UI/Layout), Martin (Daten/Parser), Felix (Editor/Tools)
 */

// --- 1. HAUPT-APP (Gemeinsame Orchestrierung) ---
const App = {
    init() {
        // Ohne CodeMirror (z. B. offline) bleiben Menüs und Eintragsliste nutzbar, nur der Editor fehlt
        if (typeof CodeMirror === "undefined") {
            alert("The editor (CodeMirror) could not be loaded. Please check your internet connection and reload the page.");
        }

        // Alexandros: Initialisierung der UI-Rahmenkomponenten
        DropdownModule.init();
        ResizerModule.init();
        FileModule.init();

        // Martin: Initialisierung der Such- und Listenlogik
        SearchModule.init();
        SidebarModule.init();
        ImportModule.init();

        // Felix: Setup der Editor-Komponenten und Validierung
        // Der Linter wird vor dem Editor registriert, damit bereits die erste Prüfung greift
        LinterModule.init();
        EditorModule.init();
        FormatterModule.init();
        ThemeModule.init();
        HelpModule.init();

        // Alexandros: Layout-Toggle Initialisierung
        LayoutModule.init();

        // Clipboard-Watcher
        ClipboardModule.init();

        // Sitzung aus LocalStorage wiederherstellen
        FileModule.loadSession();

        // Fallback: Wenn kein gespeicherter Zustand vorhanden ist, leeren Tab erstellen
        if (FileModule.files.length === 0) {
            FileModule.addFile("Untitled.bib", "");
            FileModule.switchToTab(FileModule.files[0].id);
        }
    },
};

// --- 1.5 BIBTEX-PARSER (Gemeinsam: von Liste, Linter, Formatierung, Editor und Import genutzt) ---
const BibTeXParser = {
    SPECIAL_TYPES: ["string", "preamble", "comment"],
    VALID_KEY: /^[^\s"#%'(),={}<>\\]+$/,
    HEADER_AT_LINE_START: /\n[ \t]*@[a-zA-Z]\w*\s*[{(]/g,

    // Zeichenklassen über Zeichencodes (deutlich schneller als ein regulärer Ausdruck pro Zeichen)
    isSpace(code) {
        return code === 32 || (code >= 9 && code <= 13) || code === 160;
    },

    // In Feldnamen, Makros und Schlüsseln erlaubt: alles außer Leerraum und "#%'(),={}
    isNameChar(code) {
        return code > 32 && code !== 160 && code !== 34 && code !== 35 && code !== 37 && code !== 39 &&
            code !== 40 && code !== 41 && code !== 44 && code !== 61 && code !== 123 && code !== 125;
    },

    /**
     * Findet alle geschlossenen Einträge (@typ{...} und @typ(...)) und liefert Typ, Schlüssel
     * und Positionen. Ein nicht geschlossener Eintrag wird übersprungen, ohne die folgenden
     * Einträge zu verschlucken (er endet spätestens vor dem nächsten Eintragskopf am Zeilenanfang).
     */
    findEntries(text) {
        const entries = [];
        const headerRegex = /@([a-zA-Z]\w*)\s*([{(])/g;
        let match;
        while ((match = headerRegex.exec(text)) !== null) {
            const type = match[1].toLowerCase();
            const special = this.SPECIAL_TYPES.includes(type);
            const bodyStart = match.index + match[0].length;
            const limit = special ? text.length : this.nextHeaderAtLineStart(text, bodyStart);
            const close = this.findEntryEnd(text, bodyStart, match[2], limit);
            if (close === -1) continue;
            const entry = {
                type, special, open: match[2],
                start: match.index, end: close + 1,
                typeStart: match.index + 1, bodyStart, bodyEnd: close,
                key: "", keyStart: bodyStart, keyEnd: bodyStart, fieldsStart: close, validKey: false
            };
            if (!special) this.readKey(text, entry);
            entries.push(entry);
            headerRegex.lastIndex = entry.end;
        }
        return entries;
    },

    nextHeaderAtLineStart(text, from) {
        this.HEADER_AT_LINE_START.lastIndex = from;
        const match = this.HEADER_AT_LINE_START.exec(text);
        return match ? match.index + 1 : text.length;
    },

    // Klammerbilanzierung: Position der schließenden Klammer des Eintrags oder -1
    findEntryEnd(text, i, open, limit = text.length) {
        let depth = 0;
        let inQuotes = false;
        for (; i < limit; i++) {
            const ch = text[i];
            if (ch === "{") depth++;
            else if (ch === "}") {
                if (depth > 0) depth--;
                else if (open === "{") return i;
            } else if (open === "(" && depth === 0) {
                if (ch === '"') inQuotes = !inQuotes;
                else if (ch === ")" && !inQuotes) return i;
            }
        }
        return -1;
    },

    // Schlüssel bis zum ersten Komma; ohne Komma reicht er bis zum Eintragsende
    readKey(text, entry) {
        let i = entry.bodyStart;
        while (i < entry.bodyEnd && this.isSpace(text.charCodeAt(i))) i++;
        const comma = text.indexOf(",", i);
        const keyEnd = (comma === -1 || comma > entry.bodyEnd) ? entry.bodyEnd : comma;
        const key = text.slice(i, keyEnd).trim();
        entry.key = key;
        entry.keyStart = i;
        entry.keyEnd = i + key.length;
        entry.fieldsStart = keyEnd === entry.bodyEnd ? entry.bodyEnd : keyEnd + 1;
        entry.validKey = this.VALID_KEY.test(key);
    },

    /**
     * Liest einen Feldwert ab Position i: {…} (beliebig verschachtelt), "…", Zahl oder Makro,
     * auch mit #-Verkettung. Liefert das Ende (exklusiv) und die einzelnen Bestandteile.
     */
    scanValue(text, i, end) {
        const parts = [];
        let complete = true;
        while (i < end) {
            while (i < end && this.isSpace(text.charCodeAt(i))) i++;
            const start = i;
            const first = text.charCodeAt(i);
            if (first === 123) {
                // {…}: Klammerbilanzierung
                let depth = 0;
                do {
                    const code = text.charCodeAt(i);
                    if (code === 123) depth++;
                    else if (code === 125) depth--;
                    i++;
                } while (i < end && depth > 0);
                if (depth > 0) complete = false;
                parts.push({ kind: "brace", text: text.slice(start + 1, depth > 0 ? i : i - 1) });
            } else if (first === 34) {
                // "…": endet beim nächsten Anführungszeichen außerhalb geschweifter Klammern
                let depth = 0;
                i++;
                while (i < end) {
                    const code = text.charCodeAt(i);
                    if (code === 34 && depth === 0 && text.charCodeAt(i - 1) !== 92) break;
                    if (code === 123) depth++;
                    else if (code === 125 && depth > 0) depth--;
                    i++;
                }
                if (i >= end) complete = false;
                parts.push({ kind: "quote", text: text.slice(start + 1, Math.min(i, end)) });
                if (i < end) i++;
            } else {
                while (i < end && this.isNameChar(text.charCodeAt(i))) i++;
                if (i === start) break;
                parts.push({ kind: "bare", text: text.slice(start, i) });
            }
            let j = i;
            while (j < end && this.isSpace(text.charCodeAt(j))) j++;
            if (j >= end || text.charCodeAt(j) !== 35) break;
            i = j + 1;
        }
        return { end: i, parts, complete: complete && parts.length > 0 };
    },

    /**
     * Zerlegt den Rumpf eines Eintrags (ab dem Komma nach dem Schlüssel) in Felder.
     * complete ist false, sobald Text vorkommt, der keinem Feld zugeordnet werden kann.
     */
    scanFields(text, from, end) {
        const fields = [];
        let complete = true;
        let i = from;
        while (i < end) {
            while (i < end && (this.isSpace(text.charCodeAt(i)) || text.charCodeAt(i) === 44)) i++;
            if (i >= end) break;
            if (text.charCodeAt(i) === 37) {
                // Kommentarzeile innerhalb eines Eintrags überspringen
                complete = false;
                while (i < end && text.charCodeAt(i) !== 10) i++;
                continue;
            }
            const nameStart = i;
            while (i < end && this.isNameChar(text.charCodeAt(i))) i++;
            const nameEnd = i;
            while (i < end && this.isSpace(text.charCodeAt(i))) i++;
            if (nameEnd === nameStart || text.charCodeAt(i) !== 61) {
                complete = false;
                i = this.skipToComma(text, Math.max(i, nameStart + 1), end);
                continue;
            }
            i++;
            while (i < end && this.isSpace(text.charCodeAt(i))) i++;
            const valueStart = i;
            const value = this.scanValue(text, i, end);
            if (!value.complete) complete = false;
            const rawName = text.slice(nameStart, nameEnd);
            fields.push({
                rawName,
                name: rawName.replace(/^OPT(?=[a-z])/, "").toLowerCase(),
                nameStart, valueStart, valueEnd: value.end,
                parts: value.parts
            });
            i = value.end;
        }
        return { fields, complete };
    },

    skipToComma(text, i, end) {
        let depth = 0;
        for (; i < end; i++) {
            const ch = text[i];
            if (ch === "{") depth++;
            else if (ch === "}") depth = Math.max(0, depth - 1);
            else if (ch === "," && depth === 0) return i;
        }
        return end;
    },

    // Inhalt eines Werts ohne die äußeren Begrenzer (Teile einer #-Verkettung aneinandergefügt)
    valueText(parts) {
        return parts.map(part => part.text).join("");
    },

    // Feldnamen klein schreiben, ein OPT-Präfix (deaktiviertes Feld) aber erhalten
    formatFieldName(rawName) {
        return /^OPT[a-z]/.test(rawName) ? "OPT" + rawName.slice(3).toLowerCase() : rawName.toLowerCase();
    }
};

// --- 1.6 TOAST-BENACHRICHTIGUNGEN (Gemeinsam; Inhalte werden immer als Text gesetzt) ---
const ToastModule = {
    show(title, message, icon = "content_paste_go") {
        const container = document.getElementById("toast-container");
        if (!container) return;

        const toast = document.createElement("div");
        toast.className = "toast-notification";
        const iconEl = document.createElement("span");
        iconEl.className = "material-symbols-outlined toast-icon";
        iconEl.textContent = icon;
        const content = document.createElement("div");
        content.className = "toast-content";
        const titleEl = document.createElement("div");
        titleEl.className = "toast-title";
        titleEl.textContent = title;
        const messageEl = document.createElement("div");
        messageEl.className = "toast-message";
        messageEl.textContent = message;
        content.append(titleEl, messageEl);
        toast.append(iconEl, content);
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add("hide");
            setTimeout(() => toast.remove(), 350);
        }, 3800);
    }
};

// --- 2. FORMATTER MODUL (Verantwortung: Felix) ---
const FormatterModule = {
    settingsModal: document.querySelector("#settings-modal"),
    openBtn: document.querySelector("#btn-open-settings"),
    formatCodeBtn: null,
    insertTemplateBtn: null,
    saveBtn: document.querySelector("#btn-save-settings"),
    closeBtn: document.querySelector("#btn-close-settings"),
    checkboxes: document.querySelectorAll(".checkbox-grid input"),
    // Ausgewählte Felder; ohne gespeicherte Einstellung gilt die Vorauswahl im Dialog
    activeFields: new Set(),

    init() {
        if (!this.settingsModal) return;
        this.formatCodeBtn = document.querySelector("#btn-format-code");
        this.insertTemplateBtn = document.querySelector("#btn-insert-template");
        this.loadSettings();
        this.setupListeners();
    },

    setupListeners() {
        // Felix: Listener für das Modal-Fenster der Formatierungs-Einstellungen
        this.openBtn.addEventListener("click", (e) => {
            e.preventDefault();
            // Zuvor abgebrochene Änderungen an den Kontrollkästchen verwerfen
            this.syncCheckboxes();
            this.settingsModal.classList.add("show-modal");
            document.querySelectorAll(".dropdownEditClass").forEach(el => el.classList.remove("show"));
        });
        this.closeBtn.addEventListener("click", () => this.closeSettings());
        this.settingsModal.addEventListener("click", (e) => {
            if (e.target === this.settingsModal) this.closeSettings();
        });
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.settingsModal.classList.contains("show-modal")) this.closeSettings();
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
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem("bibFilterConfig"));
        } catch (err) { /* ungültige Einstellung ignorieren */ }
        if (Array.isArray(saved)) {
            this.activeFields = new Set(saved);
            this.syncCheckboxes();
        } else {
            this.activeFields = new Set([...this.checkboxes].filter(cb => cb.checked).map(cb => cb.getAttribute("data-field")));
        }
    },

    syncCheckboxes() {
        this.checkboxes.forEach(cb => {
            cb.checked = this.activeFields.has(cb.getAttribute("data-field"));
        });
    },

    closeSettings() {
        this.settingsModal.classList.remove("show-modal");
    },

    // ---- 1) Code formatieren: Nur Einrücken, nichts löschen ----
    runFormatCode() {
        const cm = EditorModule.editorInstance;
        if (!cm) return;
        const originalText = cm.getValue();
        const formatted = this.formatIndentation(originalText);
        if (formatted !== originalText) cm.setValue(formatted);
    },

    /**
     * Formatiert den BibTeX-Code: ein Feld pro Zeile, zwei Leerzeichen Einrückung, bündige
     * "="-Zeichen und eine Leerzeile nach jedem Eintrag. Feldwerte (auch mehrzeilige) bleiben
     * unverändert; Einträge, die nicht vollständig erkannt werden, bleiben, wie sie sind.
     */
    formatIndentation(text) {
        const keepLines = (chunk) => chunk.split("\n").filter(line => line.trim() !== "").map(line => line + "\n").join("");
        let result = "";
        let pos = 0;
        BibTeXParser.findEntries(text).forEach(entry => {
            result += keepLines(text.slice(pos, entry.start));
            result += this.formatEntry(text, entry) + "\n\n";
            pos = entry.end;
        });
        result += keepLines(text.slice(pos));
        return result.trim();
    },

    formatEntry(text, entry) {
        const raw = text.slice(entry.start, entry.end);
        if (entry.special || !entry.validKey) return raw;
        const { fields, complete } = BibTeXParser.scanFields(text, entry.fieldsStart, entry.bodyEnd);
        if (!complete) return raw;
        const type = text.slice(entry.typeStart, entry.typeStart + entry.type.length);
        if (fields.length === 0) return `@${type}{${entry.key}}`;
        const lines = fields.map(f => "  " + BibTeXParser.formatFieldName(f.rawName).padEnd(12) + " = " + text.slice(f.valueStart, f.valueEnd));
        return `@${type}{${entry.key},\n` + lines.join(",\n") + "\n}";
    },

    // ---- 2) Abgewählte Felder löschen ----
    runRemoveFields() {
        const cm = EditorModule.editorInstance;
        if (!cm) return;
        const originalText = cm.getValue();
        const cleaned = this.removeUncheckedFields(originalText);
        if (cleaned !== originalText) cm.setValue(cleaned);
    },

    /**
     * Entfernt nur Felder, die im Dialog angeboten und dort abgewählt sind. Alle anderen
     * Felder (z. B. booktitle oder school) bleiben erhalten; mehrzeilige Werte werden
     * vollständig entfernt.
     */
    removeUncheckedFields(text) {
        const offered = [...this.checkboxes].map(cb => cb.getAttribute("data-field"));
        const toRemove = new Set(offered.filter(field => !this.activeFields.has(field)));
        if (toRemove.size === 0) return text;

        const ranges = [];
        BibTeXParser.findEntries(text).forEach(entry => {
            if (entry.special || !entry.validKey) return;
            BibTeXParser.scanFields(text, entry.fieldsStart, entry.bodyEnd).fields.forEach(field => {
                if (toRemove.has(field.name)) ranges.push(this.fieldRemovalRange(text, field, entry));
            });
        });

        let result = "";
        let pos = 0;
        ranges.forEach(([from, to]) => {
            result += text.slice(pos, from);
            pos = to;
        });
        return result + text.slice(pos);
    },

    // Bereich eines Felds samt Komma; steht das Feld allein in seinen Zeilen, werden diese ganz entfernt
    fieldRemovalRange(text, field, entry) {
        let from = field.nameStart;
        let to = field.valueEnd;
        let j = to;
        while (j < entry.bodyEnd && (text[j] === " " || text[j] === "\t")) j++;
        const hasComma = j < entry.bodyEnd && text[j] === ",";
        if (hasComma) to = j + 1;
        while (to < entry.bodyEnd && (text[to] === " " || text[to] === "\t")) to++;

        const lineStart = text.lastIndexOf("\n", from - 1) + 1;
        const aloneInLine = /^[ \t]*$/.test(text.slice(lineStart, from));
        if (to < entry.bodyEnd && text[to] === "\n" && aloneInLine) {
            return [lineStart, to + 1];
        }
        if (!hasComma) {
            // Letztes Feld: das trennende Komma davor mit entfernen
            let k = from;
            while (k > entry.fieldsStart && /\s/.test(text[k - 1])) k--;
            if (k > entry.fieldsStart && text[k - 1] === ",") from = k - 1;
        }
        return [from, to];
    },

    // ---- 3) Leeren Artikel erstellen (Template) ----
    runInsertTemplate() {
        if (!EditorModule.editorInstance) return;
        const template = this.buildTemplate();
        const cm = EditorModule.editorInstance;
        const cursor = cm.getCursor();
        // An aktueller Cursor-Position einfügen
        cm.replaceRange(template, cursor);
        cm.focus();
    },

    /**
     * Erzeugt ein leeres @article{}-Template mit nur den aktuell
     * in den Voreinstellungen (Checkboxen) ausgewählten Feldern.
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
    refreshTimeout: null,
    sessionWarningShown: false,
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
                        this.openContent(file.name, await file.text(), handle);
                    } catch (err) {
                        if (err.name !== 'AbortError') {
                            console.error("Öffnen fehlgeschlagen:", err);
                            alert("Could not open the file: " + err.message);
                        }
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
        // Strg+S / Cmd+S speichert die aktive Datei, statt den Speichern-Dialog des Browsers zu öffnen
        window.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
                e.preventDefault();
                e.stopPropagation();
                this.saveActiveFile();
            }
        }, true);
        // Eine während des Tippens noch ausstehende Sicherung beim Verlassen der Seite nachholen
        window.addEventListener("pagehide", () => this.saveSession());
    },

    // Alexandros: Implementierung der Speicherlogik (Direktes Überschreiben via FileHandle)
    async saveActiveFile() {
        const file = this.files.find(f => f.id === this.activeFileId);
        if (!file) return;
        if (EditorModule.editorInstance) {
            file.content = EditorModule.editorInstance.getValue();
        }
        if (!file.handle) {
            await this.saveAsNewFile();
            return;
        }
        try {
            await this.writeToHandle(file.handle, file);
            this.markSaved(file);
        } catch (err) {
            console.error("Fehler beim Überschreiben:", err);
            alert("Error saving file. Try 'Save As'.");
        }
    },

    async saveAsNewFile() {
        const file = this.files.find(f => f.id === this.activeFileId);
        if (!file) return;
        if (EditorModule.editorInstance) file.content = EditorModule.editorInstance.getValue();
        if (!window.showSaveFilePicker) {
            this.legacyDownload(file.name, this.contentForDisk(file));
            this.markSaved(file);
            return;
        }
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: file.name,
                types: [{
                    description: 'BibTeX File',
                    accept: { 'text/plain': ['.bib', '.txt'] },
                }],
            });
            await this.writeToHandle(handle, file);
            file.handle = handle;
            file.name = handle.name;
            this.markSaved(file);
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Fehler beim Speichern:", err);
                alert("Error saving file: " + err.message);
            }
        }
    },

    async writeToHandle(handle, file) {
        const writable = await handle.createWritable();
        await writable.write(this.contentForDisk(file));
        await writable.close();
    },

    // Der Editor arbeitet intern mit \n; ursprüngliche Windows-Zeilenenden beim Speichern beibehalten
    contentForDisk(file) {
        return file.lineEnding === "\r\n" ? file.content.replace(/\r?\n/g, "\r\n") : file.content;
    },

    markSaved(file) {
        file.dirty = false;
        this.renderTabs();
        this.saveSession();
        this.addToRecentFiles(file.name, this.contentForDisk(file));
        ToastModule.show("Saved", file.name, "save");
    },

    legacyDownload(filename, content) {
        const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
        const element = document.createElement('a');
        element.href = url;
        element.download = filename;
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    async handleFolderUpload(event) {
        const files = Array.from(event.target.files || []).filter(file => /\.(bib|txt)$/i.test(file.name));
        let imported = 0;
        for (const file of files) {
            try {
                if (this.openContent(file.name, await file.text(), null, true)) imported++;
            } catch (err) {
                console.error("Datei konnte nicht gelesen werden:", file.name, err);
            }
        }
        if (imported === 0) alert("No .bib or .txt files with BibTeX content found.");
    },

    readFileAndAdd(fileObj) {
        fileObj.text()
            .then(content => this.openContent(fileObj.name, content))
            .catch(err => alert("Could not read the file: " + err.message));
    },

    // Öffnet eine Datei als neuen Tab; aus .txt-Dateien werden nur die BibTeX-Einträge übernommen
    openContent(name, content, handle = null, silent = false) {
        if (name.toLowerCase().endsWith('.txt')) {
            content = this.extractBibtex(content);
            if (!content) {
                if (!silent) alert('This .txt file does not contain recognizable BibTeX content and will not be imported.');
                return false;
            }
        }
        this.addFile(name, content, handle);
        this.addToRecentFiles(name, content);
        this.switchToTab(this.files[this.files.length - 1].id);
        return true;
    },

    createNewFile() {
        let number = this.files.length + 1;
        while (this.files.some(f => f.name === `Untitled_${number}.bib`)) number++;
        this.addFile(`Untitled_${number}.bib`, "", null);
        this.switchToTab(this.files[this.files.length - 1].id);
    },

    addFile(name, content, handle = null, dirty = false) {
        const newFile = {
            id: 'file_' + Date.now() + Math.random().toString(36).slice(2, 11),
            name: name,
            content: content,
            handle: handle,
            dirty: dirty,
            lineEnding: /\r\n/.test(content) ? "\r\n" : "\n"
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
        clearTimeout(this.refreshTimeout);
        this.activeFileId = id;
        this.renderTabs();
        EditorModule.setContent(file.content);
        SidebarModule.parseAndRefresh(file.content);
        this.saveSession();
        ClipboardModule.onTabSwitched();
    },

    closeFile(id, event) {
        if (event) event.stopPropagation();
        const file = this.files.find(f => f.id === id);
        if (file && file.dirty && !confirm(`"${file.name}" has unsaved changes. Close anyway?`)) return;
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
            // Icon für den Tab
            const icon = document.createElement("span");
            icon.className = "material-symbols-outlined tab-icon";
            icon.textContent = "description";
            tab.appendChild(icon);
            const span = document.createElement("span");
            span.className = "tab-filename";
            // Dirty-Flag: Ungespeicherte Änderungen mit * markieren
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

    /**
     * Übernimmt den Editorinhalt in die aktive Datei. Liste, Suchmarkierungen und Sitzung werden
     * beim Tippen erst nach einer kurzen Pause aktualisiert, sonst sofort.
     */
    updateActiveFileContent(content, deferRefresh = false) {
        const file = this.files.find(f => f.id === this.activeFileId);
        if (!file) return;
        file.content = content;
        clearTimeout(this.refreshTimeout);
        if (deferRefresh) {
            this.refreshTimeout = setTimeout(() => this.refreshActiveFile(), 200);
        } else {
            this.refreshActiveFile();
        }
    },

    refreshActiveFile() {
        clearTimeout(this.refreshTimeout);
        const file = this.files.find(f => f.id === this.activeFileId);
        if (!file) return;
        SidebarModule.parseAndRefresh(file.content);
        EditorModule.reapplySearchHighlights();
        this.saveSession();
    },

    /**
     * Markiert die aktive Datei als "ungespeichert" (dirty).
     * Wird vom EditorModule bei jeder Benutzer-Änderung aufgerufen.
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
                files: this.files.map(f => ({ id: f.id, name: f.name, content: f.content, dirty: !!f.dirty, lineEnding: f.lineEnding }))
            };
            localStorage.setItem('bibstream-session', JSON.stringify(data));
        } catch (err) {
            console.warn('Sitzung konnte nicht gespeichert werden:', err);
            if (!this.sessionWarningShown) {
                this.sessionWarningShown = true;
                ToastModule.show("Session not saved", "Browser storage is full – please save your files", "warning");
            }
        }
    },

    /**
     * Lädt Tabs und aktiven Tab aus dem LocalStorage.
     * Stellt files[] wieder her und wechselt zum zuletzt aktiven Tab.
     */
    loadSession() {
        try {
            const raw = localStorage.getItem('bibstream-session');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.files) || data.files.length === 0) return;
            data.files.forEach(f => {
                this.files.push({
                    id: f.id, name: f.name, content: f.content || '', handle: null,
                    dirty: !!f.dirty, lineEnding: f.lineEnding === "\r\n" ? "\r\n" : "\n"
                });
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
     * Fügt eine Datei (Name + Inhalt) zur "Zuletzt geändert"-Liste hinzu.
     * Max. 5 Einträge, keine Duplikate (FIFO). Speichert Name UND Content.
     */
    addToRecentFiles(name, content) {
        try {
            let recent = JSON.parse(localStorage.getItem('bibstream-recent-files') || '[]');
            // Duplikat entfernen, falls vorhanden
            recent = recent.filter(entry => entry.name !== name);
            // Am Anfang einfügen (Name + Content)
            recent.unshift({ name: name, content: content || '' });
            // Max. 5 Einträge behalten
            if (recent.length > 5) recent = recent.slice(0, 5);
            localStorage.setItem('bibstream-recent-files', JSON.stringify(recent));
            this.renderRecentFiles();
        } catch (err) {
            console.warn('Zuletzt geänderten Dateien konnten nicht gespeichert werden:', err);
        }
    },

    /**
     * Rendert die "Zuletzt geändert"-Liste im Datei-Dropdown.
     * Fügt Einträge unterhalb einer <hr> im #dropdownDateiContent ein.
     */
    renderRecentFiles() {
        const dropdown = document.querySelector('#dropdownDateiContent');
        if (!dropdown) return;

        // Alte "Zuletzt geändert"-Einträge entfernen
        dropdown.querySelectorAll('.recent-file-item, .recent-file-header').forEach(el => el.remove());

        let recent = [];
        try {
            recent = JSON.parse(localStorage.getItem('bibstream-recent-files') || '[]');
        } catch (e) { /* leer lassen */ }

        if (!Array.isArray(recent) || recent.length === 0) return;

        // Trennlinie
        const hr = document.createElement('hr');
        hr.className = 'recent-file-header';
        dropdown.appendChild(hr);

        // Überschrift
        const header = document.createElement('span');
        header.className = 'recent-file-header';
        header.textContent = 'Recently Edited';
        header.style.cssText = 'display:block;padding:6px 12px 2px;font-size:0.75em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;pointer-events:none;';
        dropdown.appendChild(header);

        // Dateieinträge (jeder Eintrag ist ein {name, content}-Objekt)
        recent.forEach(entry => {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'recent-file-item';
            a.textContent = entry.name;
            a.title = entry.name;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                // Prüfen ob Datei bereits geöffnet ist
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
     * Extrahiert alle BibTeX-Einträge (@typ{...} bzw. @typ(...)) aus einem Rohtext.
     * Gibt den bereinigten String zurück, oder '' wenn kein Eintrag gefunden wurde.
     */
    extractBibtex(rawText) {
        const entries = BibTeXParser.findEntries(rawText).filter(e =>
            e.special || (e.validKey && rawText.slice(e.fieldsStart, e.bodyEnd).includes("=")));
        if (!entries.some(e => !e.special)) return '';
        return entries.map(e => rawText.slice(e.start, e.end)).join('\n\n');
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
        if (!textarea || typeof CodeMirror === "undefined") return;

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

        // Jede Benutzeränderung an Datei, Liste und Lösch-Schaltflächen weitergeben
        this.editorInstance.on("changes", (cm, changes) => {
            if (this.isProgrammaticUpdate) return;
            // Dirty-Flag zuerst setzen, damit es mit dem Inhalt in der Sitzung landet
            FileModule.markActiveDirty();
            // Beim Tippen wird die Liste erst nach einer kurzen Pause neu aufgebaut
            const typing = changes.every(change => /^(\+input|\+delete|\*compose)$/.test(change.origin || ""));
            FileModule.updateActiveFileContent(cm.getValue(), typing);
            this.scheduleUpdateDeleteButtons();
        });

        // Felix: Synchronisierung Editor -> Sidebar
        this.editorInstance.on("cursorActivity", (cm) => {
            if (this.isProgrammaticUpdate || this.isJumping) return;
            
            clearTimeout(this.cursorTimeout);
            this.cursorTimeout = setTimeout(() => {
                const cursor = cm.getCursor();
                const key = this.findBibtexKeyAtCursor(cm, cursor);
                if (key) {
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
        this.reapplySearchHighlights();
        this.scheduleUpdateDeleteButtons();
    },

    // Sortierter Text als reguläre, rückgängig machbare Änderung (markiert die Datei als geändert)
    updateSortedContent(text) {
        if (!this.editorInstance) return;
        this.editorInstance.setValue(text);
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
            const match = cm.getLine(i).match(/@([a-zA-Z]\w*)\s*[{(]\s*([^\s,{}()]+)\s*,/);
            if (match) {
                return BibTeXParser.SPECIAL_TYPES.includes(match[1].toLowerCase()) ? null : match[2];
            }
        }
        return null;
    },

    // Erster Eintrag mit genau diesem Schlüssel (optional mit Kopfzeile in der angegebenen Zeile)
    findEntry(keyName, headerLine = null) {
        const cm = this.editorInstance;
        const text = cm.getValue();
        const candidates = BibTeXParser.findEntries(text).filter(e => !e.special && e.key === keyName);
        const entry = (headerLine !== null && candidates.find(e => cm.posFromIndex(e.start).line === headerLine)) || candidates[0];
        return entry ? { entry, text } : null;
    },

    /**
     * Springt zum BibTeX-Eintrag mit dem gegebenen Key.
     * Markiert die gesamte ausgewählte Quelle im Editor, scrollt sie bündig nach oben
     * und fokussiert den Editor, sodass der Eintrag direkt per Strg+C / Strg+V kopiert werden kann.
     */
    jumpToKey(keyName, selectWholeBlock = true) {
        const cm = this.editorInstance;
        if (!cm) return;
        const found = this.findEntry(keyName);
        if (!found) return;
        const { entry } = found;
        this.isJumping = true; // Ping-Pong Effekt verhindern

        const blockStart = cm.posFromIndex(entry.start).line;
        const blockEnd = cm.posFromIndex(entry.end).line;

        if (selectWholeBlock) {
            cm.setSelection(
                { line: blockStart, ch: 0 },
                { line: blockEnd, ch: cm.getLine(blockEnd).length }
            );
        } else {
            // Selektion auf den Key setzen
            cm.setSelection(cm.posFromIndex(entry.keyStart), cm.posFromIndex(entry.keyEnd));
        }

        // Scroll: Eintrag bündig oben am Bildschirmrand
        const topCoord = cm.charCoords({ line: blockStart, ch: 0 }, 'local').top;
        cm.scrollTo(null, topCoord);

        // Farbliches Highlighting des gesamten Blocks (temporär); Zeilen-Handles bleiben auch
        // gültig, wenn sich die Zeilennummern zwischenzeitlich verschieben
        const handles = [];
        for (let i = blockStart; i <= blockEnd; i++) {
            handles.push(cm.addLineClass(i, 'background', 'jumptokey-highlight'));
        }
        setTimeout(() => {
            handles.forEach(handle => cm.removeLineClass(handle, 'background', 'jumptokey-highlight'));
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
     * Löscht einen BibTeX-Eintrag anhand seines Keys aus dem CodeMirror-Editor (bei doppelten
     * Schlüsseln den Eintrag, dessen Kopf in headerLine steht). cm.replaceRange() löst das
     * change-Event aus, und der Undo-Verlauf (Strg+Z) bleibt erhalten.
     */
    deleteEntryByKey(keyName, headerLine = null) {
        const cm = this.editorInstance;
        if (!cm) return false;
        const found = this.findEntry(keyName, headerLine);
        if (!found) return false;
        const { entry, text } = found;

        // Ganze Zeilen entfernen, dazu eine folgende Leerzeile (am Dateiende den Zeilenumbruch davor)
        let from = entry.start;
        let to = entry.end;
        const lineStart = text.lastIndexOf("\n", from - 1) + 1;
        if (/^[ \t]*$/.test(text.slice(lineStart, from))) from = lineStart;
        const rest = /^[ \t]*(\n|$)/.exec(text.slice(to));
        if (rest) {
            to += rest[0].length;
            if (rest[1] === "\n") {
                const blank = /^[ \t]*(\n|$)/.exec(text.slice(to));
                if (blank) to += blank[0].length;
            } else if (from > 0 && text[from - 1] === "\n") {
                from--;
            }
        }

        cm.replaceRange("", cm.posFromIndex(from), cm.posFromIndex(to));
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
        this.deleteMarkers.forEach(m => m.clear());
        this.deleteMarkers = [];

        const text = cm.getValue();
        const linesWithButton = new Set();
        cm.operation(() => {
            BibTeXParser.findEntries(text).forEach(entry => {
                if (entry.special || !entry.validKey) return;
                const line = cm.posFromIndex(entry.start).line;
                if (linesWithButton.has(line)) return;
                linesWithButton.add(line);

                const type = text.slice(entry.typeStart, entry.typeStart + entry.type.length);
                const key = entry.key;
                const btn = document.createElement("button");
                btn.className = "cm-entry-delete-btn";
                btn.type = "button";
                btn.title = `Delete entry @${type}{${key}}`;
                btn.innerHTML = '<span class="material-symbols-outlined">delete</span>';

                const marker = cm.setBookmark(
                    { line, ch: cm.getLine(line).length },
                    { widget: btn, insertLeft: false, handleMouseEvents: true }
                );
                this.deleteMarkers.push(marker);

                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Aktuelle Zeile des Eintrags, damit bei doppelten Schlüsseln der richtige gelöscht wird
                    const pos = marker.find();
                    const headerLine = pos ? pos.line : null;
                    const found = this.findEntry(key, headerLine);
                    const entryObj = found
                        ? SidebarModule.describeEntry(found.text, found.entry)
                        : { type: entry.type, key, title: "", author: "Unknown", year: "????" };
                    SidebarModule.openDeleteModal(entryObj, headerLine);
                });

                btn.addEventListener("mousedown", (e) => {
                    e.stopPropagation();
                });
            });
        });
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
    deleteHeaderLine: null,
    activeKey: null,
    allEntries: [],
    searchTerms: [],
    currentSort: "original",
    headerText: "",
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
     * Bereinigt einen extrahierten Feldwert für die UI-Anzeige in der Cite-Liste.
     * Entfernt geschweifte Klammern (auch innere Klammern wie {FF}) und normalisiert Whitespaces,
     * ohne den Rohtext im Editor zu verändern.
     */
    cleanValueForUI(rawVal) {
        if (!rawVal) return "";
        return rawVal.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    },

    // Klickbarer Verweis: DOI hat Vorrang, URLs nur mit http(s), damit kein javascript: o. Ä. als Link landet
    buildLink(fields) {
        const doi = (fields.doi || "").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").trim();
        if (doi) return { link: `https://doi.org/${doi}`, linkType: 'doi' };
        let url = (fields.url || "").trim();
        if (/^www\./i.test(url)) url = "https://" + url;
        if (/^https?:\/\//i.test(url)) return { link: url, linkType: 'url' };
        return { link: null, linkType: null };
    },

    // Martin: Aufbereitung von Typ, Titel, Autor, Jahr, Link und aller Felder eines Eintrags
    describeEntry(text, entry) {
        const fields = {};
        BibTeXParser.scanFields(text, entry.fieldsStart, entry.bodyEnd).fields.forEach(field => {
            // Wie BibTeX gilt bei doppelten Feldern das erste Vorkommen
            if (!(field.name in fields)) fields[field.name] = this.cleanValueForUI(BibTeXParser.valueText(field.parts));
        });
        const yearMatch = (fields.year || "").match(/\d{4}/);
        return {
            type: entry.type,
            key: entry.key,
            title: fields.title || "",
            author: fields.author || "Unknown",
            year: yearMatch ? yearMatch[0] : "????",
            ...this.buildLink(fields),
            fields
        };
    },

    /**
     * Martin: Parser für die Eintragsliste. Zerlegt den Text verlustfrei in Kopf (@string,
     * @preamble und @comment vor dem ersten Eintrag), Einträge mit vorangehendem Text und Rest.
     */
    parseBibtexEntries(text) {
        const entries = [];
        const seenKeys = new Set();
        const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let lastEnd = 0;
        let headerEnd = 0;

        BibTeXParser.findEntries(normalizedText).forEach(entry => {
            if (entry.special) {
                // Makros und Präambel am Dateianfang bleiben beim Sortieren oben stehen
                if (entries.length === 0) headerEnd = entry.end;
                return;
            }
            if (!entry.validKey || seenKeys.has(entry.key)) return;
            seenKeys.add(entry.key);

            entries.push({
                ...this.describeEntry(normalizedText, entry),
                precedingText: normalizedText.substring(entries.length === 0 ? headerEnd : lastEnd, entry.start),
                rawText: normalizedText.substring(entry.start, entry.end),
                originalIndex: entries.length
            });
            lastEnd = entry.end;
        });

        this.headerText = entries.length > 0 ? normalizedText.substring(0, headerEnd) : "";
        this.trailingText = normalizedText.substring(lastEnd);
        return entries;
    },

    setSearchTerm(term) {
        this.searchTerms = this.getSearchTerms(term || "");
        EditorModule.highlightSearchMatches(this.searchTerms);
        this.updateView();
    },

    setSortMode(mode) {
        this.currentSort = mode;
        // Wird der Text umsortiert, aktualisiert das change-Ereignis die Liste bereits
        if (!this.sortAndSyncEditor()) this.updateView();
    },

    getComparator(mode) {
        const byTitle = (a, b) => (a.title || a.key).localeCompare(b.title || b.key);
        const yearOf = (entry) => parseInt(entry.year, 10) || 0;
        switch (mode) {
            case 'title-asc': return byTitle;
            case 'title-desc': return (a, b) => byTitle(b, a);
            case 'author-asc': return (a, b) => a.author.localeCompare(b.author);
            case 'author-desc': return (a, b) => b.author.localeCompare(a.author);
            case 'year-desc': return (a, b) => yearOf(b) - yearOf(a);
            case 'year-asc': return (a, b) => yearOf(a) - yearOf(b);
            case 'type': return (a, b) => a.type.localeCompare(b.type) || byTitle(a, b);
            default: return (a, b) => a.originalIndex - b.originalIndex;
        }
    },

    // Überträgt die gewählte Sortierung in den Editortext; liefert true, wenn sich der Text geändert hat
    sortAndSyncEditor() {
        if (!EditorModule.editorInstance) return false;
        // Aktuellen Editortext zugrunde legen (die Liste wird beim Tippen verzögert aktualisiert)
        this.allEntries = this.parseBibtexEntries(EditorModule.editorInstance.getValue());
        const sorted = [...this.allEntries].sort(this.getComparator(this.currentSort));
        if (sorted.every((entry, idx) => entry.originalIndex === idx)) return false;

        let newText = this.headerText;
        sorted.forEach((entry, idx) => {
            let preceding = entry.precedingText;
            // Einträge nicht zusammenkleben und die Datei nicht mit Leerzeilen beginnen lassen
            if (idx === 0 && !newText) preceding = preceding.replace(/^\s+/, "");
            else if (!preceding.includes("\n")) preceding = "\n\n" + preceding.trimStart();
            newText += preceding + entry.rawText;
        });
        newText += this.trailingText;

        if (EditorModule.editorInstance.getValue() === newText) return false;
        EditorModule.updateSortedContent(newText);
        return true;
    },

    // Martin: Verarbeitet Sortierung und Filterung der BibTeX-Liste über alle Felder
    updateView() {
        // Umfassende Suche: durchsucht alle Felder (Author, Title, Ort/Address, Location, Publisher, Type, Key etc.)
        let processed = [...this.allEntries];
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

        // Konsistente Sortierung mit bidirektionalen Optionen (gleiche Kriterien wie im Editor)
        processed.sort(this.getComparator(this.currentSort));
        this.renderList(processed);
    },

    // Neugestaltete Eintrags-Anzeige: Titel/Autor/Jahr im Fokus, Key sekundär & Treffer-Hervorhebung
    renderList(entriesArray) {
        if (!this.citationListUl) return;
        this.citationListUl.innerHTML = "";

        // Statistik und Treffer-Anzahl
        const isSearching = this.searchTerms && this.searchTerms.length > 0;
        if (this.countDisplay) {
            const total = this.allEntries.length;
            const shown = entriesArray.length;
            if (isSearching) {
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
            emptyLi.textContent = isSearching ? "No matches found" : "No entries";
            this.citationListUl.appendChild(emptyLi);
            return;
        }

        const queryTerms = (this.searchTerms || []).map(t => t.toLowerCase());

        entriesArray.forEach(entry => {
            const li = document.createElement("li");
            li.setAttribute("data-key", entry.key); // Für Reverse-Nav & Jump
            // Markierung des Eintrags unter dem Cursor beim Neuaufbau der Liste beibehalten
            if (entry.key === this.activeKey) li.classList.add("active-cite");

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
        const changed = key !== this.activeKey;
        this.activeKey = key;

        let targetLi = null;
        this.citationListUl.querySelectorAll("li:not([data-empty])").forEach(li => {
            const isActive = li.getAttribute("data-key") === key;
            li.classList.toggle("active-cite", isActive);
            if (isActive) targetLi = li;
        });

        // Nur beim Wechsel des Eintrags rollen, damit die Liste beim Bewegen im selben Eintrag ruhig bleibt
        if (targetLi && changed) {
            targetLi.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    },

    openDeleteModal(entry, headerLine = null) {
        this.entryToDelete = entry;
        this.deleteHeaderLine = headerLine;
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
        const headerLine = this.deleteHeaderLine;
        this.closeDeleteModal();
        if (!EditorModule.deleteEntryByKey(key, headerLine)) {
            ToastModule.show("Entry not found", `${key} is no longer in the file`, "error");
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
        // Alexandros: Initialisierung des Resize-Vorgangs (Sidebar/Top-Bar Höhe oder Breite)
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
                // Side-by-Side-Modus: X-Achse → Sidebar-Breite ändern
                let newSidebarWidth = e.clientX;
                if (newSidebarWidth < 150) newSidebarWidth = 150;
                if (newSidebarWidth > window.innerWidth * 0.5) newSidebarWidth = window.innerWidth * 0.5;
                body.style.gridTemplateColumns = `${newSidebarWidth}px 5px 1fr`;
            } else {
                // Standard-Modus: Y-Achse → Sidebar-Höhe ändern
                const headerHeight = document.querySelector(".top-nav").offsetHeight;
                let newSidebarHeight = e.clientY - headerHeight;
                if (newSidebarHeight < 50) newSidebarHeight = 50;
                if (newSidebarHeight > window.innerHeight * 0.8) newSidebarHeight = window.innerHeight * 0.8;
                body.style.gridTemplateRows = `${headerHeight}px ${newSidebarHeight}px 5px 1fr`;
            }
            // Felix: Refresh des Editors nach Layout-Änderung
            if (EditorModule.editorInstance) EditorModule.editorInstance.refresh();
        });

        window.addEventListener("mouseup", () => {
            if (!isResizing) return;
            isResizing = false;
            body.style.cursor = "";
            body.style.userSelect = "";
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
                if (key) {
                    SidebarModule.highlightKey(key);
                    EditorModule.jumpToKey(key, true);
                }
            });
            // Strg+F / Cmd+F springt ins Suchfeld; die Suche erfasst anders als die Browsersuche das ganze Dokument
            window.addEventListener("keydown", (e) => {
                if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
                    e.preventDefault();
                    e.stopPropagation();
                    input.focus();
                    input.select();
                }
            }, true);
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
        ToastModule.show("Imported from Identifier", `@${type}{${uniqueKey}} added to document`, "fingerprint");
    }
};

// --- 7.5 IMPORT MODULE (PDF- & Identifier-Import) ---
const ImportModule = {
    pdfBtn: null,
    pdfInput: null,
    // Einzige Stelle mit der PDF.js-Version (Hauptmodul und Worker müssen übereinstimmen)
    PDFJS_BASE: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/",

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
     * filtert Kopf- und Fußzeilen heraus, isoliert das Literaturverzeichnis
     * und konvertiert alle Referenzen in typisierte BibTeX-Einträge.
     */
    async handlePdfFile(file) {
        let pdf = null;
        try {
            const arrayBuffer = await file.arrayBuffer();

            // pdf.js erst bei Bedarf laden (dynamischer Import, da als ES-Modul ausgeliefert)
            const pdfjsLib = await import(this.PDFJS_BASE + "pdf.min.mjs");
            pdfjsLib.GlobalWorkerOptions.workerSrc = this.PDFJS_BASE + "pdf.worker.min.mjs";

            pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.0 });
                const content = await page.getTextContent();

                // Laufende Kopf- und Fußzeilen anhand der vertikalen Position herausfiltern
                const items = content.items.filter(item => {
                    if (!item.transform) return true;
                    const y = item.transform[5];
                    return !(y > viewport.height - 40 || y < 35);
                });

                const pageText = items.map(item => item.str).join(" ");
                fullText += pageText + "\n";
            }

            const bibtex = this.extractReferences(fullText);

            if (!bibtex || bibtex.trim().length === 0) {
                alert("No references could be found in this PDF.\n\nPossible reasons:\n- The PDF does not contain a recognizable bibliography\n- The PDF is image-based (scan) without extractable text");
                return;
            }

            // Ergebnis als neuen, noch nicht gespeicherten Tab hinzufügen
            const tabName = "import_" + file.name.replace(/\.pdf$/i, "") + ".bib";
            FileModule.addFile(tabName, bibtex, null, true);
            FileModule.switchToTab(FileModule.files[FileModule.files.length - 1].id);
        } catch (err) {
            console.error("Fehler beim PDF-Import:", err);
            alert("Error reading PDF file: " + err.message);
        } finally {
            // Worker und Speicher des Dokuments wieder freigeben
            if (pdf) pdf.destroy();
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
                // Prüfen, ob nach der Überschrift Zitate wie [1], [AB21] (Stil alpha) oder 1. folgen
                const afterText = fullText.substring(m.index, m.index + 400);
                if (/\[1\]|\[[A-Za-z][A-Za-z+\-]{0,10}\d{2}[a-z]?\]|\b1\.\s+[A-Z]/.test(afterText)) {
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

        // Versuch 1b: Alphanumerische Marken des BibTeX-Stils alpha, z. B. [AB21], [Rob17], [AB+21]
        const alphaLabel = /^\[[A-Za-z][A-Za-z+\-]{0,10}\d{2}[a-z]?\]/;
        parts = refText.split(/(?=(?:^|\s+)\[[A-Za-z][A-Za-z+\-]{0,10}\d{2}[a-z]?\])/).map(p => p.trim()).filter(p => alphaLabel.test(p));
        if (parts.length >= 2) {
            return parts.map(p => p.replace(alphaLabel, "").trim());
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

        // Führende Zitationsmarken [1], [AB21] oder 1. entfernen
        text = text.replace(/^(?:\[[^\]\s]{1,15}\]|\d{1,3}\.)\s*/, '').trim();

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
        // DOI, URLs und arXiv-Kennungen ausblenden (gleiche Länge), damit ihre Ziffern nicht als Jahr gelten
        const maskedText = text
            .replace(/\b10\.\d{4,9}\/\S+/g, m => " ".repeat(m.length))
            .replace(/https?:\/\/\S+/gi, m => " ".repeat(m.length))
            .replace(/arXiv:\s*\S+/gi, m => " ".repeat(m.length));
        let year = '';
        const yearMatches = [...maskedText.matchAll(/\b((?:19|20)\d{2})\b/g)];
        if (yearMatches.length > 0) {
            year = yearMatches[yearMatches.length - 1][1];
        }

        // Monat nur direkt vor dem Jahr ("Mar. 2021"), sonst würden Vornamen wie "Jun" oder Wörter wie "May" erkannt
        let month = '';
        const monthMatch = maskedText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(?:\d{1,2}(?:\s*-+\s*\d{1,2})?,?\s+)?(?:19|20)\d{2}\b/i);
        if (monthMatch) {
            month = monthMatch[1].toLowerCase();
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
            // Fall C: Kein Titel in Anführungszeichen
            const apaMatch = text.match(/^(.{2,300}?)\s*\(\s*(?:19|20)\d{2}[a-z]?\s*\)\.?\s*(.*)$/);
            // Sätze trennen, aber nicht nach Initialen wie "D."
            const sentences = text.split(/(?<=[a-z0-9)\]"'’]{2})\.\s+(?=[A-Z0-9[])/);
            if (apaMatch) {
                // APA/Harvard: "Autoren (Jahr). Titel. Quelle"
                author = apaMatch[1].replace(/[,;:\s]+$/, '');
                const rest = apaMatch[2];
                const dot = rest.indexOf('.');
                if (dot > 5) {
                    title = rest.substring(0, dot).trim();
                    venuePart = rest.substring(dot + 1).trim();
                } else {
                    title = rest;
                }
            } else if (sentences.length >= 3) {
                // BibTeX-Stile plain/alpha: "Autoren. Titel. Quelle, Jahr."
                author = sentences[0].replace(/[,\s]+(?:19|20)\d{2}[a-z]?$/, '');
                title = sentences[1];
                venuePart = sentences.slice(2).join('. ');
            } else if (yearMatches.length > 0) {
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

        // Autoren und Titel säubern; Autoren in BibTeX-Syntax (mit "and" getrennt)
        author = this.formatAuthors(author.replace(/[\(\)\[\]]+/g, ''));
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

        // Stile plain/alpha: "Journal, 78(3):1--32, 2021"
        const plainVolume = venuePart.match(/,\s*(\d+)(?:\((\d+)\))?:\s*([a-zA-Z]?\d+)(?:\s*-+\s*([a-zA-Z]?\d+))?/);
        if (plainVolume) {
            if (!volume) volume = plainVolume[1];
            if (!number && plainVolume[2]) number = plainVolume[2];
            if (!pages) pages = plainVolume[4] ? `${plainVolume[3]}--${plainVolume[4]}` : plainVolume[3];
        }

        // ArXiv
        const arxivMatch = text.match(/arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)/i);
        if (arxivMatch) {
            eprint = arxivMatch[1];
            note = `arXiv:${eprint}`;
        }

        if (type === 'article') {
            let jText = venuePart;
            const jCutMatch = jText.match(/,\s*(?:vol\.|no\.|pp?\.|\d{4}|\d+(?:\(\d+\))?:|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
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

        // Hochschule bzw. Institution aus den durch Kommata getrennten Angaben nach dem Titel
        const venueSegments = venuePart.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
        const reportMarker = /\b(?:Tech\.?\s*Rep\.?|Technical\s+Report|Std\.?|Standard)\b/i;
        let school = '';
        let institution = '';
        if (type === 'phdthesis' || type === 'mastersthesis') {
            const bracketMatch = text.match(/\[(?:Doctoral dissertation|Master's thesis|Dissertation|Masterarbeit)[^\],]*,\s*([^\]]+)\]/i);
            // Hochschulen vor Instituten/Fakultäten bevorzugen ("School of ..., Stanford Univ.")
            school = bracketMatch
                ? bracketMatch[1].trim()
                : (venueSegments.find(s => /\bUniv|Universit|Hochschule|College|Polytechn|\bETH\b|\bEPFL\b/i.test(s)) ||
                   venueSegments.find(s => /\bInstitut|\bInst\.|\bSchool\b/i.test(s)) || '');
        } else if (type === 'techreport') {
            institution = venueSegments.find(s => !reportMarker.test(s) &&
                /\b(?:Univ\w*|Institut\w*|Inst\.|Lab(?:s|orator\w*)?\b|Corp\w*|Inc\b|Ltd\b|GmbH\b|Cent(?:er|re)\b|Agency\b|Organi[sz]ation\b|Council\b|Committee\b|Consortium\b|Foundation\b|NASA\b|NIST\b|IETF\b|ETSI\b|3GPP\b|ITU\b|ISO\b|IEEE\b|ACM\b)/i.test(s)) || '';
            const reportSegment = venueSegments.find(s => reportMarker.test(s)) || '';
            if (!institution) {
                const orgMatch = reportSegment.match(/^([A-Z][\w&.\- ]*?)\s+(?:Tech\.?\s*Rep|Technical\s+Report|Std|Standard)/);
                if (orgMatch) institution = orgMatch[1].trim();
            }
            const reportNumber = reportSegment.match(/(?:Tech\.?\s*Rep\.?|Technical\s+Report|Std\.?|Standard)\s*(?:No\.?\s*)?([A-Z0-9][\w.\-\/:]*\d[\w.\-\/:]*)/i);
            if (reportNumber && !number) number = reportNumber[1].replace(/[.,]+$/, '');
        }
        school = school.replace(/^[\s.]+|[\s,]+$/g, '');
        institution = institution.replace(/^[\s.]+|[\s,]+$/g, '');

        // --- 5. Zitationsschlüssel (Key) erzeugen ---
        let firstAuthor = 'ref';
        if (author) {
            const firstA = this.asciiFold(author.split(/,|&|\band\b/i)[0].trim());
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
            const words = this.asciiFold(title).split(/\s+/).map(w => w.replace(/[^a-zA-Z]/g, '').toLowerCase()).filter(w => w.length > 3 && !stopWords.has(w));
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
        // Einzelne Klammern aus dem PDF-Text würden den Eintrag unbalanciert machen
        const field = (name, value) => `  ${name.padEnd(12)} = {${value.replace(/[{}]/g, '')}},\n`;
        let entry = `@${type}{${finalKey},\n`;
        if (author) entry += field('author', author);
        if (title) entry += field('title', title);
        if (type === 'article' && journal) entry += field('journal', journal);
        if (type === 'inproceedings' && booktitle) entry += field('booktitle', booktitle);
        if (type === 'book' && publisher) entry += field('publisher', publisher);
        if (type === 'book' && address) entry += field('address', address);
        if (school) entry += field('school', school);
        if (institution) entry += field('institution', institution);
        if (year) entry += field('year', year);
        // Monat als BibTeX-Makro (ohne Klammern), damit der Stil den Monatsnamen setzt
        if (month) entry += `  ${'month'.padEnd(12)} = ${month},\n`;
        if (volume) entry += field('volume', volume);
        if (number) entry += field('number', number);
        if (pages) entry += field('pages', pages);
        if (doi) entry += field('doi', doi);
        if (eprint) {
            entry += field('eprint', eprint);
            entry += field('archiveprefix', 'arXiv');
        }
        if (note && type === 'misc') entry += field('note', note);
        entry += `}`;

        return entry;
    },

    // Autorenliste in BibTeX-Syntax: Personen mit "and" trennen, "et al." wird zu "and others"
    formatAuthors(raw) {
        let text = raw.replace(/\s+/g, ' ').replace(/[,;\s]+$/, '').trim();
        if (!text) return '';
        let others = false;
        text = text.replace(/,?\s*\bet\s+al\.?$/i, () => {
            others = true;
            return '';
        }).trim();
        const parts = text
            .replace(/\s*,?\s*(?:\band\b|&)\s*/gi, ', ')
            .split(/\s*[,;]\s*/)
            .map(part => part.trim())
            .filter(Boolean);
        // APA/Harvard: "Smith, J. A., Jones, B." besteht abwechselnd aus Nachnamen und Initialen
        const isInitials = (part) => /^(?:\p{Lu}{1,2}\.\s*-?\s*)+$/u.test(part);
        const names = [];
        if (parts.length % 2 === 0 && parts.every((part, i) => isInitials(part) === (i % 2 === 1))) {
            for (let i = 0; i < parts.length; i += 2) names.push(`${parts[i]}, ${parts[i + 1]}`);
        } else {
            names.push(...parts);
        }
        if (others) names.push('others');
        return names.join(' and ');
    },

    // Für Schlüssel: Umlaute umschreiben (ü -> ue) und übrige Akzente entfernen
    asciiFold(str) {
        const umlauts = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
        return str.replace(/[äöüÄÖÜß]/g, ch => umlauts[ch]).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") contents.forEach(c => document.querySelector(c)?.classList.remove('show'));
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

    // Typspezifisches Feld-Mapping: welche Felder sind für welchen Typ üblich
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
        if (typeof CodeMirror === "undefined") return;
        CodeMirror.registerHelper("lint", "stex", (text) => {
            return this.validate(text);
        });
    },

    /**
     * Prüft ob ein Feldname für den gegebenen Typ gültig ist.
     * Erlaubt: typspezifische Felder + globale Felder.
     */
    isFieldValidForType(fieldName, typeName) {
        // Globale Felder sind immer erlaubt
        if (this.globalFields.includes(fieldName)) return true;
        // Typspezifische Felder prüfen
        const typeFields = this.fieldsForType[typeName];
        if (typeFields) return typeFields.includes(fieldName);
        // Unbekannter Typ: Alle Felder aus allen Typen als Fallback sammeln
        const allFields = new Set(this.globalFields);
        Object.values(this.fieldsForType).forEach(fields => {
            fields.forEach(f => allFields.add(f));
        });
        return allFields.has(fieldName);
    },

    // Ähnlichster gültiger Eintragstyp (Levenshtein-Distanz) als Korrekturvorschlag
    suggestType(type) {
        let best = null;
        let bestDistance = Infinity;
        this.validTypes.forEach(candidate => {
            const distance = this.levenshtein(type, candidate);
            if (distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
            }
        });
        return bestDistance <= Math.max(2, Math.floor(type.length / 3)) ? best : null;
    },

    levenshtein(a, b) {
        let row = Array.from({ length: b.length + 1 }, (_, j) => j);
        for (let i = 1; i <= a.length; i++) {
            const next = [i];
            for (let j = 1; j <= b.length; j++) {
                next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
            row = next;
        }
        return row[b.length];
    },

    /**
     * Prüft den Text zeichenweise mit dem gemeinsamen Parser. Mehrzeilige Werte, runde Klammern,
     * @string/@preamble/@comment und eine schließende Klammer in der Zeile des letzten Felds
     * werden dadurch korrekt behandelt; Klammerfehler werden an ihrer Ursache gemeldet.
     */
    validate(text) {
        const errors = [];
        const lineStarts = [0];
        for (let i = 0; i < text.length; i++) {
            if (text[i] === "\n") lineStarts.push(i + 1);
        }
        const toPos = (index) => {
            let lo = 0;
            let hi = lineStarts.length - 1;
            while (lo < hi) {
                const mid = (lo + hi + 1) >> 1;
                if (lineStarts[mid] <= index) lo = mid;
                else hi = mid - 1;
            }
            return CodeMirror.Pos(lo, index - lineStarts[lo]);
        };
        const report = (from, to, message, severity = "error") => {
            from = Math.min(from, text.length);
            to = Math.min(Math.max(to, from + 1), text.length);
            errors.push({ from: toPos(from), to: toPos(to), message, severity });
        };

        const headerRegex = /@([a-zA-Z]\w*)\s*([{(])/g;
        const seenKeys = new Set();
        let outsideStart = 0;
        let match;
        while ((match = headerRegex.exec(text)) !== null) {
            this.checkOutsideText(text, outsideStart, match.index, report);
            const typeName = match[1];
            const type = typeName.toLowerCase();
            const special = BibTeXParser.SPECIAL_TYPES.includes(type);
            const typeStart = match.index + 1;
            const bodyStart = match.index + match[0].length;
            const limit = special ? text.length : BibTeXParser.nextHeaderAtLineStart(text, bodyStart);
            const close = BibTeXParser.findEntryEnd(text, bodyStart, match[2], limit);

            // Prüft auf korrekte BibTeX-Eintragstypen
            if (!special && !this.validTypes.includes(type)) {
                const suggestion = this.suggestType(type);
                report(typeStart, typeStart + typeName.length,
                    `Unknown entry type: "@${type}".` + (suggestion ? ` Did you mean "@${suggestion}"?` : ""));
            }

            if (close === -1) {
                this.reportUnclosed(text, match.index, bodyStart, limit, report);
                outsideStart = limit;
                headerRegex.lastIndex = limit;
                continue;
            }
            if (!special) this.checkEntry(text, type, bodyStart, close, seenKeys, report);
            outsideStart = close + 1;
            headerRegex.lastIndex = close + 1;
        }
        this.checkOutsideText(text, outsideStart, text.length, report);
        return errors;
    },

    // Schlüssel, Kommata und Feldzuweisungen eines geschlossenen Eintrags prüfen
    checkEntry(text, type, bodyStart, bodyEnd, seenKeys, report) {
        const isSpace = (index) => BibTeXParser.isSpace(text.charCodeAt(index));
        const isNameChar = (index) => BibTeXParser.isNameChar(text.charCodeAt(index));
        let i = bodyStart;
        while (i < bodyEnd && isSpace(i)) i++;
        const keyStart = i;
        while (i < bodyEnd && isNameChar(i)) i++;
        let j = i;
        while (j < bodyEnd && isSpace(j)) j++;

        if (i === keyStart || text[j] === "=") {
            // Kein Schlüssel: Der Eintrag beginnt direkt mit einem Feld (oder einem Komma)
            report(keyStart, keyStart + 1, "Missing citation key after the opening brace.");
            i = text[keyStart] === "," ? keyStart + 1 : keyStart;
        } else {
            // Duplikat-Handling
            const key = text.slice(keyStart, i);
            if (seenKeys.has(key)) {
                report(keyStart, i, "Duplicate BibTeX key: This citation key already exists above.");
            } else {
                seenKeys.add(key);
            }
            if (j < bodyEnd && text[j] === ",") {
                i = j + 1;
            } else if (j < bodyEnd) {
                report(i - 1, i, "Missing comma after the citation key.");
                i = j;
            }
        }

        // Ende des letzten Werts, solange danach noch kein Komma kam
        let missingCommaAt = -1;
        while (i < bodyEnd) {
            const ch = text[i];
            if (isSpace(i)) { i++; continue; }
            if (ch === ",") { missingCommaAt = -1; i++; continue; }
            if (ch === "%") {
                // Kommentarzeile, wie sie auch der Editor darstellt
                while (i < bodyEnd && text[i] !== "\n") i++;
                continue;
            }
            const nameStart = i;
            while (i < bodyEnd && isNameChar(i)) i++;
            const nameEnd = i;
            let k = i;
            while (k < bodyEnd && isSpace(k)) k++;
            if (nameEnd === nameStart || text[k] !== "=") {
                const lineEnd = text.indexOf("\n", nameStart);
                report(nameStart, lineEnd === -1 ? bodyEnd : Math.min(lineEnd, bodyEnd),
                    "Syntax error: Expected a field assignment like field = {value}.");
                i = BibTeXParser.skipToComma(text, Math.max(k, nameStart + 1), bodyEnd);
                missingCommaAt = -1;
                continue;
            }
            // Präzise Komma-Prüfung: Zwischen zwei Feldern muss ein Komma stehen
            if (missingCommaAt !== -1) {
                report(missingCommaAt - 1, missingCommaAt, "Missing comma at the end of the field assignment.");
            }
            this.checkFieldName(text.slice(nameStart, nameEnd), nameStart, type, report);

            i = k + 1;
            while (i < bodyEnd && isSpace(i)) i++;
            const value = BibTeXParser.scanValue(text, i, bodyEnd);
            if (value.parts.length === 0) {
                report(nameStart, k + 1, "Missing value: Expected a value in {…} or \"…\" after \"=\".");
                missingCommaAt = -1;
                continue;
            }
            if (!value.complete) {
                report(i, i + 1, "This quotation mark is never closed.");
            }
            missingCommaAt = value.end;
            i = value.end;
        }
    },

    // Typspezifische Feld-Validierung (Warnungen)
    checkFieldName(rawName, start, type, report) {
        const fieldName = rawName.replace(/^OPT(?=[a-z])/, "").toLowerCase();
        if (this.validTypes.includes(type)) {
            if (!this.isFieldValidForType(fieldName, type)) {
                report(start, start + rawName.length, `The field "${fieldName}" is unusual for type "@${type}".`, "warning");
            }
        } else if (!this.isFieldValidForType(fieldName, null)) {
            report(start, start + rawName.length, `Unknown field: "${fieldName}".`, "warning");
        }
    },

    /**
     * Meldet einen nicht geschlossenen Eintrag. Beginnt innerhalb eines noch offenen {…}-Werts eine
     * Zeile mit einer neuen Feldzuweisung, wird die Klammer dieses Werts als Ursache markiert.
     */
    reportUnclosed(text, entryStart, bodyStart, limit, report) {
        const openBraces = [];
        const fieldLine = /^[ \t]*[^\s"#%'(),={}]+[ \t]*=/;
        for (let i = bodyStart; i < limit; i++) {
            const ch = text[i];
            if (ch === "{") openBraces.push(i);
            else if (ch === "}") openBraces.pop();
            else if (ch === "\n" && openBraces.length > 0 && fieldLine.test(text.slice(i + 1, i + 200))) {
                const brace = openBraces[openBraces.length - 1];
                report(brace, brace + 1, "This brace is never closed.");
                return;
            }
        }
        report(entryStart, bodyStart, "This entry is never closed: a closing brace is missing.");
    },

    // Text außerhalb von Einträgen ignoriert BibTeX; eine überzählige "}" deutet aber auf einen zu früh beendeten Eintrag hin
    checkOutsideText(text, from, to, report) {
        let depth = 0;
        let inComment = false;
        for (let i = from; i < to; i++) {
            const ch = text[i];
            if (ch === "\n") inComment = false;
            else if (inComment) continue;
            else if (ch === "%") inComment = true;
            else if (ch === "{") depth++;
            else if (ch === "}") {
                if (depth > 0) depth--;
                else report(i, i + 1, "Unexpected closing brace outside of an entry.");
            }
        }
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
            window.addEventListener("keydown", (e) => {
                if (e.key === "Escape") this.shortcutsModal.classList.remove("show-modal");
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

// --- 12. LAYOUT MODULE (Layout-Toggle: Top-Bar ↔ Side-by-Side) ---
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

        // Inline-Grid-Styles zurücksetzen, damit das CSS-Grid sauber greift
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
    // Zuletzt gesehener Inhalt der Zwischenablage; derselbe Inhalt wird nicht erneut automatisch importiert
    lastClipboardText: "",
    toggleBtn: null,

    wasOutside: false,

    init() {
        this.toggleBtn = document.getElementById("clipboard-toggle");

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
                    setTimeout(() => this.checkClipboard(), 50);
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
                setTimeout(() => this.checkClipboard(), 60);
            }
        });

        // 3. Erster Klick nach Rückkehr von extern (garantiert Browser-User-Activation)
        document.addEventListener("pointerdown", () => {
            if (this.wasOutside && this.isEnabled) {
                this.wasOutside = false;
                this.checkClipboard();
            }
        }, { capture: true });

        // 4. Internes Kopieren/Ausschneiden in BibStream: Text als bekannt markieren, damit er nicht
        // unbeabsichtigt als neues Zitat auto-importiert wird (Capture-Phase: vor CodeMirror)
        const rememberCopiedText = () => {
            const cm = EditorModule.editorInstance;
            const sel = cm && cm.hasFocus() ? cm.getSelection() : (window.getSelection ? window.getSelection().toString() : "");
            if (sel) {
                this.lastClipboardText = sel.trim();
            }
        };
        document.addEventListener("copy", rememberCopiedText, true);
        document.addEventListener("cut", rememberCopiedText, true);

        // 5. Normales Einfügen (Strg+V): Funktioniert IMMER ohne Browser-Berechtigungs-Prompt.
        // Capture-Phase, damit CodeMirror den Rohtext nicht zusätzlich an der Cursorposition einfügt.
        window.addEventListener("paste", (e) => {
            // Einfügen in das Suchfeld oder andere Eingabefelder nicht abfangen
            const target = e.target;
            if (target instanceof Element && !target.closest(".CodeMirror") &&
                target.matches("input, textarea, [contenteditable]")) return;
            const pastedText = e.clipboardData ? e.clipboardData.getData("text") : "";
            if (pastedText && this.extractBibtexEntries(pastedText).length > 0) {
                e.preventDefault();
                e.stopPropagation();
                this.lastClipboardText = pastedText.trim();
                this.processText(pastedText);
            }
        }, true);

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
            ToastModule.show("Auto-import active", "Checks for citations when switching to BibStream");
            this.checkClipboard();
        } else {
            ToastModule.show("Auto-import paused", "Automatic detection disabled");
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

    // Liest die Zwischenablage und übernimmt enthaltene BibTeX-Einträge; derselbe Inhalt wird nur einmal verarbeitet
    async checkClipboard() {
        if (!this.isEnabled) return;
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") return;

        // Keine parallelen Abfragen
        if (this.isChecking) return;
        this.isChecking = true;
        try {
            const text = ((await navigator.clipboard.readText()) || "").trim();
            if (!text || text === this.lastClipboardText) return;
            this.lastClipboardText = text;
            this.processText(text);
        } catch (err) {
            console.log("[ClipboardModule] readText:", err && err.message);
        } finally {
            this.isChecking = false;
        }
    },

    /**
     * Prüft, ob der gegebene Text einen oder mehrere BibTeX-Einträge enthält, und übernimmt sie.
     * Unterstützt IEEE (@INPROCEEDINGS{11404116, ...}), ACM, Springer, arXiv etc.
     */
    processText(rawText) {
        const entries = this.extractBibtexEntries(rawText);
        entries.forEach(entry => {
            this.handleDetectedEntry(entry);
        });
        return entries.length;
    },

    /**
     * Extrahiert vollständige BibTeX-Einträge (geschweifte oder runde Klammern) aus beliebigem Text.
     * Plausibilitätsprüfung: gültiger Schlüssel (ohne Leerraum, Klammern, spitze Klammern o. Ä.)
     * und mindestens eine Feldzuweisung.
     */
    extractBibtexEntries(text) {
        return BibTeXParser.findEntries(text)
            .filter(entry => !entry.special && entry.validKey)
            .map(entry => ({
                type: text.slice(entry.typeStart, entry.typeStart + entry.type.length),
                key: entry.key,
                fields: BibTeXParser.scanFields(text, entry.fieldsStart, entry.bodyEnd).fields.map(field => ({
                    name: field.rawName,
                    value: text.slice(field.valueStart, field.valueEnd),
                    parts: field.parts
                }))
            }))
            .filter(entry => entry.fields.length > 0);
    },

    /**
     * Formatiert den BibTeX-Eintrag sauber (Einrückung 2 Spaces, Ausrichtung '='-Zeichen,
     * schließende Klammer auf eigener Zeile). Zahlen werden geklammert; Makros wie
     * "month = jan" bleiben unverändert, da sie sonst ihre Bedeutung verlören.
     */
    formatEntry(entryObj) {
        let formatted = `@${entryObj.type.toLowerCase()}{${entryObj.key},\n`;
        entryObj.fields.forEach((f, idx) => {
            const fieldName = BibTeXParser.formatFieldName(f.name).padEnd(12);
            const isNumber = f.parts.length === 1 && f.parts[0].kind === "bare" && /^\d+$/.test(f.parts[0].text);
            const valFormatted = isNumber ? `{${f.value}}` : f.value;
            const isLast = idx === entryObj.fields.length - 1;
            formatted += `  ${fieldName} = ${valFormatted}${isLast ? '' : ','}\n`;
        });
        formatted += `}`;
        return formatted;
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

        // 1. Prüfen, ob dieser Eintrag bereits im aktuellen Dokument vorhanden ist
        const keyLower = entryObj.key.toLowerCase();
        const existing = BibTeXParser.findEntries(currentDoc).find(e => !e.special && e.key.toLowerCase() === keyLower);
        if (existing) {
            EditorModule.jumpToKey(existing.key, true);
            SidebarModule.highlightKey(existing.key);
            ToastModule.show("Already exists", `@${entryObj.type}{${entryObj.key}} already exists`);
            return;
        }

        // 2. Sauber formatieren
        const formatted = this.formatEntry(entryObj);

        // 3. Im Editor am Ende anfügen
        const separator = (currentDoc.trim().length > 0)
            ? (currentDoc.endsWith('\n\n') ? '' : (currentDoc.endsWith('\n') ? '\n' : '\n\n'))
            : '';
        const insertionText = separator + formatted + '\n';
        cm.replaceRange(insertionText, { line: cm.lineCount(), ch: 0 });

        // 4. Zum neuen Eintrag springen, den gesamten Block markieren und fokussieren
        setTimeout(() => {
            EditorModule.jumpToKey(entryObj.key, true);
            SidebarModule.highlightKey(entryObj.key);
        }, 80);

        // 5. Toast-Benachrichtigung anzeigen
        ToastModule.show("New citation added from clipboard", `@${entryObj.type}{${entryObj.key}}`);
    }
};

// Starten
document.addEventListener("DOMContentLoaded", () => App.init());
