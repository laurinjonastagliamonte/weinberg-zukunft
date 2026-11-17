/*
 * Hintergrund der Titelseite: animierte Linienwellen (Moodboard „Wellen-Grafik“).
 * Jede Linie ist ein echter Schnitt durch den Korber Kopf. Die Schnittrichtung dreht sich
 * langsam, dadurch „atmen“ die Wellen. Schwarze Linien auf Weiß.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  function startCover(canvas, terrain) {
    const ctx = canvas.getContext('2d');
    const T = terrain;
    let w = 0, h = 0, dpr = 1, raf = null, t0 = performance.now();

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    // Höhe entlang eines Schnitts durch den Gipfel, Wert 0..1
    const range = T.maxH - T.minH;
    // Schnitt in Richtung `angle`, parallel versetzt um `off` Meter
    function section(angle, off, u) {
      const r = (u - 0.5) * 1900;
      const x = T.SUMMIT.x + Math.cos(angle) * r - Math.sin(angle) * off;
      const y = T.SUMMIT.y + Math.sin(angle) * r + Math.cos(angle) * off;
      return (T.heightAt(x, y) - T.minH) / range;
    }

    const BANDS = 3;
    const LINES = 34;
    const SAMPLES = 120;

    function frame(now) {
      const time = (now - t0) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 0.7;
      for (let b = 0; b < BANDS; b++) {
        const base = h * (0.2 + b * 0.31);
        const amp = h * 0.3;
        for (let l = 0; l < LINES; l++) {
          const ang = time * 0.05 + b * 2.1 + l * 0.012;
          const off = (l - LINES / 2) * 28 + Math.sin(time * 0.3 + b) * 60;
          ctx.strokeStyle = `rgba(17,17,17,${l % 7 === 0 ? 0.5 : 0.14})`;
          ctx.beginPath();
          for (let s = 0; s <= SAMPLES; s++) {
            const u = s / SAMPLES;
            const env = Math.pow(Math.sin(Math.PI * u), 1.6); // läuft an den Enden spitz aus
            const v = section(ang, off, u) - 0.4;
            const wob = Math.sin(u * 11 + time * 0.7 + l * 0.25) * 0.05;
            const y = base - (v + wob) * amp * env * (b === 1 ? 1.2 : 1);
            const x = -w * 0.05 + u * w * 1.1;
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
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
        if (!raf) { resize(); raf = requestAnimationFrame(frame); }
      },
    };
  }

  WB.startCover = startCover;
})();
