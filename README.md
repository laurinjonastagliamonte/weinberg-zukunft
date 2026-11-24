# weinberg-zukunft

Prototyp der Website für ein klimafestes Bewirtschaftungssystem für Weinberge
(HfG Schwäbisch Gmünd, Produktgestaltung WS 26/27).

Die Seite folgt dem Flowchart im FigJam-Board „Produktgestaltung WS 26/27“ (Section „Website“):

1. **Cover** – „Weinberge zukunftsorientiert denken“, animierte Draufsicht des Korber Kopfs als Zeichenraster (heute ↔ mit Konzept), Bergsuche
2. **Analyse** – 3D-Drahtgitter des Bergs, Zonen nach Hangneigung, Höhenlinien
3. **Simulation** – Regen direkt auf dem 3D-Modell: heute vs. mit Wall-Mulde-System, Zeitraum, Wallbruch
4. **Bepflanzung** – Zone anklicken, rechts deren Pflanzen auswählen; sie erscheinen als Grundformen am 3D-Berg

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
| `js/cover.js` | Titelseite: Korber Kopf als Zeichenraster, verwandelt sich in Beispiele (Wall-Mulde-System, Problemzonen) |
| `js/sim3d.js` | Wassersimulation auf dem 3D-Gelände (Modell + Darstellung) |
| `js/main.js` | Ablauf und Navigation |

## Wichtig: Platzhalter

- **Gelände:** Höhen aus eurem STL-Modell `Korber-Kopf_1zu4000.stl` (1:4000, 2 × 2 km, 10-m-Raster), unverzerrt, leicht geglättet;
  Ortsfläche Korb aus dem früheren Modell übernommen (gleiche Lage)
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
| Ort (Korb) | aus dem STL (eingravierte Ortsgrenze) | nicht bewirtschaftet, nur zur Orientierung |

## Konzept im Modell (Konzept Melissa)

Schalter „Konzept“ in der Analyse, immer an in Simulation (Wall-Mulde-System) und Empfehlung:

- **Kuppe:** Wald von innen nach außen (große Kreise innen, kleine außen)
- **Steilgürtel:** enge Keylines (Rinnen alle 3,5 m), Pfeile zeigen, wie das Wasser zur Muldenlinie geleitet wird
- **Mittelhang:** Keylines alle 5 m – Wall mit Reben (weiß), Mulde 1 m dahinter (blau)
- **Auslauf:** weitere Keylines alle 8 m, breitere Mulden (1,5 m), Becken am Hangfuß
- **Querriegel** je 10-m-Kammer, **Überlauf mit Steinen** in der Kammermitte

Die echten Abstände (3,5 / 5 / 8 m) wären auf 2 km nicht zu sehen. Dargestellt werden sie mit
32 / 58 / 95 m (`KEYLINE.vis` in `js/terrain.js`): oben eng, nach unten deutlich weiter.

Änderbar in `js/terrain.js` → `THRESHOLDS`.

## Problemzonen (Analyse → „Problemzonen“)

Aus der Geländelage abgeleitet, keine Messdaten (in `js/terrain.js`):

| Problem | Kriterium |
|---|---|
| Frost | Senke: 6 m tiefer als die Umgebung im 300-m-Umkreis, flacher als 10 % (Kaltluft) |
| Trockenheit | steiler als 18 %, nach Süd bis West geneigt, gewölbt |
| Feuchte | flach (unter 10 %) mit großem Einzugsgebiet (Feuchteindex) |
| Wind | exponierter Rücken: 6 m über der Umgebung, obere Hanglage |

Maßnahmen je Problem stehen in `js/data.js` → `problemMeasures` und erscheinen in der Empfehlung je Zone.

## Muldengraben mit versetzten Öffnungen (Skizze 17.11.)

Jeder Damm hat alle **100 m eine Öffnung**, beim nächsten Damm ist sie um **50 m versetzt**
(`OPENING` in `js/terrain.js`). In der Simulation läuft das Wasser in der Mulde seitlich bis zur
nächsten Öffnung, fällt eine Stufe tiefer und läuft wieder seitlich – ein eckiger Zickzack, der das
Wasser bremst. Die helle Spur hinter jedem Tropfen zeigt diesen Weg.

## Wetter (`js/weather.js`)

- **Jahreszeiten:** Mittel 1995–2024 für den Gipfel des Korber Kopfs (48,8538 N / 9,3672 E) aus dem
  Open-Meteo-Archiv (ERA5-Reanalyse, Rasterzelle ~470 m). Temperatur, Regen, Verdunstung, Frost-/Hitzetage, Sonne, Wind.
- **2050:** Änderung 2041–2050 gegenüber 1995–2014, Mittel aus zwei Klimamodellen (EC_Earth3P_HR, MPI_ESM1_2_XR, Open-Meteo Climate API).
- **2075 / 2125:** Trend aus 2050 fortgeschrieben – **Annahme**, keine Modelldaten.
- **Jetzt:** live aus der Open-Meteo Forecast API (braucht Internet).
- Analyse: Jahreszeit/Jetzt hebt die passenden Problemzonen hervor und zeigt den Wind als rote Pfeile.
- Simulation: Jahreszeit/Jetzt ändert Regenmenge, Bodenaufnahme (trockener Sommerboden), Windversatz und Schnee unter 0 °C.

Daten: Open-Meteo.com, CC BY 4.0.

## Pflanzen am Berg (`js/plants.js`)

In der Bepflanzung lassen sich Pflanzen auswählen; sie erscheinen als Grundformen am 3D-Berg.
Gepflanzt wird nur im Bereich `AREA` (`js/terrain.js`): bis 720 m um den Gipfel und mindestens 60 m Abstand
zum Ort – also Berg und naher Hangfuß, nicht weit draußen in der Landschaft. Der Berg wird in der
3D-Ansicht als quadratisches „Tuch“ gezeigt: nur die Oberfläche, ohne Sockel und Seitenwände.
Baum = Ring · Nutzbaum = Punkt · Busch = Dreieck · Kraut/Gras = Kreuz · Rebe = Strich · Muldenrand = Quadrat.
Standortregeln (Kuppe innen/Mitte/außen, Steilgürtel, Damm, Öffnung, Mulde, Böschung, Einzelbaum, Hangfuß)
und Problemzonen, die eine Pflanze meidet, stehen in `js/data.js` → `plantList`.
