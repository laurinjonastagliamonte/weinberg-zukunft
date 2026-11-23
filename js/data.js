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
    // Pflanzen mit Standortregel für die Karte in der Empfehlung.
    // form: baum (Ring), nutzbaum (Punkt), busch (Dreieck), kraut (Kreuz), rebe (Strich), feucht (Quadrat)
    // wo: Regel in js/plants.js · meide: Problemzonen, in denen die Pflanze nicht gesetzt wird
    plantList: [
      { name: 'Zitterpappel', form: 'baum', wo: 'kuppeInnen', info: 'Pionierbaum, innen auf der Kuppe' },
      { name: 'Salweide', form: 'baum', wo: 'kuppeInnen', info: 'Pionierbaum, Bienenweide im Frühjahr' },
      { name: 'Silberlinde', form: 'baum', wo: 'kuppeInnen', info: 'hitzefest, innen auf der Kuppe' },
      { name: 'Traubeneiche', form: 'baum', wo: 'kuppeInnen', info: 'Waldbaum der Kuppe' },
      { name: 'Elsbeere', form: 'baum', wo: 'kuppeMitte', info: 'Waldbaum, trockenheitsfest' },
      { name: 'Speierling', form: 'nutzbaum', wo: 'kuppeMitte', info: 'Nutzbaum, auch im Schluckstreifen' },
      { name: 'Mandel', form: 'nutzbaum', wo: 'kuppeMitte+einzel', meide: ['frost'], info: 'Nutzbaum, nicht in Frostsenken' },
      { name: 'Kaki', form: 'nutzbaum', wo: 'kuppeMitte', meide: ['frost'], info: 'Nutzbaum, nicht in Frostsenken, im Windschatten der Hecke' },
      { name: 'Granatapfel', form: 'nutzbaum', wo: 'kuppeMitte', meide: ['frost'], info: 'wärmeliebend, im Windschatten der Hecke' },
      { name: 'Haselnuss', form: 'busch', wo: 'kuppeAussen+steil', info: 'Busch am Kuppenrand und im Steilgürtel' },
      { name: 'Schlehe', form: 'busch', wo: 'kuppeAussen+steil', info: 'Windschutz am Rand, sichert steile Böden' },
      { name: 'Hagebutte', form: 'busch', wo: 'kuppeAussen', info: 'Busch, Nahrung für Vögel' },
      { name: 'Wildrose', form: 'busch', wo: 'steil', info: 'Strauch im Steilgürtel' },
      { name: 'Feige', form: 'nutzbaum', wo: 'kuppeAussen+einzel', meide: ['frost'], info: 'nur in warmen Lagen, nicht in Frostsenken' },
      { name: 'Aufrechte Trespe', form: 'kraut', wo: 'kuppeAussen', info: 'Gras mit tiefen Wurzeln' },
      { name: 'Schafschwingel', form: 'kraut', wo: 'kuppeAussen', info: 'trockenheitsfestes Gras' },
      { name: 'Wiesensalbei', form: 'kraut', wo: 'kuppeAussen+boeschung', info: 'Blüten für Bienen' },
      { name: 'Feldthymian', form: 'kraut', wo: 'kuppeAussen', info: 'Polster am Kuppenrand' },
      { name: 'Reben', form: 'rebe', wo: 'damm', meide: ['frost'], info: 'auf dem Damm, alle 3 m eine Rebe' },
      { name: 'Thymian & Dost', form: 'kraut', wo: 'damm', info: 'zwischen den Reben auf dem Damm' },
      { name: 'Kornelkirsche', form: 'busch', wo: 'oeffnung', info: 'an den Öffnungen im Damm' },
      { name: 'Felsenbirne', form: 'busch', wo: 'oeffnung', info: 'an den Öffnungen im Damm' },
      { name: 'Seggen & Rasen-Schmiele', form: 'feucht', wo: 'mulde', info: 'am Muldenrand, verträgt Nässe' },
      { name: 'Minze & Barbarakraut', form: 'feucht', wo: 'mulde', info: 'flacher Muldenrand' },
      { name: 'Luzerne & Esparsette', form: 'kraut', wo: 'boeschung', info: 'Böschung, Hülsenfrüchtler für Schafe und Bienen' },
      { name: 'Hornklee & Feldsalat', form: 'kraut', wo: 'boeschung', info: 'Böschung zwischen den Dämmen' },
      { name: 'Maulbeere', form: 'nutzbaum', wo: 'einzel', meide: ['frost'], info: 'Einzelbaum im Mittelhang' },
      { name: 'Walnuss', form: 'baum', wo: 'hangfuss', info: 'Baum am Hangfuß' },
      { name: 'Quitte', form: 'nutzbaum', wo: 'hangfuss', info: 'Obstbaum am Hangfuß' },
      { name: 'Mispel', form: 'nutzbaum', wo: 'hangfuss', info: 'Obstbaum am Hangfuß' },
    ],
    toolkit: [
      ['Versickerungsmulde', '1 m breit, 10 m lang, hält kurz bis 30 cm Wasser, bis es versickert'],
      ['Wall', 'aus dem Aushub, 30–40 cm hoch'],
      ['Öffnung im Damm', 'alle 100 m, beim nächsten Damm um 50 m versetzt – das Wasser läuft im Zickzack'],
      ['Steinpackung', 'wo Wasser von oben ankommt'],
      ['Schluckstreifen', 'Speierling, Mandel'],
    ],
  };
})();
