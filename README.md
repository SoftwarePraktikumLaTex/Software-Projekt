# BibStream

BibStream ist ein BibTeX-Editor, der komplett im Browser läuft. Er bearbeitet `.bib`-Dateien direkt als Text und bietet Syntaxhervorhebung, Fehlerprüfung, Formatierung, eine durchsuch- und sortierbare Eintragsliste sowie den Import von Einträgen aus der Zwischenablage, aus PDF-Dateien und über DOI, arXiv-ID oder ISBN.

## Download

**[BibStream.zip herunterladen](https://github.com/SoftwarePraktikumLaTex/Software-Projekt/raw/main/BibStream.zip)**

Die ZIP enthält nur die Anwendung (`index.html`, `script.js`, `style.css`, `icon.ico`) und diese Anleitung.

## Voraussetzungen

- Ein aktueller Desktop-Browser. Empfohlen werden **Google Chrome** oder **Microsoft Edge**, weil nur dort Dateien direkt überschrieben werden können. In Firefox und Safari funktioniert BibStream auch, *Save* lädt die Datei dort aber als Download herunter.
- Eine **Internetverbindung**. Editor (CodeMirror), PDF.js und Schriftarten werden beim Start aus dem Internet geladen, und der Import über DOI, arXiv-ID oder ISBN fragt Online-Dienste ab.

Sonst wird nichts benötigt: keine Installation, kein Build-Schritt, kein Server und kein Benutzerkonto.

## Starten

1. `BibStream.zip` herunterladen und **entpacken** (unter Windows: Rechtsklick → *Alle extrahieren…*). Nicht direkt aus der ZIP heraus öffnen, sonst fehlen `script.js` und `style.css`.
2. Im entpackten Ordner `BibStream` die Datei **`index.html`** mit Chrome oder Edge öffnen (Doppelklick oder Rechtsklick → *Öffnen mit*).
3. Fertig. Beim ersten Start legt BibStream eine leere Datei *Untitled.bib* an.

`index.html`, `script.js`, `style.css` und `icon.ico` müssen im selben Ordner liegen.

### Optional: über einen lokalen Webserver

Der Ordner kann auch über einen beliebigen statischen Webserver geöffnet werden, zum Beispiel:

- **Visual Studio Code:** Erweiterung *Live Server* installieren, `index.html` öffnen und unten rechts auf *Go Live* klicken.
- **Python:** im Ordner `python -m http.server 8000` ausführen und <http://localhost:8000> öffnen.

Sitzung und Einstellungen speichert der Browser getrennt pro Adresse. Wer BibStream abwechselnd per Doppelklick (`file://`) und über `localhost` öffnet, sieht deshalb jeweils andere gespeicherte Dateien.

## Erste Schritte

- **Datei öffnen:** *File → Open File (.bib)*
- **Speichern:** *File → Save* oder `Strg+S`
- **Eintrag über DOI, arXiv-ID oder ISBN abrufen:** *Import → Import via Identifier*
- **Literaturverzeichnis aus einer PDF übernehmen:** *Import → Import PDF (Extract References)*
- **Aus der Zwischenablage:** BibTeX-Eintrag (z. B. bei IEEE, ACM oder Springer) kopieren und zu BibStream zurückwechseln. Der Eintrag wird automatisch übernommen. Alternativ mit `Strg+V` einfügen. Der Auto-Import lässt sich oben rechts ausschalten.

## Häufige Probleme

| Problem | Lösung |
|---|---|
| Editor fehlt oder Symbole erscheinen als Text (z. B. `folder`) | Internetverbindung prüfen und Seite neu laden. |
| *Save* lädt die Datei herunter, statt sie zu überschreiben | Chrome oder Edge verwenden. |
| *Save* fragt nach dem Neuladen nach einem Speicherort | Normal: einmal *Save As…* wählen, danach wird direkt überschrieben. |
| Auto-Import aus der Zwischenablage reagiert nicht | Zugriff auf die Zwischenablage im Browser erlauben oder mit `Strg+V` einfügen. |
| PDF-Import findet keine Referenzen | Gescannte PDFs ohne Textebene werden nicht unterstützt. |

## ZIP neu erstellen (für Entwickler)

Nach Änderungen am Code diese committen und im Repository-Ordner ausführen:

```
git archive --format=zip --prefix=BibStream/ -o BibStream.zip HEAD index.html script.js style.css icon.ico README.md
```
