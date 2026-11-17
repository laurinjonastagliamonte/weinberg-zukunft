/*
 * Inhalte aus dem Konzept (FigJam „Produktgestaltung WS 26/27“: Konzept Melissa,
 * Pflanzen Kuppe). Hier zentral pflegen.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  WB.content = {
    zones: {
      kuppe: {
        idea: 'Schwammkuppe: möglichst viel Wasser in den Boden ableiten. Wald von innen nach außen, Schutz und Nahrung für Tiere.',
        measures: ['Wald von innen nach außen', 'innen große Pionierbäume, teils Nutzbäume', 'nach außen Büsche, am Rand Gräser und Kräuter'],
        plants: {
          'Pionier- & Waldbäume': ['Zitterpappel', 'Salweide', 'Silberlinde', 'Traubeneiche', 'Elsbeere'],
          'Nutzbäume': ['Speierling', 'Mandel', 'Kaki', 'Granatapfel'],
          'Büsche': ['Haselnuss', 'Schlehe', 'Hagebutte', 'Feige'],
          'Gräser & Kräuter': ['Aufrechte Trespe', 'Schafschwingel', 'Esparsette', 'Luzerne', 'Wiesensalbei', 'Feldthymian', 'Spitzwegerich'],
        },
        open: 'Noch offen: Mischung mit dem Rad (Schwammbecken, Rinnenstern, Agri-PV)?',
      },
      steil: {
        idea: 'Leithang: Wasser wird geleitet, nicht gehalten. Kein Stauwasser auf steilen Flächen.',
        measures: ['Rinnen alle 3,5 m', 'enge Wellen mit Steinfuß', 'Sträucher sichern den Boden'],
        plants: { 'Sträucher': ['Schlehe', 'Wildrose', 'Hasel'] },
      },
      mittel: {
        idea: 'Wasser bremsen und versickern lassen. Erdwellen, Reben auf den Kronen der Wälle.',
        measures: ['Muldengraben: Dämme quer zum Hang, Mulde dahinter', 'Öffnung alle 100 m, von Damm zu Damm versetzt', 'Wasser läuft im Zickzack, wird langsam und versickert'],
        plants: {
          'Wall': ['Reben alle 3 m', 'Thymian', 'Dost'],
          'An den Öffnungen': ['Kornelkirsche', 'Felsenbirne'],
          'Muldenrand': ['Seggen', 'Rasen-Schmiele'],
          'Flacher Rand': ['Minze', 'Barbarakraut'],
          'Böschung': ['Luzerne', 'Esparsette', 'Hornklee', 'Feldsalat'],
          'Einzelbäume': ['Mandel', 'Feige', 'Maulbeere'],
        },
      },
      auslauf: {
        idea: 'Im Auslauf des Bergs soll das Wasser gut versickern. Breite Mulden, Becken am Hangfuß.',
        measures: ['Muldengraben mit weiterem Abstand, Mulde 1,5 m breit', 'Öffnungen alle 100 m, versetzt', 'Becken am Hangfuß'],
        plants: {
          'Damm, Öffnungen, Mulde': ['wie Mittelhang'],
          'Bäume am Hangfuß': ['Walnuss', 'Quitte', 'Mispel'],
        },
      },
      ort: null, // siehe ortInfo
    },
    ortInfo: {
      idea: 'Der Ort Korb liegt am Hangfuß. Er ist nicht Teil der Bewirtschaftung, profitiert aber vom Konzept: Weniger Wasser schießt bei Starkregen den Hang hinunter.',
      measures: ['wird in der Simulation als Ziel des Abflusses gezählt', 'Fläche nur zur Orientierung eingeblendet'],
      plants: {},
    },
    // Was tun bei Problemzonen (allgemeine Gestaltungsregeln, mit Team/Expert:innen prüfen)
    problemMeasures: {
      frost: 'Keine frostempfindlichen Arten (Feige, Kaki, Granatapfel) in Senken, spät austreibende Sorten, Kaltluft abfließen lassen statt mit dichten Hecken stauen.',
      trocken: 'Mulden hier zuerst bauen, tief wurzelnde Begrünung (Luzerne, Esparsette, Trespe), Boden bedeckt halten.',
      feucht: 'Staunässefeste Arten (Weide, Beinwell, Seggen), keine Reben, Wasser hier bewusst versickern lassen.',
      wind: 'Windschutz am Rand mit Hecken (Schlehe, Hasel, Hagebutte), Junganlagen geschützt setzen.',
    },
    toolkit: [
      ['Versickerungsmulde', '1 m breit, 10 m lang, hält kurz bis 30 cm Wasser, bis es versickert'],
      ['Wall', 'aus dem Aushub, 30–40 cm hoch'],
      ['Öffnung im Damm', 'alle 100 m, beim nächsten Damm um 50 m versetzt – das Wasser läuft im Zickzack'],
      ['Steinpackung', 'wo Wasser von oben ankommt'],
      ['Schluckstreifen', 'Speierling, Mandel'],
    ],
    // Simulationsannahme: Faktor für Starkregen je Zeitraum. PLATZHALTER, bitte mit Klimadaten ersetzen.
    rainFactor: { heute: 1.0, 2050: 1.25, 2075: 1.5, 2125: 1.8 },
  };
})();
