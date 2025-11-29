// --- Selektoren ---
const dateiButton = document.querySelector("#datei");
const editButton = document.querySelector("#edit");
const importButton = document.querySelector("#import");
const helpButton = document.querySelector("#help");

const dateiDropown = document.querySelector("#dropdownDateiContent");
const editDropown = document.querySelector("#dropdownEditContent");
const importDropown = document.querySelector("#dropdownImportContent");
const helpDropown = document.querySelector("#dropdownHelpContent");

// KORREKTUR: Die ID im HTML lautet "#search-form", nicht "#form-search"
const formsearch = document.querySelector("#search-form");
const inputsearch = document.querySelector("#input1");

const editorTextarea = document.querySelector("#editor-textarea");
const citationListUl = document.querySelector("#citation-list");

// HINZUGEFÜGT: Ein Array mit allen Dropdowns für eine einfachere Verwaltung
const allDropdowns = [dateiDropown, editDropown, importDropown, helpDropown];

// --- Dropdown-Logik (VERBESSERT) ---

/**
 * HINZUGEFÜGT: Eine Helferfunktion, die ein Dropdown umschaltet
 * und sicherstellt, dass alle anderen geschlossen werden.
 * @param {HTMLElement} targetDropdown - Das Dropdown, das umgeschaltet werden soll.
 */
function toggleDropdown(targetDropdown) {
    allDropdowns.forEach(dropdown => {
        if (dropdown === targetDropdown) {
            // Das angeklickte Dropdown umschalten
            dropdown.classList.toggle("show");
        } else {
            // Alle anderen Dropdowns schließen
            dropdown.classList.remove("show");
        }
    });
}

// KORREKTUR: Jeder Button schaltet jetzt sein EIGENES Dropdown um
dateiButton.addEventListener("click", () => {
    toggleDropdown(dateiDropown);
});

editButton.addEventListener("click", () => {
    toggleDropdown(editDropown);
});

importButton.addEventListener("click", () => {
    toggleDropdown(importDropown);
});

helpButton.addEventListener("click", () => {
    toggleDropdown(helpDropown);
});


// KORREKTUR: "Click-Away"-Logik (stark verbessert)
window.addEventListener("click", function(event) {
    // Prüfen, ob der Klick *nicht* auf einen der Dropdown-Buttons war
    const isDropdownButton = event.target.matches(".datei-btn, .edit-btn, .import-btn, .help-btn");
    
    // Prüfen, ob der Klick *nicht* IN einem der Dropdown-Inhalte war
    // .closest() findet den nächsten übergeordneten Container
    const isInsideDropdown = event.target.closest(".dropdownDateiClass, .dropdownEditClass, .dropdownImportClass, .dropdownHelpClass");

    if (!isDropdownButton && !isInsideDropdown) {
        // Wenn der Klick "draußen" war, schließe alle Dropdowns
        allDropdowns.forEach(dropdown => dropdown.classList.remove("show"));
    }
});


// --- Such-Logik ---
formsearch.addEventListener("submit", (event) => {
    event.preventDefault();
    const inputtext = inputsearch.value;
    console.log("Suche nach:", inputtext); // HINZUGEFÜGT: Feedback
});


// --- Editor-Logik ---
editorTextarea.addEventListener("input", () => {
    const currentText = editorTextarea.value;
    // Diese Funktion hat vorher gefehlt (siehe unten)
    const keys = parseBibtexKeys(currentText);
    updateSidebarList(keys);
});

/**
 * HINZUGEFÜGT: Diese Funktion hat gefehlt und verursachte einen Absturz.
 * Sie extrahiert alle BibTeX-Keys (z.B. @key123) aus einem Text.
 * @param {string} text - Der Text aus der Textarea.
 * @returns {Set<string>} - Ein Set mit einzigartigen Keys.
 */
function parseBibtexKeys(text) {
    const keys = new Set();
    
    // KORREKTUR: Diese RegEx sucht jetzt nach dem Muster "@typ{schlüssel,"
    const regex = /@\w+\{([^,]+),/g;
    
    let match;

    while ((match = regex.exec(text)) !== null) {
        // match[1] ist die "Capturing Group" (der Teil in der Klammer),
        // also der eigentliche Schlüssel (z.B. "Bi:2016")
        keys.add(match[1]);
    }
    return keys;
}

/**
 * Nimmt die Liste der Keys und baut die <li> Elemente in der Sidebar.
 * (Diese Funktion war bereits korrekt)
 * @param {Set<string>} keys - Das Set der gefundenen Keys.
 */
function updateSidebarList(keys) {
    citationListUl.innerHTML = "";
    
    keys.forEach(key => {
        const li = document.createElement("li");
        li.textContent = key;
        
        li.style.cursor = "pointer";
        li.style.padding = "5px";
        li.onclick = () => {
             console.log("Springe zu:", key);
        };
        
        citationListUl.appendChild(li);
    });
}

window.addEventListener("DOMContentLoaded", () => {
    const savedText = localStorage.getItem("editorContent");
    
    if (savedText) {
        // 1. Setze den Text wieder in die Textarea
        editorTextarea.value = savedText;
        
        // 2. Rufe deine Parser-Funktionen manuell auf,
        //    um die Sidebar-Liste sofort zu füllen
        const keys = parseBibtexKeys(savedText);
        updateSidebarList(keys);
    }
});

editorTextarea.addEventListener("input", () => {
    const currentText = editorTextarea.value;
    
   
    localStorage.setItem("editorContent", currentText);
    
  
    const keys = parseBibtexKeys(currentText);
    updateSidebarList(keys);
});

