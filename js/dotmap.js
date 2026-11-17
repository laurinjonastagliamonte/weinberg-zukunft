/*
 * Draufsicht als Punktraster (Moodboard: Punktraster-Karte).
 * Punktgröße = Schattierung des Geländes (Licht aus Nordwest).
 */
(function () {
  const WB = (window.WB = window.WB || {});

  function drawDotMap(canvas, terrain, opts = {}) {
    const ctx = canvas.getContext('2d');
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const T = terrain;
    const gap = opts.gap || 9;
    // Berg rechts neben dem Suchpanel platzieren
    const size = Math.max(h * 1.15, w * 0.6);
    const ox = w * (w > 900 ? 0.7 : 0.5) - (T.SUMMIT.x / T.SIZE) * size;
    const oy = h * 0.48 - (T.SUMMIT.y / T.SIZE) * size;
    // Lichtrichtung Nordwest, von oben
    const L = [-0.5, -0.5, 0.7];
    const len = Math.hypot(...L);
    const lx = L[0] / len, ly = L[1] / len, lz = L[2] / len;
    const e = 6;

    for (let py = gap / 2; py < h; py += gap) {
      for (let px = gap / 2; px < w; px += gap) {
        const x = ((px - ox) / size) * T.SIZE;
        const y = ((py - oy) / size) * T.SIZE;
        if (x < 0 || y < 0 || x > T.SIZE || y > T.SIZE) continue;
        const dzdx = (T.heightAt(x + e, y) - T.heightAt(x - e, y)) / (2 * e);
        const dzdy = (T.heightAt(x, y + e) - T.heightAt(x, y - e)) / (2 * e);
        // Normale (x Ost, y Süd, z oben)
        const nl = Math.hypot(dzdx * 2.2, dzdy * 2.2, 1);
        const nx = -dzdx * 2.2 / nl, ny = -dzdy * 2.2 / nl, nz = 1 / nl;
        const light = Math.max(0, nx * lx + ny * ly + nz * lz);
        // eben = kleiner Punkt, vom Licht abgewandt = großer Punkt
        let dark = Math.min(1, Math.max(0, (lz - light) * 2.4 + 0.12));
        // Höhenlinien alle 20 m leicht betonen
        const z = T.heightAt(x, y);
        const m = Math.abs(((z % 20) + 20) % 20 - 10) / 10; // 1 = auf der 20-m-Linie
        if (m > 0.93) dark = Math.max(dark, 0.42);
        const rad = Math.max(0.5, Math.min(gap * 0.48, dark * gap * 0.5));
        ctx.fillStyle = opts.color || '#111';
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (opts.marker) {
      const mx = ox + (T.SUMMIT.x / T.SIZE) * size;
      const my = oy + (T.SUMMIT.y / T.SIZE) * size;
      ctx.fillStyle = '#F1E62B';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  WB.drawDotMap = drawDotMap;
})();
