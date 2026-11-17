# weinberg-zukunft

Prototyp der Website für ein klimafestes Bewirtschaftungssystem für Weinberge
(HfG Schwäbisch Gmünd, Produktgestaltung WS 26/27).

Die Seite folgt dem Flowchart im FigJam-Board „Produktgestaltung WS 26/27“ (Section „Website“):

1. **Berg wählen** – Suche, Draufsicht als Punktraster
2. **Analyse** – 3D-Drahtgitter des Bergs, Zonen nach Hangneigung, Höhenlinien
3. **Simulation** – Regen direkt auf dem 3D-Modell: heute vs. mit Wall-Mulde-System, Zeitraum, Wallbruch
4. **Empfehlung** – Zone auf dem 3D-Modell anklicken: Maßnahmen und Pflanzen, dazu Baukasten Wall & Mulde und Steckbrief

## Öffnen

Keine Installation nötig. `index.html` per Doppelklick im Browser öffnen.

Direkt zu einem Schritt springen: `index.html#2`, `#3` oder `#4`.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Seitenstruktur der vier Schritte |
| `styles.css` | Designrichtung: Weiß/Schwarz, RAL 1016 Gelb, Blau für Wasser, transluzente Panels |
| `js/korber-kopf-data.js` | Höhenraster Korber Kopf (aus dem STL-Modell) |
| `js/terrain.js` | Neigung, Fließwege, Zonen, Höhenlinien, Profil |
| `js/data.js` | Inhalte aus dem Konzept: Maßnahmen und Pflanzen je Zone |
| `js/render3d.js` | 3D-Drahtgitter auf Canvas (ohne Bibliothek), Drehen, Zoomen, Zone anklicken |
| `js/dotmap.js` | Draufsicht als Punktraster |
| `js/sim3d.js` | Wassersimulation auf dem 3D-Gelände (Modell + Darstellung) |
| `js/main.js` | Ablauf und Navigation |

## Wichtig: Platzhalter

- **Gelände:** Höhen aus eurem STL-Modell `Korber_Kopf_15x15cm.stl` (1:13333, 2 × 2 km), auf 10-m-Raster verkleinert
  und an den Kachel-Höhendaten (`korber_kopf_daten/mosaic.npy`) ausgerichtet (mittlere Abweichung unter 1 m).
  Daten in `js/korber-kopf-data.js`. Für weitere Berge eine neue Datendatei im gleichen Format anlegen.
- **Simulation:** vereinfachtes Modell zum Zeigen des Prinzips, keine hydrologische Berechnung.
  Parameter stehen oben in `js/sim3d.js`.
- **Zeitraum:** ändert nur die Regenstärke (`rainFactor` in `js/data.js`), Annahme bis Klimadaten vorliegen.
- **Wetter je Jahreszeit** und **Robotik-Empfehlung** sind noch leer.

## Grenzwerte (vorläufig)

| Zone | Hangneigung | Wasser |
|---|---|---|
| Kuppe | fast eben | viel Wasser in den Boden (Schwammkuppe) |
| Steilgürtel | über 30 % | leiten |
| Mittelhang | 18–30 % | bremsen & versickern |
| Auslauf & Hangfuß | unter 18 % | versickern lassen |
| Muldenlinie | ab 1,5 ha Einzugsgebiet (Fließwege) | Stufenrinne mit Kopfweiden |

Änderbar in `js/terrain.js` → `THRESHOLDS`.
