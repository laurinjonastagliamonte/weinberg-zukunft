/*
 * 3D-Modell zum Herunterladen (STL, binär)
 * ----------------------------------------
 * Wie euer Korber-Kopf-Modell: Maßstab 1:4000 in Lage UND Höhe (unverzerrt),
 * 2 × 2 km → 500 × 500 mm, mit 5 mm Sockel unter dem tiefsten Punkt. Einheit: Millimeter.
 */
(function () {
  const WB = window.WB;

  function buildSTL(T, scale = 4000, base = 5) {
    const N = T.N, H = T.H;
    const f = 1000 / scale; // mm pro m
    const z0 = T.minH;
    const P = (i, j) => [i * T.CELL * f, (N - 1 - j) * T.CELL * f, (H[j * N + i] - z0) * f + base]; // y nach Norden
    const tris = [];
    const quad = (a, b, c, d) => { tris.push([a, b, c], [a, c, d]); };
    // Oberfläche
    for (let j = 0; j < N - 1; j++)
      for (let i = 0; i < N - 1; i++) quad(P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), P(i, j));
    // Seitenwände und Boden
    const B = ([x, y]) => [x, y, 0];
    for (let k = 0; k < N - 1; k++) {
      let a = P(k, 0), b = P(k + 1, 0); quad(B(a), a, b, B(b)); // Nord
      a = P(k + 1, N - 1); b = P(k, N - 1); quad(B(a), a, b, B(b)); // Süd
      a = P(0, k + 1); b = P(0, k); quad(B(a), a, b, B(b)); // West
      a = P(N - 1, k); b = P(N - 1, k + 1); quad(B(a), a, b, B(b)); // Ost
    }
    // Boden als Fächer um die Mitte, mit denselben Randpunkten wie die Wände (wasserdicht)
    const L = (N - 1) * T.CELL * f;
    const ring = [];
    for (let k = 0; k < N - 1; k++) ring.push(B(P(k, 0)));
    for (let k = 0; k < N - 1; k++) ring.push(B(P(N - 1, k)));
    for (let k = N - 1; k > 0; k--) ring.push(B(P(k, N - 1)));
    for (let k = N - 1; k > 0; k--) ring.push(B(P(0, k)));
    const M = [L / 2, L / 2, 0];
    for (let k = 0; k < ring.length; k++) tris.push([M, ring[k], ring[(k + 1) % ring.length]]);

    const buf = new ArrayBuffer(84 + tris.length * 50);
    const dv = new DataView(buf);
    const head = `${T.name} 1:${scale} - Weinberg Zukunft`;
    for (let k = 0; k < Math.min(80, head.length); k++) dv.setUint8(k, head.charCodeAt(k) & 127);
    dv.setUint32(80, tris.length, true);
    let o = 84;
    for (const [a, b, c] of tris) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n) || 1;
      n = n.map((x) => x / l);
      for (const x of [...n, ...a, ...b, ...c]) { dv.setFloat32(o, x, true); o += 4; }
      o += 2;
    }
    return { blob: new Blob([buf], { type: 'model/stl' }), tris: tris.length, sizeMm: L, heightMm: (T.maxH - z0) * f + base };
  }

  function downloadSTL(T) {
    const r = buildSTL(T);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.blob);
    a.download = `${(WB.site && WB.site.id) || 'berg'}_1zu4000.stl`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return r;
  }

  WB.stl = { buildSTL, downloadSTL };
})();
