/*
 * Gelände-Modell
 * --------------
 * Lädt das Höhenraster aus js/korber-kopf-data.js (aus eurem STL-Modell) und berechnet:
 * Hangneigung, Hangrichtung, Fließwege (Muldenlinien), Zonen, Höhenlinien, Keylines und das Hangprofil.
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
    rinneArea: 1.5, // natürliche Tiefenlinie: ab 1,5 ha Einzugsgebiet (nur intern, Ziel des Leitens)
  };

  // ---- Keylines nach Konzept Melissa ----
  // Echte Abstände: Steilgürtel Rinnen alle 3,5 m, Mittelhang Mulden alle 5 m (1 m breit),
  // Auslauf Mulden alle 8 m (1,5 m breit). Auf 2 km wären die nicht zu sehen, deshalb gibt
  // `vis` den dargestellten Abstand im Gelände an (m): oben eng, nach unten deutlich weiter.
  const KEYLINE = {
    steil: { spacing: 3.5, muldeWidth: 0, vis: 32, visMulde: 0 },
    mittel: { spacing: 5, muldeWidth: 1, vis: 58, visMulde: 9 },
    auslauf: { spacing: 8, muldeWidth: 1.5, vis: 95, visMulde: 15 },
  };
  const VIS = KEYLINE.mittel.vis / KEYLINE.mittel.spacing; // nur für Kammerlänge (Querriegel)

  // ---- Muldengraben mit versetzten Öffnungen (Skizze Laurin) ----
  // Jeder Damm hat alle 100 m eine Öffnung; von Damm zu Damm sind die Öffnungen um 50 m versetzt.
  // Wasser läuft in der Mulde seitlich bis zur nächsten Öffnung, fällt eine Stufe tiefer und
  // läuft wieder seitlich – ein eckiger Zickzack, der das Wasser bremst.
  const OPENING = { spacing: 100, shift: 50, gap: 14 };

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
  const TOWN = new Uint8Array(N * N);
  if (D.town) {
    const tb = atob(D.town);
    for (let k = 0; k < N * N; k++) TOWN[k] = (tb.charCodeAt(k >> 3) >> (7 - (k & 7))) & 1;
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
    kuppe: { key: 'kuppe', name: 'Kuppe', sub: 'Schwammkuppe', range: 'fast eben', water: 'viel Wasser in den Boden', color: '#D9D9D9' },
    steil: { key: 'steil', name: 'Steilgürtel', sub: 'Leithang', range: 'über 30 %', water: 'Wasser leiten', color: '#FFFFFF' },
    mittel: { key: 'mittel', name: 'Mittelhang', sub: '', range: '18–30 %', water: 'bremsen & versickern', color: '#A8A8A8' },
    auslauf: { key: 'auslauf', name: 'Auslauf & Hangfuß', sub: '', range: 'unter 18 %', water: 'versickern lassen', color: '#5C5C5C' },
    ort: { key: 'ort', name: 'Ort', sub: 'Korb', range: 'bebaut', water: 'wird durch das Konzept geschützt', color: '#2E2E2E' },
  };
  const ZONE_ORDER = ['kuppe', 'steil', 'mittel', 'auslauf', 'ort'];

  const ZONE = new Array(N * N);
  for (let k = 0; k < N * N; k++) {
    const s = SLOPE[k];
    if (TOWN[k]) ZONE[k] = 'ort';
    else if (H[k] >= maxH - THRESHOLDS.kuppeDrop && s < THRESHOLDS.mittel) ZONE[k] = 'kuppe';
    else if (s >= THRESHOLDS.steil) ZONE[k] = 'steil';
    else if (s >= THRESHOLDS.mittel) ZONE[k] = 'mittel';
    else ZONE[k] = 'auslauf';
  }
  const cellAt = (x, y) => idx(clampI(Math.round(x / CELL)), clampI(Math.round(y / CELL)));
  const zoneAt = (x, y) => ZONE[cellAt(x, y)];
  const slopeAt = (x, y) => SLOPE[cellAt(x, y)];

  // ---- Bewirtschaftungsgebiet: der Berg selbst, nicht die Landschaft drumherum ----
  // bis AREA_R um den Gipfel und mit Abstand zum Ort (keine Pflanzung zwischen Häusern)
  const AREA_R = 720;
  const TOWN_GAP = 60;
  const AREA = new Uint8Array(N * N);
  {
    const gap = Math.ceil(TOWN_GAP / CELL);
    const near = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) {
      if (!TOWN[k]) continue;
      const i0 = k % N, j0 = Math.floor(k / N);
      for (let dj = -gap; dj <= gap; dj++)
        for (let di = -gap; di <= gap; di++) {
          const i = i0 + di, j = j0 + dj;
          if (i >= 0 && j >= 0 && i < N && j < N && di * di + dj * dj <= gap * gap) near[idx(i, j)] = 1;
        }
    }
    for (let k = 0; k < N * N; k++) {
      const d = Math.hypot((k % N) * CELL - SUMMIT.x, Math.floor(k / N) * CELL - SUMMIT.y);
      AREA[k] = d <= AREA_R && !near[k] ? 1 : 0;
    }
  }

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
  function contours(step, from) {
    const segs = [];
    const start = from !== undefined ? from : Math.ceil(minH / step) * step;
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

  // ---- Keylines je Zone: Höhenabstand so gewählt, dass der Abstand im Gelände passt ----
  const zoneSlope = {};
  for (const z of Object.keys(KEYLINE)) {
    const v = [];
    for (let k = 0; k < N * N; k++) if (ZONE[k] === z) v.push(SLOPE[k]);
    v.sort((a, b) => a - b);
    zoneSlope[z] = (v[Math.floor(v.length / 2)] || 10) / 100;
  }
  const KEY_DH = {}; // Höhenabstand der Linien je Zone (m)
  for (const [z, c] of Object.entries(KEYLINE)) KEY_DH[z] = c.vis * zoneSlope[z];

  let keyCache = null;
  function keylines() {
    if (keyCache) return keyCache;
    const out = [];
    for (const [z, c] of Object.entries(KEYLINE)) {
      const dh = KEY_DH[z];
      const walls = contours(dh, Math.ceil(minH / dh) * dh);
      // Mulde liegt hangaufwärts direkt hinter dem Wall
      const md = c.visMulde ? c.visMulde * zoneSlope[z] : 0;
      const mulden = md ? contours(dh, Math.ceil(minH / dh) * dh + md) : [];
      const keep = (list) =>
        list.map((l) => ({
          level: l.level,
          segments: l.segments.filter(([a, b]) => zoneAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) === z),
        }));
      out.push({ zone: z, dh, walls: keep(walls), mulden: keep(mulden) });
    }
    keyCache = out;
    return out;
  }

  // ---- Abstand zur nächsten Muldenlinie (für das Leiten im Steilgürtel) ----
  const DIST = new Float64Array(N * N).fill(Infinity);
  {
    const q = [];
    for (let k = 0; k < N * N; k++) if (ACC[k] >= rinneCells && !TOWN[k]) { DIST[k] = 0; q.push(k); }
    // einfache Dijkstra-Näherung (Breitensuche mit Nachbarn, mehrere Durchgänge)
    let head = 0;
    while (head < q.length) {
      const k = q[head++];
      const i = k % N, j = Math.floor(k / N);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const kk = idx(ii, jj);
          const d = DIST[k] + Math.hypot(di, dj) * CELL;
          if (d < DIST[kk]) { DIST[kk] = d; q.push(kk); }
        }
    }
  }
  const distAt = (x, y) => DIST[cellAt(x, y)];

  // Richtung, in die eine Rinne im Steilgürtel das Wasser leitet: quer zum Hang, zur Muldenlinie hin
  function leadDir(x, y, gx, gy) {
    const g = Math.hypot(gx, gy) || 1;
    let tx = -gy / g, ty = gx / g; // entlang der Höhenlinie
    const e = CELL * 1.5;
    if (distAt(x + tx * e, y + ty * e) > distAt(x - tx * e, y - ty * e)) { tx = -tx; ty = -ty; }
    // leicht hangabwärts geneigt, damit das Wasser fließt
    const dx = tx * 0.85 - (gx / g) * 0.45;
    const dy = ty * 0.85 - (gy / g) * 0.45;
    const l = Math.hypot(dx, dy);
    return [dx / l, dy / l];
  }

  // ---- Problemzonen aus dem Relief (keine Messdaten, sondern Geländelage) ----
  // Frost:       Senken und Tallagen, in denen sich Kaltluft sammelt
  // Trockenheit: steile, nach Süden bis Westen geneigte, gewölbte Hänge (viel Sonne, schneller Abfluss)
  // Feuchte:     flache Stellen mit großem Einzugsgebiet (Staunässe, Wasser sammelt sich)
  // Wind:        exponierte Kuppen und Rücken
  const PROBLEM_BITS = { frost: 1, trocken: 2, feucht: 4, wind: 8 };
  const PROBLEMS = {
    frost: { key: 'frost', name: 'Frost', why: 'Senken und Tallagen, Kaltluft sammelt sich', color: '#9FE0FF' },
    trocken: { key: 'trocken', name: 'Trockenheit', why: 'steile Süd- bis Westhänge, viel Sonne, schneller Abfluss', color: '#F1E62B' },
    feucht: { key: 'feucht', name: 'Feuchte', why: 'flach mit großem Einzugsgebiet, Staunässe', color: '#2433F0' },
    wind: { key: 'wind', name: 'Wind', why: 'exponierte Kuppen und Rücken', color: '#E5402A' },
  };
  const PROBLEM = new Uint8Array(N * N);
  {
    // Mittelwert der Höhe im Umkreis (Summen-Tabelle)
    const S = new Float64Array((N + 1) * (N + 1));
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++)
        S[(j + 1) * (N + 1) + i + 1] = H[idx(i, j)] + S[j * (N + 1) + i + 1] + S[(j + 1) * (N + 1) + i] - S[j * (N + 1) + i];
    const mean = (i, j, r) => {
      const i0 = Math.max(0, i - r), i1 = Math.min(N - 1, i + r), j0 = Math.max(0, j - r), j1 = Math.min(N - 1, j + r);
      const sum = S[(j1 + 1) * (N + 1) + i1 + 1] - S[j0 * (N + 1) + i1 + 1] - S[(j1 + 1) * (N + 1) + i0] + S[j0 * (N + 1) + i0];
      return sum / ((i1 - i0 + 1) * (j1 - j0 + 1));
    };
    const r150 = Math.round(150 / CELL), r300 = Math.round(300 / CELL);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = idx(i, j);
        if (TOWN[k]) continue;
        const tpi150 = H[k] - mean(i, j, r150);
        const tpi300 = H[k] - mean(i, j, r300);
        const s = SLOPE[k];
        const asp = ASPECT[k];
        const twi = Math.log((ACC[k] * CELL) / Math.max(s / 100, 0.01));
        let m = 0;
        if (tpi300 < -6 && s < 10) m |= PROBLEM_BITS.frost;
        if (s >= 18 && asp >= 135 && asp <= 270 && tpi150 > 0) m |= PROBLEM_BITS.trocken;
        if (twi > 9.3 && s < 10) m |= PROBLEM_BITS.feucht;
        if (tpi300 > 6 && H[k] > minH + 0.55 * (maxH - minH)) m |= PROBLEM_BITS.wind;
        PROBLEM[k] = m;
      }
  }
  function problemStats(zoneKey) {
    const out = {};
    let total = 0;
    for (const p of Object.keys(PROBLEMS)) out[p] = 0;
    for (let k = 0; k < N * N; k++) {
      if (ZONE[k] === 'ort') continue;
      if (zoneKey && ZONE[k] !== zoneKey) continue;
      total++;
      for (const [p, bit] of Object.entries(PROBLEM_BITS)) if (PROBLEM[k] & bit) out[p]++;
    }
    return Object.values(PROBLEMS).map((p) => ({
      ...p,
      share: total ? out[p.key] / total : 0,
      ha: (out[p.key] * CELL * CELL) / 10000,
    }));
  }

  // ---- Weg des Wassers durch das Leit-/Muldensystem (für die blauen Linien) ----
  // Von oben am Hang aus: im Steilgürtel quer geleitet, darunter hangabwärts von Wall zu Wall.
  // An jedem Wall steht eine Mulde; die erste nimmt das Wasser auf, danach zeigt die Linie
  // gestrichelt, wohin es über den Überlauf liefe, wenn die Mulden voll sind.
  let pathCache = null;
  function waterPaths(count = 9) {
    if (pathCache) return pathCache;
    const paths = [];
    const step = 4;
    for (let n = 0; n < count; n++) {
      const ang = (n / count) * Math.PI * 2 + 0.3;
      // Startpunkt: vom Gipfel nach außen bis zum Rand der Kuppe
      let sx = SUMMIT.x, sy = SUMMIT.y;
      for (let r = 0; r < 600; r += 4) {
        sx = SUMMIT.x + Math.cos(ang) * r;
        sy = SUMMIT.y + Math.sin(ang) * r;
        const z = zoneAt(sx, sy);
        if (z !== 'kuppe') break;
      }
      let x = sx, y = sy;
      const pts = [[x, y, heightAt(x, y)]];
      const mulden = [];
      let firstMulde = -1;
      let led = 0;
      for (let it = 0; it < 900; it++) {
        if (x < 0 || y < 0 || x > SIZE || y > SIZE) break;
        const zone = zoneAt(x, y);
        if (zone === 'ort') break;
        const e = 4;
        const gx = (heightAt(x + e, y) - heightAt(x - e, y)) / (2 * e);
        const gy = (heightAt(x, y + e) - heightAt(x, y - e)) / (2 * e);
        const g = Math.hypot(gx, gy);
        if (g < 0.006) break; // Senke: Wasser bleibt und versickert
        let dx = -gx / g, dy = -gy / g;
        if (zone === 'steil' && led < 90) { [dx, dy] = leadDir(x, y, gx, gy); led += step; }
        const h0 = heightAt(x, y);
        x += dx * step;
        y += dy * step;
        const h1 = heightAt(x, y);
        pts.push([x, y, h1]);
        const dh = KEY_DH[zone];
        if ((zone === 'mittel' || zone === 'auslauf') && dh && Math.floor(h1 / dh) < Math.floor(h0 / dh)) {
          mulden.push([x, y, h1]);
          if (firstMulde < 0) firstMulde = pts.length - 1;
        }
      }
      if (pts.length > 15) paths.push({ pts, mulden, firstMulde });
    }
    pathCache = paths;
    return paths;
  }

  // ---- Becken am Hangfuß: flache Sammelstellen im Auslauf ----
  const BECKEN = [];
  {
    const minAcc = (0.6 * 10000) / (CELL * CELL);
    for (let j = 2; j < N - 2; j += 3)
      for (let i = 2; i < N - 2; i += 3) {
        const k = idx(i, j);
        if (ZONE[k] !== 'auslauf' || SLOPE[k] > 8 || ACC[k] < minAcc) continue;
        if (H[k] > minH + 0.35 * (maxH - minH)) continue; // nur unten am Hangfuß
        // nicht zu dicht beieinander
        if (BECKEN.some((b) => Math.hypot(b.x - i * CELL, b.y - j * CELL) < 140)) continue;
        BECKEN.push({ x: i * CELL, y: j * CELL, k });
      }
  }

  // Lage entlang eines Damms: Bogenlänge um den Gipfel (m). `line` = Nummer des Damms.
  function alongS(x, y) {
    const dx = x - SUMMIT.x, dy = y - SUMMIT.y;
    return Math.atan2(dy, dx) * Math.hypot(dx, dy);
  }
  // Öffnung am Damm? und in welche Richtung (+1 / -1 entlang s) liegt die nächste
  function opening(x, y, line) {
    const off = ((line % 2) + 2) % 2 * OPENING.shift;
    const s = alongS(x, y);
    const d = ((s - off) % OPENING.spacing + OPENING.spacing) % OPENING.spacing; // 0..100
    const dist = Math.min(d, OPENING.spacing - d);
    return { open: dist < OPENING.gap / 2, dir: d > OPENING.spacing / 2 ? 1 : -1, dist };
  }
  // Richtung entlang des Damms (Höhenlinie), so dass s in Richtung `sign` wächst
  function alongDir(x, y, gx, gy, sign) {
    const dx = x - SUMMIT.x, dy = y - SUMMIT.y;
    const r = Math.hypot(dx, dy) || 1;
    let tx = -dy / r, ty = dx / r; // Richtung wachsendes s (Winkel)
    const g = Math.hypot(gx, gy) || 1;
    const nx = gx / g, ny = gy / g;
    const dot = tx * nx + ty * ny; // Anteil hangauf/-ab entfernen
    tx -= dot * nx;
    ty -= dot * ny;
    const l = Math.hypot(tx, ty) || 1;
    return [(tx / l) * sign, (ty / l) * sign];
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
      const score = kinds * 100 + drop;
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
    TOWN, AREA, AREA_R, DIST, BECKEN, KEYLINE, KEY_DH, VIS, OPENING, alongS, opening, alongDir, PROBLEM, PROBLEMS, PROBLEM_BITS, problemStats,
    heightAt, idx, zoneAt, slopeAt, distAt, leadDir, keylines, waterPaths, zoneStats, contours, profile, bestProfileDir,
    minH, maxH,
  };
})();
