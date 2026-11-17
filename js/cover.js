/*
 * Hintergrund der Titelseite: Draufsicht auf den Korber Kopf als Zeichenraster
 * (Moodboard „Punktraster-Karte“). Eine schräge Linie fährt langsam darüber:
 * davor der Berg heute, dahinter mit Konzept (Keylines, Mulden, Wald) – „er wandelt sich“.
 * Das Raster füllt nur gut 2/3 der Fläche und läuft links schräg weich aus.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  const INK = '#111111';
  const BLUE = '#2433F0';

  // Zeichen je Rasterzelle
  function glyph(c, kind, x, y, s, ang = 0) {
    const m = s / 2;
    c.beginPath();
    switch (kind) {
      case 'hatch': // flach: feine Schraffur
        c.strokeStyle = 'rgba(17,17,17,0.35)';
        c.lineWidth = 0.7;
        c.moveTo(x - m * 0.8, y - m * 0.8);
        c.lineTo(x + m * 0.8, y + m * 0.8);
        c.stroke();
        break;
      case 'cross': // leicht geneigt
        c.strokeStyle = 'rgba(17,17,17,0.5)';
        c.lineWidth = 0.7;
        c.moveTo(x - m * 0.5, y - m * 0.5);
        c.lineTo(x + m * 0.5, y + m * 0.5);
        c.moveTo(x + m * 0.5, y - m * 0.5);
        c.lineTo(x - m * 0.5, y + m * 0.5);
        c.stroke();
        break;
      case 'tri': // Mittelhang
        c.fillStyle = INK;
        c.moveTo(x, y - m * 0.55);
        c.lineTo(x + m * 0.5, y + m * 0.45);
        c.lineTo(x - m * 0.5, y + m * 0.45);
        c.fill();
        break;
      case 'dome': // steil: volle Form
        c.fillStyle = INK;
        c.arc(x, y + m * 0.1, m * 0.62, Math.PI, 0);
        c.lineTo(x + m * 0.62, y + m * 0.55);
        c.lineTo(x - m * 0.62, y + m * 0.55);
        c.fill();
        break;
      case 'ring': // Baum
        c.strokeStyle = INK;
        c.lineWidth = 1.2;
        c.arc(x, y, m * 0.42, 0, Math.PI * 2);
        c.stroke();
        break;
      case 'dot': // Ort
        c.fillStyle = 'rgba(17,17,17,0.25)';
        c.fillRect(x - 1, y - 1, 2, 2);
        break;
      case 'wall': // Wall + Mulde entlang der Höhenlinie (blau)
        c.strokeStyle = BLUE;
        c.lineWidth = 1.8;
        c.moveTo(x - Math.cos(ang) * m, y - Math.sin(ang) * m);
        c.lineTo(x + Math.cos(ang) * m, y + Math.sin(ang) * m);
        c.stroke();
        break;
    }
  }

  function startCover(canvas, terrain) {
    const ctx = canvas.getContext('2d');
    const T = terrain;
    let w = 0, h = 0, dpr = 1, raf = null;
    const t0 = performance.now();
    let today = null, future = null;

    function build() {
      const cell = 11;
      const size = Math.max(h * 1.35, w * 0.75); // 2000 m auf so viele Pixel
      const ox = w * 0.66 - (T.SUMMIT.x / T.SIZE) * size;
      const oy = h * 0.5 - (T.SUMMIT.y / T.SIZE) * size;
      const mk = () => {
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        const c = cv.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        return [cv, c];
      };
      const [a, ca] = mk();
      const [b, cb] = mk();
      const metersPerCell = (cell / size) * T.SIZE;
      for (let py = cell / 2; py < h; py += cell)
        for (let px = cell / 2; px < w; px += cell) {
          const x = ((px - ox) / size) * T.SIZE;
          const y = ((py - oy) / size) * T.SIZE;
          if (x < 0 || y < 0 || x > T.SIZE || y > T.SIZE) continue;
          const zone = T.zoneAt(x, y);
          const slope = T.slopeAt(x, y);
          // heute
          let k = slope < 8 ? 'hatch' : slope < 18 ? 'cross' : slope < 30 ? 'tri' : 'dome';
          if (zone === 'ort') k = 'dot';
          glyph(ca, k, px, py, cell);
          // mit Konzept
          let f = k;
          if (zone === 'kuppe') f = (Math.floor(px / cell) + Math.floor(py / cell)) % 2 ? 'ring' : 'hatch';
          if (zone === 'mittel' || zone === 'auslauf') {
            const dh = T.KEY_DH[zone];
            const z = T.heightAt(x, y);
            const tol = Math.max(0.5, (slope / 100) * metersPerCell * 0.55);
            const r = ((z % dh) + dh) % dh;
            if (r < tol || dh - r < tol) {
              const e = 5;
              const gx = T.heightAt(x + e, y) - T.heightAt(x - e, y);
              const gy = T.heightAt(x, y + e) - T.heightAt(x, y - e);
              glyph(cb, 'wall', px, py, cell, Math.atan2(gx, -gy)); // entlang der Höhenlinie
              continue;
            }
            f = zone === 'mittel' ? 'tri' : 'hatch';
          }
          glyph(cb, f, px, py, cell);
        }
      today = a;
      future = b;
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      build();
    }

    function frame(now) {
      const time = (now - t0) / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Wandel hin und zurück (ca. 18 s)
      const s = 0.5 - 0.5 * Math.cos((time / 18) * Math.PI * 2);
      const tilt = 0.35 * h; // schräge Front
      const fx = w * 0.3 + s * (w * 0.8);
      ctx.drawImage(today, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo((fx + tilt) * dpr, 0);
      ctx.lineTo((fx - tilt) * dpr, h * dpr);
      ctx.lineTo(0, h * dpr);
      ctx.closePath();
      ctx.clip();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(future, 0, 0);
      ctx.restore();
      // Front als feine blaue Linie
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.moveTo((fx + tilt) * dpr, 0);
      ctx.lineTo((fx - tilt) * dpr, h * dpr);
      ctx.stroke();
      // nur gut 2/3 der Fläche: links schräg weich ausblenden
      ctx.globalCompositeOperation = 'destination-in';
      const g = ctx.createLinearGradient(w * 0.36 * dpr, h * 0.2 * dpr, w * 0.56 * dpr, h * 0.45 * dpr);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);
    return {
      stop() {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
      },
      start() {
        if (!raf) raf = requestAnimationFrame(frame);
      },
    };
  }

  WB.startCover = startCover;
})();
