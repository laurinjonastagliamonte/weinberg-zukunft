/*
 * Weinberge im Remstal
 * --------------------
 * Liste der Berge (Einzellagen nach Weinbergsrolle, Großlagen Kopf und Wartbühl, zu Bergen
 * zusammengefasst) und Lader für das Geländemodell.
 *
 * Korber Kopf: Höhen aus eurem STL-Modell (js/korber-kopf-data.js).
 * Alle anderen Berge: werden beim Öffnen im Browser gebaut –
 *   Höhen: AWS Terrain Tiles (Terrarium-Kacheln, Zoomstufe 15, Pixel ca. 3 m), 2 × 2 km, 10-m-Raster
 *   Ort:   OpenStreetMap (Wohn-, Gewerbe- und Industrieflächen) über die Overpass API
 * Das Ergebnis hat dasselbe Format wie korber-kopf-data.js und wird im Browser zwischengespeichert.
 *
 * Mittelpunkte: Schwerpunkt der Rebflächen (OpenStreetMap landuse=vineyard) am jeweiligen Hang.
 */
(function () {
  const WB = (window.WB = window.WB || {});
  const V = '20261124g'; // Version der Skripte (gegen alten Browser-Cache)

  const SITES = [
    { id: 'korber-kopf', ort: 'Korb', name: 'Korber Kopf', place: 'Korb, Rems-Murr-Kreis', lat: 48.8538, lon: 9.3672, stl: true,
      lagen: 'Korber Sommerhalde, Berg, Hörnle, Steingrüble · Kleinheppacher Greiner · Waiblinger Hörnle' },
    { id: 'heppach', ort: 'Groß- und Kleinheppach', name: 'Heppacher Berg', place: 'Weinstadt-Groß- und Kleinheppach', lat: 48.828, lon: 9.39,
      lagen: 'Großheppacher Steingrüble, Zügernberg, Wanne · Kleinheppacher Steingrüble, Sonnenberg' },
    { id: 'grunbach', ort: 'Grunbach', name: 'Grunbacher Berg', place: 'Remshalden-Grunbach', lat: 48.823, lon: 9.418,
      lagen: 'Grunbacher Berghalde, Klinge' },
    { id: 'geradstetten', ort: 'Geradstetten und Hebsack', name: 'Geradstetten / Hebsack', place: 'Remshalden', lat: 48.817, lon: 9.448,
      lagen: 'Geradstettener Sonnenberg, Lichtenberg · Hebsacker Lichtenberg' },
    { id: 'winterbach', ort: 'Winterbach', name: 'Hungerberg / Grafenberg', place: 'Winterbach und Schorndorf', lat: 48.813, lon: 9.498,
      lagen: 'Winterbacher Hungerberg · Schorndorfer Grafenberg' },
    { id: 'beutelsbach', ort: 'Beutelsbach und Schnait', name: 'Beutelsbach / Schnait', place: 'Weinstadt-Beutelsbach und -Schnait', lat: 48.795, lon: 9.41,
      lagen: 'Beutelsbacher Altenberg, Sonnenberg, Käppele · Schnaiter Altenberg, Sonnenberg' },
    { id: 'struempfelbach', ort: 'Strümpfelbach und Endersbach', name: 'Strümpfelbach / Endersbach', place: 'Weinstadt-Strümpfelbach und -Endersbach', lat: 48.789, lon: 9.368,
      lagen: 'Strümpfelbacher Gastenklinge, Nonnenberg · Endersbacher Wetzstein, Happenhalde' },
    { id: 'stetten', ort: 'Stetten', name: 'Stetten / Yburg', place: 'Kernen-Stetten und -Rommelshausen', lat: 48.787, lon: 9.345,
      lagen: 'Stettener Pulvermächer, Lindhälder, Brotwasser, Häder · Rommelshausener Häder' },
    { id: 'breuningsweiler', ort: 'Breuningsweiler und Hanweiler', name: 'Breuningsweiler / Hanweiler', place: 'Winnenden', lat: 48.853, lon: 9.408,
      lagen: 'Breuningsweiler Holzenberg, Haselstein · Hanweiler Maien, Berg · Winnender Roßberg' },
    { id: 'hertmannsweiler', ort: 'Hertmannsweiler und Bürg', name: 'Hertmannsweiler / Bürg', place: 'Winnenden', lat: 48.887, lon: 9.438,
      lagen: 'Hertmannsweiler und Baacher Himmelreich · Bürger Schlossberg' },
    { id: 'neustadt', ort: 'Neustadt und Beinstein', name: 'Söhrenberg / Großmulde', place: 'Waiblingen-Neustadt und -Beinstein', lat: 48.848, lon: 9.344,
      lagen: 'Neustädter Söhrenberg · Beinsteiner Großmulde' },
  ];

  const params = new URLSearchParams(location.search);
  const site = SITES.find((s) => s.id === params.get('berg')) || SITES[0];
  WB.SITES = SITES;
  WB.site = site;

  // ---------- Geländemodell bauen ----------
  const N = 201, SIZE = 2000, CELL = 10, Z = 15;
  const M_LAT = 111132;
  const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
  const grid = (s) => {
    // Rasterpunkt (i, j) -> lat/lon; Zeile 0 = Norden
    const ml = mLon(s.lat);
    return (i, j) => [s.lat - ((j - (N - 1) / 2) * CELL) / M_LAT, s.lon + ((i - (N - 1) / 2) * CELL) / ml];
  };
  const tileXY = (lat, lon) => {
    const n = 2 ** Z;
    const x = ((lon + 180) / 360) * n;
    const r = (lat * Math.PI) / 180;
    const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
    return [x, y];
  };

  async function heights(s, status) {
    const g = grid(s);
    const [x0, y0] = tileXY(...g(-3, -3));
    const [x1, y1] = tileXY(...g(N + 2, N + 2));
    const tx0 = Math.floor(x0), ty0 = Math.floor(y0), tx1 = Math.floor(x1), ty1 = Math.floor(y1);
    const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1;
    const cv = document.createElement('canvas');
    cv.width = nx * 256; cv.height = ny * 256;
    const c = cv.getContext('2d', { willReadFrequently: true });
    let done = 0;
    await Promise.all(
      [...Array(nx * ny)].map(async (_, k) => {
        const tx = tx0 + (k % nx), ty = ty0 + Math.floor(k / nx);
        const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
        if (!r.ok) throw new Error('Höhenkachel ' + r.status);
        const bmp = await createImageBitmap(await r.blob());
        c.drawImage(bmp, (tx - tx0) * 256, (ty - ty0) * 256);
        status(`Höhendaten ${++done} / ${nx * ny}`);
      })
    );
    const px = c.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width;
    const elev = (x, y) => {
      const o = (y * W + x) * 4;
      return px[o] * 256 + px[o + 1] + px[o + 2] / 256 - 32768;
    };
    const H = new Float64Array(N * N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const [tx, ty] = tileXY(...g(i, j));
        const fx = (tx - tx0) * 256 - 0.5, fy = (ty - ty0) * 256 - 0.5;
        const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
        H[j * N + i] =
          (elev(ix, iy) * (1 - ax) + elev(ix + 1, iy) * ax) * (1 - ay) +
          (elev(ix, iy + 1) * (1 - ax) + elev(ix + 1, iy + 1) * ax) * ay;
      }
    // leicht glätten (3 × 3), wie beim Korber Kopf
    const S = new Float64Array(N * N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        let a = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = i + di, jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
            a += H[jj * N + ii] * (di || dj ? 1 : 2); n += di || dj ? 1 : 2;
          }
        S[j * N + i] = a / n;
      }
    return S;
  }

  async function overpass(q) {
    const hosts = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let err;
    for (const h of hosts) {
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 45000);
        const r = await fetch(h, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctl.signal });
        clearTimeout(to);
        if (r.ok) return await r.json();
        err = new Error('Overpass ' + r.status);
      } catch (e) { err = e; }
    }
    throw err;
  }

  async function town(s, status) {
    status('Ortsflächen aus OpenStreetMap');
    const g = grid(s);
    const [n, w] = g(-2, -2), [so, e] = g(N + 1, N + 1);
    const bb = `${so},${w},${n},${e}`;
    const j = await overpass(
      `[out:json][timeout:50];(way["landuse"~"^(residential|commercial|industrial|retail)$"](${bb});` +
        `relation["landuse"~"^(residential|commercial|industrial|retail)$"](${bb}););out geom;`
    );
    const ml = mLon(s.lat);
    const toIJ = (p) => [(p.lon - s.lon) * ml / CELL + (N - 1) / 2, (s.lat - p.lat) * M_LAT / CELL + (N - 1) / 2];
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.fillStyle = c.strokeStyle = '#000';
    const poly = (geom) => {
      c.beginPath();
      geom.forEach((p, k) => { const [x, y] = toIJ(p); k ? c.lineTo(x + 0.5, y + 0.5) : c.moveTo(x + 0.5, y + 0.5); });
      c.closePath();
    };
    const area = (geom) => {
      let a = 0;
      for (let k = 0; k < geom.length; k++) {
        const p = geom[k], q = geom[(k + 1) % geom.length];
        a += (p.lon * ml) * (q.lat * M_LAT) - (q.lon * ml) * (p.lat * M_LAT);
      }
      return Math.abs(a / 2);
    };
    for (const el of j.elements) {
      const isB = el.tags && el.tags.building;
      const rings = el.type === 'relation' ? (el.members || []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry) : el.geometry ? [el.geometry] : [];
      for (const r of rings) {
        if (r.length < 3) continue;
        if (isB) {
          if (area(r) < 60) continue; // Weinberghäuschen und Schuppen zählen nicht als Ort
          poly(r); c.fill(); c.lineWidth = 2; c.stroke();
        } else { poly(r); c.fill(); }
      }
    }
    const px = c.getImageData(0, 0, N, N).data;
    const T = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) T[k] = px[k * 4 + 3] > 100 ? 1 : 0;
    // kleine Inseln (Aussiedlerhof, Hütte) entfernen
    const seen = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) {
      if (!T[k] || seen[k]) continue;
      const comp = [k]; seen[k] = 1;
      for (let q = 0; q < comp.length; q++) {
        const a = comp[q], i = a % N, jj = (a / N) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di, j2 = jj + dj;
          if (ii < 0 || j2 < 0 || ii >= N || j2 >= N) continue;
          const b = j2 * N + ii;
          if (T[b] && !seen[b]) { seen[b] = 1; comp.push(b); }
        }
      }
      if (comp.length < 40) comp.forEach((b) => (T[b] = 0));
    }
    return T;
  }

  const b64 = (u8) => {
    let s = '';
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
    return btoa(s);
  };

  // Ortsmaske als Lauflängen: abwechselnd Anzahl Zellen „kein Ort“ / „Ort“, Basis 36, durch Punkte getrennt
  const rleEncode = (T) => {
    const out = [];
    let cur = 0, n = 0;
    for (let k = 0; k < T.length; k++) {
      if (T[k] === cur) n++;
      else { out.push(n.toString(36)); cur = T[k]; n = 1; }
    }
    out.push(n.toString(36));
    return out.join('.');
  };
  const rleDecode = (str) => {
    const T = new Uint8Array(N * N);
    let k = 0, cur = 0;
    for (const part of str.split('.')) {
      const n = parseInt(part, 36);
      if (cur) T.fill(1, k, k + n);
      k += n; cur ^= 1;
    }
    return T;
  };

  async function build(s, status) {
    const H = await heights(s, status);
    let tw = null, townNote = 'Ort aus OpenStreetMap';
    if (s.town) tw = rleDecode(s.town); // vorab aus OpenStreetMap berechnet (Stand 24.11.2026)
    else {
      try { tw = await town(s, status); } catch (e) { townNote = 'Ort konnte nicht geladen werden (OpenStreetMap nicht erreichbar)'; }
    }
    let min = Infinity;
    for (const h of H) min = Math.min(min, h);
    const baseDm = Math.floor(min * 10) - 10;
    const raw = new Uint8Array(N * N * 2);
    for (let k = 0; k < N * N; k++) {
      const v = Math.max(0, Math.min(65535, Math.round(H[k] * 10 - baseDm)));
      raw[2 * k] = v & 255; raw[2 * k + 1] = v >> 8;
    }
    let town64 = null;
    if (tw) {
      const bits = new Uint8Array(Math.ceil((N * N) / 8));
      for (let k = 0; k < N * N; k++) if (tw[k]) bits[k >> 3] |= 1 << (7 - (k & 7));
      town64 = b64(bits);
    }
    return {
      name: s.name,
      place: s.place,
      source: `Höhen: AWS Terrain Tiles (Terrarium, Zoom 15) · ${townNote}`,
      size: SIZE, n: N, baseDm, data: b64(raw), town: town64,
      summitR: 650, // Gipfel = höchster Punkt nahe der Rebfläche, nicht am Ausschnittrand
    };
  }

  // ---------- Start ----------
  const SCRIPTS = ['terrain', 'data', 'weather', 'plants', 'render3d', 'sim3d', 'cover', 'stl', 'main'];
  function loadScripts() {
    return SCRIPTS.reduce(
      (p, n) => p.then(() => new Promise((ok, no) => {
        const el = document.createElement('script');
        el.src = `js/${n}.js?v=${V}`;
        el.onload = ok; el.onerror = no;
        document.body.appendChild(el);
      })),
      Promise.resolve()
    );
  }

  async function boot() {
    if (!site.stl) {
      const key = `wb-site-${V}-${site.id}`;
      let D = null;
      try { D = JSON.parse(localStorage.getItem(key)); } catch (e) {}
      if (!D || D.n !== N) {
        const ov = document.createElement('div');
        ov.className = 'site-loading';
        ov.innerHTML = `<strong>${site.name}</strong><span>Geländemodell wird gebaut …</span><small>beim ersten Öffnen bis zu einer Minute, danach sofort</small>`;
        document.body.appendChild(ov);
        const status = (t) => (ov.querySelector('span').textContent = t + ' …');
        try {
          D = await build(site, status);
          try { localStorage.setItem(key, JSON.stringify(D)); } catch (e) {}
        } catch (e) {
          ov.innerHTML = `<strong>${site.name}</strong><span>Höhendaten konnten nicht geladen werden (${e.message}). <a href="?">Zurück zum Korber Kopf</a></span>`;
          return;
        }
        ov.remove();
      }
      WB.terrainData = D;
    }
    await loadScripts();
  }
  WB.siteTools = { town: (s) => town(s, () => {}), rleEncode };
  boot();
})();
