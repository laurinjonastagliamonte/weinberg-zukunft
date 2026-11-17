/*
 * Hintergrund der Titelseite: der Korber Kopf von oben als Zeichenraster
 * (Moodboard „Punktraster-Karte“). Er bleibt stehen und verwandelt sich langsam in Beispiele:
 *   heute → Wall-Mulde-System → heute → Problemzonen → heute → …
 */
(function () {
  const WB = (window.WB = window.WB || {});

  const INK = '#111111';
  const BLUE = '#2433F0';
  const CELL = 12;

  // Ablauf: [Zustand, Dauer]; zwischen zwei Zuständen wird verwandelt
  const STEPS = [
    ['heute', 2.5], ['>konzept', 5], ['konzept', 3.5], ['>heute', 3],
    ['heute', 1.5], ['>probleme', 4.5], ['probleme', 3.5], ['>heute', 3],
  ];
  const TOTAL = STEPS.reduce((a, s) => a + s[1], 0);
  const CAPTION = {
    heute: 'Korber Kopf · heute',
    konzept: 'Korber Kopf · Beispiel: Wall-Mulde-System',
    probleme: 'Korber Kopf · Beispiel: Problemzonen – Frost, Trockenheit, Feuchte, Wind',
  };

  function startCover(canvas, terrain) {
    const ctx = canvas.getContext('2d');
    const caption = canvas.parentElement.querySelector('.cover-caption');
    const T = terrain;
    let w = 0, h = 0, dpr = 1, raf = null;
    const t0 = performance.now();
    let cells = [];

    function build() {
      const size = Math.max(h * 1.3, w * 0.72);
      const ox = w * 0.68 - (T.SUMMIT.x / T.SIZE) * size;
      const oy = h * 0.52 - (T.SUMMIT.y / T.SIZE) * size;
      const mpc = (CELL / size) * T.SIZE;
      const e = 6;
      cells = [];
      for (let py = CELL / 2; py < h; py += CELL)
        for (let px = CELL / 2; px < w; px += CELL) {
          const x = ((px - ox) / size) * T.SIZE;
          const y = ((py - oy) / size) * T.SIZE;
          if (x < 0 || y < 0 || x > T.SIZE || y > T.SIZE) continue;
          const fade = Math.min(1, Math.max(0, (px - w * 0.36) / (w * 0.16))); // Platz für den Titel
          if (fade <= 0.02) continue;
          const z = T.heightAt(x, y);
          const gx = (T.heightAt(x + e, y) - T.heightAt(x - e, y)) / (2 * e);
          const gy = (T.heightAt(x, y + e) - T.heightAt(x, y - e)) / (2 * e);
          const slope = Math.hypot(gx, gy) * 100;
          const zone = T.zoneAt(x, y);
          // heute
          const heute = zone === 'ort' ? 'dot' : slope < 8 ? 'hatch' : slope < 18 ? 'cross' : slope < 30 ? 'tri' : 'dome';
          // Beispiel: Wall-Mulde-System
          let konzept = heute, ang = 0;
          if (zone === 'kuppe') konzept = (Math.round(px / CELL) + Math.round(py / CELL)) % 2 ? 'ring' : 'hatch';
          if (zone === 'mittel' || zone === 'auslauf') {
            const dh = T.KEY_DH[zone];
            const tol = Math.max(0.5, (slope / 100) * mpc * 0.55);
            const r = ((z % dh) + dh) % dh;
            if (r < tol || dh - r < tol) {
              ang = Math.atan2(gx, -gy); // entlang der Höhenlinie
              konzept = 'wall';
            } else konzept = zone === 'mittel' ? 'tri' : 'hatch';
          }
          // Beispiel: Problemzonen
          const bits = T.PROBLEM[T.idx(Math.round(x / T.CELL), Math.round(y / T.CELL))] || 0;
          const B = T.PROBLEM_BITS;
          const probleme = bits & B.wind ? 'wind' : bits & B.frost ? 'frost' : bits & B.feucht ? 'feucht' : bits & B.trocken ? 'trocken' : heute === 'dot' ? 'dot' : 'hatch';
          cells.push({
            px, py, fade, ang,
            type: { heute, konzept, probleme },
            // Reihenfolge des Wandels: von oben am Berg nach unten, leicht gestreut
            order: Math.min(1, (T.maxH - z) / (T.maxH - T.minH) * 0.8 + Math.random() * 0.2),
            rnd: Math.random(),
          });
        }
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

    let lastCaption = '';
    function setCaption(text) {
      if (caption && text !== lastCaption) {
        caption.textContent = text;
        lastCaption = text;
      }
    }

    // aktuellen Schritt finden: [von, nach, Fortschritt]
    function state(time) {
      let t = time % TOTAL;
      let prev = 'heute';
      for (const [name, dur] of STEPS) {
        if (t < dur) {
          if (name[0] === '>') return [prev, name.slice(1), t / dur];
          return [name, name, 1];
        }
        t -= dur;
        prev = name[0] === '>' ? name.slice(1) : name;
      }
      return ['heute', 'heute', 1];
    }

    function frame(now) {
      const [from, to, k] = state((now - t0) / 1000);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const buckets = { hatch: [], cross: [], tri: [], dome: [], ring: [], dot: [], wall: [], frost: [], trocken: [], feucht: [], wind: [] };
      for (const c of cells) {
        // zum Konzept von oben nach unten, sonst gestreut
        const key = to === 'konzept' || from === 'konzept' ? c.order : c.rnd;
        const done = from === to || k >= key;
        const s = done ? to : from;
        const type = c.type[s];
        buckets[type].push(c.px, c.py, c.fade, s === 'konzept' ? c.ang : 0);
      }
      setCaption(CAPTION[k >= 0.5 ? to : from]);

      const m = CELL / 2;
      const draw = (list, fn, style, isStroke, lw) => {
        for (let i = 0; i < list.length; i += 4) {
          ctx.globalAlpha = list[i + 2];
          ctx.beginPath();
          fn(list[i], list[i + 1], list[i + 3]);
          if (isStroke) { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.stroke(); }
          else { ctx.fillStyle = style; ctx.fill(); }
        }
      };
      const tri = (x, y) => { ctx.moveTo(x, y - m * 0.55); ctx.lineTo(x + m * 0.5, y + m * 0.45); ctx.lineTo(x - m * 0.5, y + m * 0.45); };
      const cross = (x, y) => {
        ctx.moveTo(x - m * 0.5, y - m * 0.5); ctx.lineTo(x + m * 0.5, y + m * 0.5);
        ctx.moveTo(x + m * 0.5, y - m * 0.5); ctx.lineTo(x - m * 0.5, y + m * 0.5);
      };
      draw(buckets.hatch, (x, y) => { ctx.moveTo(x - m * 0.8, y - m * 0.8); ctx.lineTo(x + m * 0.8, y + m * 0.8); }, 'rgba(17,17,17,0.4)', true, 0.7);
      draw(buckets.cross, cross, 'rgba(17,17,17,0.55)', true, 0.7);
      draw(buckets.tri, tri, INK, false);
      draw(buckets.dome, (x, y) => {
        ctx.arc(x, y + m * 0.1, m * 0.62, Math.PI, 0); ctx.lineTo(x + m * 0.62, y + m * 0.55); ctx.lineTo(x - m * 0.62, y + m * 0.55);
      }, INK, false);
      draw(buckets.ring, (x, y) => { ctx.arc(x, y, m * 0.42, 0, Math.PI * 2); }, INK, true, 1.2);
      draw(buckets.dot, (x, y) => { ctx.rect(x - 1, y - 1, 2, 2); }, 'rgba(17,17,17,0.3)', false);
      draw(buckets.wall, (x, y, a) => {
        ctx.moveTo(x - Math.cos(a) * m, y - Math.sin(a) * m); ctx.lineTo(x + Math.cos(a) * m, y + Math.sin(a) * m);
      }, BLUE, true, 1.8);
      // Problemzonen in den Farben der Analyse
      draw(buckets.frost, (x, y) => { ctx.arc(x, y, m * 0.45, 0, Math.PI * 2); }, '#3DA9E8', true, 1.6);
      draw(buckets.trocken, tri, '#E3C400', false);
      draw(buckets.feucht, (x, y) => { ctx.rect(x - m * 0.45, y - m * 0.45, m * 0.9, m * 0.9); }, BLUE, false);
      draw(buckets.wind, cross, '#E5402A', true, 1.6);
      ctx.globalAlpha = 1;
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
