# weinberg-zukunft

Prototyp der Website für ein klimafestes Bewirtschaftungssystem für Weinberge
(HfG Schwäbisch Gmünd, Produktgestaltung WS 26/27).

Die Seite folgt dem Flowchart im FigJam-Board „Produktgestaltung WS 26/27“ (Section „Website“):

1. **Berg wählen** – Suche, Draufsicht als Punktraster
2. **Analyse** – 3D-Drahtgitter des Bergs, Zonen nach Hangneigung, Höhenlinien
3. **Simulation** – Regen im Hangprofil: heute vs. mit Wall-Mulde-System, Zeitraum, Wallbruch
4. **Empfehlung** – Maßnahmen und Pflanzen je Zone, Baukasten Wall & Mulde, Steckbrief

## Öffnen

Keine Installation nötig. `index.html` per Doppelklick im Browser öffnen.

Direkt zu einem Schritt springen: `index.html#2`, `#3` oder `#4`.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur der vier Schritte |
| `styles.css` | Designrichtung: Weiß/Schwarz, RAL 1016 Gelb, Blau für Wasser, transluzente Panels |
| `js/terrain.js` | Gelände-Modell, Zonen, Höhenlinien, Profil |
| `js/data.js` | Inhalte aus dem Konzept: Maßnahmen und Pflanzen je Zone |
| `js/render3d.js` | 3D-Drahtgitter auf Canvas (ohne Bibliothek) |
| `js/dotmap.js` | Draufsicht als Punktraster |
| `js/simulation.js` | Wassersimulation (Modell + Darstellung) |
| `js/main.js` | Ablauf und Navigation |

## Wichtig: Platzhalter

- **Gelände:** Der Korber Kopf ist ein synthetisches Beispielgelände, keine echten Höhendaten.
  Für echte Berge das Höhenraster in `js/terrain.js` durch ein Geländemodell (DGM, LGL Baden-Württemberg) ersetzen.
- **Simulation:** vereinfachtes Modell zum Zeigen des Prinzips, keine hydrologische Berechnung.
  Parameter stehen oben in `js/simulation.js`.
- **Zeitraum:** ändert nur die Regenstärke (`rainFactor` in `js/data.js`), Annahme bis Klimadaten vorliegen.
- **Wetter je Jahreszeit** und **Robotik-Empfehlung** sind noch leer.

## Grenzwerte (vorläufig)

| Zone | Hangneigung | Wasser |
|---|---|---|
| Kuppe | fast eben | viel Wasser in den Boden (Schwammkuppe) |
| Steilgürtel | über 30 % | leiten |
| Mittelhang | 18–30 % | bremsen & versickern |
| Auslauf & Hangfuß | unter 18 % | versickern lassen |
| Muldenlinie | Tiefenlinie | Stufenrinne mit Kopfweiden |

Änderbar in `js/terrain.js` → `THRESHOLDS`.
