/*
 * Gelände-Modell
 * --------------
 * Lädt das Höhenraster aus js/korber-kopf-data.js (aus eurem STL-Modell) und berechnet:
 * Hangneigung, Hangrichtung, Fließwege (Muldenlinien), Zonen, Höhenlinien und das Hangprofil.
 *
 * Koordinaten: x nach Osten, y nach Süden, in Metern.
 */
(function () {
  const WB = (window.WB = window.WB || {});
  const D = WB.terrainData;

  // ---- Grenzwerte aus dem Konzept (vorläufig, im Team abgestimmt) ----
  const THRESHOLDS = {
    steil: 30, // ab 30 % Hangneigung: Steilgürtel, Wasser leiten (Steillage nach Weingesetz)
    mittel: 18, // 18–30 %: Mittelhang, bremsen & versickern
    kuppeDrop: 15, // Kuppe: höchstens 15 m unter dem Gipfel ...
    rinneArea: 1.5, // Muldenlinie: ab 1,5 ha Einzugsgebiet sammelt sich das Wasser
  };

  // ---- Höhenraster dekodieren ----
  const N = D.n;
  const SIZE = D.size;
  const CELL = SIZE / (N - 1);
  const bin = atob(D.data);
  const H = new Float64Array(N * N);
  for (let k = 0; k < N * N; k++) {
    const v = bin.charCodeAt(2 * k) | (bin.charCodeAt(2 * k + 1) << 8);
    H[k] = (D.baseDm + v) / 10;
  }
  const idx = (i, j) => j * N + i;
  const clampI = (v) => Math.min(N - 1, Math.max(0, v));
  const hAt = (i, j) => H[idx(clampI(i), clampI(j))];

  let maxH = -Infinity;
  let minH = Infinity;
  let top = 0;
  for (let k = 0; k < N * N; k++) {
    if (H[k] > maxH) { maxH = H[k]; top = k; }
    if (H[k] < minH) minH = H[k];
  }
  const SUMMIT = { x: (top % N) * CELL, y: Math.floor(top / N) * CELL };

  function heightAt(x, y) {
    const fx = Math.min(N - 1.0001, Math.max(0, x / CELL));
    const fy = Math.min(N - 1.0001, Math.max(0, y / CELL));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const a = hAt(i, j), b = hAt(i + 1, j), c = hAt(i, j + 1), d = hAt(i + 1, j + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  // ---- Neigung und Richtung ----
  const SLOPE = new Float64Array(N * N); // Prozent
  const ASPECT = new Float64Array(N * N); // Gefällerichtung in Grad, 0 = Nord, 90 = Ost
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const dzdx = (hAt(i + 1, j) - hAt(i - 1, j)) / ((Math.min(N - 1, i + 1) - Math.max(0, i - 1)) * CELL);
      const dzdy = (hAt(i, j + 1) - hAt(i, j - 1)) / ((Math.min(N - 1, j + 1) - Math.max(0, j - 1)) * CELL);
      SLOPE[idx(i, j)] = Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100;
      ASPECT[idx(i, j)] = ((Math.atan2(-dzdx, dzdy) * 180) / Math.PI + 360) % 360;
    }

  // ---- Fließwege (D8) für Muldenlinien ----
  const ACC = new Float64Array(N * N).fill(1); // Anzahl Zellen im Einzugsgebiet
  {
    const order = [...Array(N * N).keys()].sort((a, b) => H[b] - H[a]);
    for (const k of order) {
      const i = k % N;
      const j = Math.floor(k / N);
      let best = -1;
      let bestDrop = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const drop = (H[k] - H[idx(ii, jj)]) / Math.hypot(di, dj);
          if (drop > bestDrop) { bestDrop = drop; best = idx(ii, jj); }
        }
      if (best >= 0) ACC[best] += ACC[k];
    }
  }
  const rinneCells = (THRESHOLDS.rinneArea * 10000) / (CELL * CELL);

  // ---- Zonen ----
  const ZONES = {
    kuppe: { key: 'kuppe', name: 'Kuppe', sub: 'Schwammkuppe', range: 'fast eben', water: 'viel Wasser in den Boden', color: '#5BC07A' },
    steil: { key: 'steil', name: 'Steilgürtel', sub: 'Leithang', range: 'über 30 %', water: 'Wasser leiten', color: '#F1E62B' },
    mittel: { key: 'mittel', name: 'Mittelhang', sub: '', range: '18–30 %', water: 'bremsen & versickern', color: '#8FA2FF' },
    auslauf: { key: 'auslauf', name: 'Auslauf & Hangfuß', sub: '', range: 'unter 18 %', water: 'versickern lassen', color: '#2433F0' },
    rinne: { key: 'rinne', name: 'Muldenlinie', sub: 'Abflussrinne', range: 'Tiefenlinie', water: 'Stufenrinne mit Kopfweiden', color: '#3FD0E0' },
  };
  const ZONE_ORDER = ['kuppe', 'steil', 'mittel', 'auslauf', 'rinne'];

  const ZONE = new Array(N * N);
  for (let k = 0; k < N * N; k++) {
    const s = SLOPE[k];
    if (H[k] >= maxH - THRESHOLDS.kuppeDrop && s < THRESHOLDS.mittel) ZONE[k] = 'kuppe';
    else if (ACC[k] >= rinneCells) ZONE[k] = 'rinne';
    else if (s >= THRESHOLDS.steil) ZONE[k] = 'steil';
    else if (s >= THRESHOLDS.mittel) ZONE[k] = 'mittel';
    else ZONE[k] = 'auslauf';
  }
  const cellAt = (x, y) => idx(clampI(Math.round(x / CELL)), clampI(Math.round(y / CELL)));
  const zoneAt = (x, y) => ZONE[cellAt(x, y)];
  const slopeAt = (x, y) => SLOPE[cellAt(x, y)];

  // ---- Kennzahlen je Zone ----
  const DIRS = ['Nord', 'Nordost', 'Ost', 'Südost', 'Süd', 'Südwest', 'West', 'Nordwest'];
  function zoneStats() {
    const acc = {};
    for (const k of ZONE_ORDER) acc[k] = { cells: 0, slopeSum: 0, hs: [0, 0, 0, 0, 0, 0, 0, 0] };
    for (let n = 0; n < N * N; n++) {
      const a = acc[ZONE[n]];
      a.cells++;
      a.slopeSum += SLOPE[n];
      a.hs[Math.round(ASPECT[n] / 45) % 8]++;
    }
    const total = N * N;
    return ZONE_ORDER.map((k) => {
      const a = acc[k];
      const topDir = a.hs.indexOf(Math.max(...a.hs));
      return {
        ...ZONES[k],
        share: a.cells / total,
        ha: ((a.cells / total) * SIZE * SIZE) / 10000,
        meanSlope: a.cells ? a.slopeSum / a.cells : 0,
        mainDir: a.cells ? DIRS[topDir] : '–',
      };
    });
  }

  // ---- Höhenlinien (Marching Squares) ----
  function contours(step) {
    const segs = [];
    const start = Math.ceil(minH / step) * step;
    for (let lvl = start; lvl <= maxH; lvl += step) {
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

  // ---- Hangprofil vom Gipfel aus in eine Richtung (Grad, 0 = Nord, 180 = Süd) ----
  function profile(stepM, dirDeg) {
    const r = (dirDeg * Math.PI) / 180;
    const dx = Math.sin(r);
    const dy = -Math.cos(r);
    const out = [];
    for (let s = 0; ; s += stepM) {
      const x = SUMMIT.x + dx * s;
      const y = SUMMIT.y + dy * s;
      if (x < 0 || y < 0 || x > SIZE || y > SIZE) break;
      out.push({ s, x, y, z: heightAt(x, y), slope: slopeAt(x, y), zone: zoneAt(x, y) });
    }
    return out;
  }

  // Richtung für das Simulationsprofil: hangabwärts mit möglichst allen Zonen und wenig Muldenlinie
  function bestProfileDir() {
    let best = { dir: 180, score: -Infinity };
    for (let d = 90; d <= 270; d += 5) {
      const p = profile(10, d);
      if (p.length < 30) continue;
      const c = {};
      for (const q of p) c[q.zone] = (c[q.zone] || 0) + 1;
      const kinds = ['steil', 'mittel', 'auslauf'].filter((k) => (c[k] || 0) >= 4).length;
      const drop = p[0].z - p[p.length - 1].z;
      const score = kinds * 100 + drop - (c.rinne || 0) * 8;
      if (score > best.score) best = { dir: d, score };
    }
    return best.dir;
  }

  WB.terrain = {
    name: D.name,
    place: D.place,
    source: D.source,
    synthetic: false,
    SIZE, N, CELL, SUMMIT, TOP: maxH, THRESHOLDS,
    H, SLOPE, ASPECT, ACC, ZONE, ZONES, ZONE_ORDER,
    heightAt, idx, zoneAt, slopeAt, zoneStats, contours, profile, bestProfileDir,
    minH, maxH,
  };
})();
