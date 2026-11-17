/*
 * Inhalte aus dem Konzept (FigJam „Produktgestaltung WS 26/27“: Konzept Melissa,
 * Pflanzen Kuppe, Pflanzen und Konzept Abflussrinne). Hier zentral pflegen.
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
        measures: ['Versickerungsmulden alle 5 m', 'Mulde 1 m breit', 'Wall aus dem Aushub, 30–40 cm hoch'],
        plants: {
          'Wall': ['Reben alle 3 m', 'Thymian', 'Dost'],
          'Querriegel': ['Kornelkirsche', 'Felsenbirne'],
          'Muldenrand': ['Seggen', 'Rasen-Schmiele'],
          'Flacher Rand': ['Minze', 'Barbarakraut'],
          'Böschung': ['Luzerne', 'Esparsette', 'Hornklee', 'Feldsalat'],
          'Einzelbäume': ['Mandel', 'Feige', 'Maulbeere'],
        },
      },
      auslauf: {
        idea: 'Im Auslauf des Bergs soll das Wasser gut versickern. Breite Mulden, Becken am Hangfuß.',
        measures: ['Versickerungsmulden alle 8 m', 'Mulde 1,5 m breit', 'Becken am Hangfuß'],
        plants: {
          'Wall, Querriegel, Mulde': ['wie Mittelhang'],
          'Bäume am Hangfuß': ['Walnuss', 'Quitte', 'Mispel'],
        },
      },
      ort: null, // siehe ortInfo
      rinne: {
        idea: 'Stufenrinne mit Kopfweiden. Lebende Querriegel aus Weide bremsen das Wasser.',
        measures: ['Stufenrinne', 'Kopfweiden', 'lebende Querriegel aus Weide'],
        plants: {
          'Außenrand': ['Maulbeere', 'Quitte', 'Mispel', 'Schlehe', 'Weißdorn', 'Wegwarte', 'Wiesensalbei'],
          'Flanke': ['Flatterulme', 'Holunder', 'Roter Hartriegel', 'Schneeball', 'Rohrschwingel'],
          'Sohle': ['Purpurweide', 'Rohrglanzgras', 'Beinwell', 'Schwedenklee'],
        },
      },
    },
    ortInfo: {
      idea: 'Der Ort Korb liegt am Hangfuß. Er ist nicht Teil der Bewirtschaftung, profitiert aber vom Konzept: Weniger Wasser schießt bei Starkregen den Hang hinunter.',
      measures: ['wird in der Simulation als Ziel des Abflusses gezählt', 'Fläche nur zur Orientierung eingeblendet'],
      plants: {},
    },
    toolkit: [
      ['Versickerungsmulde', '1 m breit, 10 m lang, hält kurz bis 30 cm Wasser, bis es versickert'],
      ['Wall', 'aus dem Aushub, 30–40 cm hoch'],
      ['Querriegel', 'an beiden Enden der Mulde'],
      ['Überlauf', 'mit Steinen gesichert'],
      ['Steinpackung', 'wo Wasser von oben ankommt'],
      ['Schluckstreifen', 'Speierling, Mandel'],
    ],
    // Simulationsannahme: Faktor für Starkregen je Zeitraum. PLATZHALTER, bitte mit Klimadaten ersetzen.
    rainFactor: { heute: 1.0, 2050: 1.25, 2075: 1.5, 2125: 1.8 },
  };
})();
