/*
 * Gelände-Modell
 * --------------
 * Synthetisches Beispielgelände, angelehnt an den Korber Kopf (Gipfel ca. 456 m).
 * KEINE echten Höhendaten. Später durch ein echtes Geländemodell (DGM, LGL BW) ersetzen:
 * dafür nur `heightAt(x, y)` bzw. das Höhenraster `H` austauschen.
 *
 * Koordinaten: x nach Osten, y nach Süden, in Metern, Ausschnitt 1000 x 1000 m.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  // ---- Grenzwerte aus dem Konzept (vorläufig, im Team abgestimmt) ----
  const THRESHOLDS = {
    steil: 30, // ab 30 % Hangneigung: Steilgürtel, Wasser leiten (Steillage nach Weingesetz)
    mittel: 18, // 18–30 %: Mittelhang, bremsen & versickern
    kuppeRadius: 110, // m um den Gipfel, fast eben
  };

  const SIZE = 1000;
  const N = 121;
  const CELL = SIZE / (N - 1);
  const SUMMIT = { x: 500, y: 360 };
  const TOP = 456;

  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // Hangneigung (als Anteil) in Abhängigkeit vom Abstand zum Gipfel
  function slopeProfile(d) {
    const s1 = smoothstep(80, 130, d);
    const s2 = smoothstep(300, 340, d);
    const s3 = smoothstep(540, 580, d);
    return 0.03 + s1 * (0.42 - 0.03) + s2 * (0.24 - 0.42) + s3 * (0.11 - 0.24);
  }
  const DROP = new Float64Array(1601);
  for (let i = 1; i <= 1600; i++) DROP[i] = DROP[i - 1] + slopeProfile(i - 0.5);
  function drop(d) {
    if (d >= 1600) return DROP[1600] + (d - 1600) * 0.11;
    const i = Math.floor(d);
    const f = d - i;
    return DROP[i] * (1 - f) + DROP[i + 1] * f;
  }

  // effektiver Abstand: Süden steiler, Osten/Westen etwas flacher
  function effDist(x, y) {
    const dx = (x - SUMMIT.x) * 0.85;
    const dyRaw = y - SUMMIT.y;
    const dy = dyRaw * (dyRaw > 0 ? 1.1 : 0.9);
    return Math.sqrt(dx * dx + dy * dy);
  }

  // zwei Abflussrinnen (Muldenlinien) Richtung Südost und Südwest
  const GULLIES = [0.55, -0.55];
  function gullyStrength(x, y) {
    const dx = x - SUMMIT.x;
    const dy = y - SUMMIT.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return 0;
    const theta = Math.atan2(dx, dy); // 0 = Süden
    let best = 0;
    for (const c of GULLIES) {
      const lateral = d * Math.sin(theta - c);
      const along = Math.cos(theta - c);
      if (along <= 0) continue;
      const g = Math.exp(-((lateral / 28) ** 2)) * smoothstep(150, 300, d);
      if (g > best) best = g;
    }
    return best;
  }

  function heightAt(x, y) {
    const d = effDist(x, y);
    const noise = 1.2 * Math.sin(x / 37) * Math.cos(y / 53) + 0.8 * Math.sin((x + y) / 71);
    return TOP - drop(d) - 7 * gullyStrength(x, y) + noise * smoothstep(60, 200, d);
  }

  // ---- Raster berechnen ----
  const H = new Float64Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) H[j * N + i] = heightAt(i * CELL, j * CELL);

  const idx = (i, j) => j * N + i;
  const hAt = (i, j) => H[idx(Math.min(N - 1, Math.max(0, i)), Math.min(N - 1, Math.max(0, j)))];

  const SLOPE = new Float64Array(N * N); // in Prozent
  const ASPECT = new Float64Array(N * N); // Hangrichtung (Gefälle), Grad, 0 = Nord, 90 = Ost
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const dzdx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * CELL);
      const dzdy = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * CELL);
      SLOPE[idx(i, j)] = Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100;
      // Gefällerichtung = -Gradient; y zeigt nach Süden
      const ax = -dzdx;
      const ay = -dzdy;
      ASPECT[idx(i, j)] = ((Math.atan2(ax, -ay) * 180) / Math.PI + 360) % 360;
    }

  // ---- Zonen ----
  const ZONES = {
    kuppe: { key: 'kuppe', name: 'Kuppe', sub: 'Schwammkuppe', range: 'fast eben', water: 'viel Wasser in den Boden', color: '#5BC07A' },
    steil: { key: 'steil', name: 'Steilgürtel', sub: 'Leithang', range: 'über 30 %', water: 'Wasser leiten', color: '#F1E62B' },
    mittel: { key: 'mittel', name: 'Mittelhang', sub: '', range: '18–30 %', water: 'bremsen & versickern', color: '#8FA2FF' },
    auslauf: { key: 'auslauf', name: 'Auslauf & Hangfuß', sub: '', range: 'unter 18 %', water: 'versickern lassen', color: '#2433F0' },
    rinne: { key: 'rinne', name: 'Muldenlinie', sub: 'Abflussrinne', range: 'Tiefenlinie', water: 'Stufenrinne mit Kopfweiden', color: '#3FD0E0' },
  };
  const ZONE_ORDER = ['kuppe', 'steil', 'mittel', 'auslauf', 'rinne'];

  function classify(x, y, slope) {
    if (effDist(x, y) < THRESHOLDS.kuppeRadius && slope < THRESHOLDS.mittel) return 'kuppe';
    if (gullyStrength(x, y) > 0.55) return 'rinne';
    if (slope >= THRESHOLDS.steil) return 'steil';
    if (slope >= THRESHOLDS.mittel) return 'mittel';
    return 'auslauf';
  }
  const ZONE = new Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) ZONE[idx(i, j)] = classify(i * CELL, j * CELL, SLOPE[idx(i, j)]);

  // ---- Kennzahlen je Zone ----
  const DIRS = ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'];
  const dirName = (deg) => DIRS[Math.round(deg / 45) % 8];
  function zoneStats() {
    const acc = {};
    for (const k of ZONE_ORDER) acc[k] = { cells: 0, slopeSum: 0, minS: Infinity, maxS: -Infinity, ax: 0, ay: 0, hs: [0, 0, 0, 0, 0, 0, 0, 0] };
    for (let n = 0; n < N * N; n++) {
      const a = acc[ZONE[n]];
      const s = SLOPE[n];
      a.cells++;
      a.slopeSum += s;
      a.minS = Math.min(a.minS, s);
      a.maxS = Math.max(a.maxS, s);
      const r = (ASPECT[n] * Math.PI) / 180;
      a.ax += Math.sin(r);
      a.ay += Math.cos(r);
      a.hs[Math.round(ASPECT[n] / 45) % 8]++;
    }
    const total = N * N;
    return ZONE_ORDER.map((k) => {
      const a = acc[k];
      const top = a.hs.indexOf(Math.max(...a.hs));
      const deg = top * 45;
      return {
        ...ZONES[k],
        share: a.cells / total,
        ha: ((a.cells / total) * SIZE * SIZE) / 10000,
        meanSlope: a.cells ? a.slopeSum / a.cells : 0,
        mainDir: a.cells ? dirName(deg) : '–',
      };
    });
  }

  // ---- Höhenlinien (Marching Squares) ----
  function contours(step) {
    const segs = [];
    let min = Infinity;
    let max = -Infinity;
    for (const v of H) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const start = Math.ceil(min / step) * step;
    for (let lvl = start; lvl <= max; lvl += step) {
      const list = [];
      for (let j = 0; j < N - 1; j++)
        for (let i = 0; i < N - 1; i++) {
          const c = [
            [i, j, hAt(i, j)],
            [i + 1, j, hAt(i + 1, j)],
            [i + 1, j + 1, hAt(i + 1, j + 1)],
            [i, j + 1, hAt(i, j + 1)],
          ];
          const pts = [];
          for (let e = 0; e < 4; e++) {
            const a = c[e];
            const b = c[(e + 1) % 4];
            if ((a[2] < lvl) !== (b[2] < lvl)) {
              const t = (lvl - a[2]) / (b[2] - a[2]);
              pts.push([(a[0] + t * (b[0] - a[0])) * CELL, (a[1] + t * (b[1] - a[1])) * CELL]);
            }
          }
          if (pts.length >= 2) list.push([pts[0], pts[1]]);
          if (pts.length === 4) list.push([pts[2], pts[3]]);
        }
      segs.push({ level: lvl, segments: list });
    }
    return segs;
  }

  // ---- Profil für die Simulation: vom Gipfel nach Süden ----
  function profile(stepM) {
    const out = [];
    const x = SUMMIT.x;
    for (let s = 0; SUMMIT.y + s <= SIZE; s += stepM) {
      const y = SUMMIT.y + s;
      const z = heightAt(x, y);
      const zb = heightAt(x, Math.min(SIZE, y + 1));
      const za = heightAt(x, Math.max(0, y - 1));
      const slope = (Math.abs(zb - za) / 2) * 100;
      out.push({ s, z, slope, zone: classify(x, y, slope) });
    }
    return out;
  }

  WB.terrain = {
    name: 'Korber Kopf',
    place: 'Korb, Rems-Murr-Kreis',
    synthetic: true,
    SIZE, N, CELL, SUMMIT, TOP, THRESHOLDS,
    H, SLOPE, ASPECT, ZONE, ZONES, ZONE_ORDER,
    heightAt, idx, zoneStats, contours, profile,
    minH: Math.min(...H),
    maxH: Math.max(...H),
  };
})();
