/*
 * Hintergrund der Titelseite: Teilchen, die sich frei über die Seite bewegen und sich
 * immer wieder neu anordnen – erst zur Draufsicht des Korber Kopfs heute, dann zum Berg
 * mit Konzept (Keylines und Mulden in Blau, Wald auf der Kuppe), dann lösen sie sich wieder.
 * Zeichen wie im Moodboard „Punktraster-Karte“.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  const INK = '#111111';
  const BLUE = '#2433F0';
  const PERIOD = 20; // Sekunden für einen Durchlauf

  // Ablauf: frei → Berg heute → Berg mit Konzept → frei
  const KEYS = [
    [0, 'free'], [2.2, 'free'], [5.2, 'A'], [8.5, 'A'], [11.5, 'B'], [15.5, 'B'], [18.5, 'free'], [PERIOD, 'free'],
  ];

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  function startCover(canvas, terrain) {
    const ctx = canvas.getContext('2d');
    const T = terrain;
    let w = 0, h = 0, dpr = 1, raf = null;
    const t0 = performance.now();
    let parts = [];
    const CELL = 12;

    function typeToday(slope, zone) {
      if (zone === 'ort') return 'dot';
      return slope < 8 ? 'hatch' : slope < 18 ? 'cross' : slope < 30 ? 'tri' : 'dome';
    }

    function build() {
      const size = Math.max(h * 1.3, w * 0.72);
      const ox = w * 0.68 - (T.SUMMIT.x / T.SIZE) * size;
      const oy = h * 0.52 - (T.SUMMIT.y / T.SIZE) * size;
      const mpc = (CELL / size) * T.SIZE;
      const cells = [];
      for (let py = CELL / 2; py < h; py += CELL)
        for (let px = CELL / 2; px < w; px += CELL) {
          const x = ((px - ox) / size) * T.SIZE;
          const y = ((py - oy) / size) * T.SIZE;
          if (x < 0 || y < 0 || x > T.SIZE || y > T.SIZE) continue;
          // links neben dem Titel ausdünnen
          const fade = Math.min(1, Math.max(0, (px - w * 0.36) / (w * 0.16)));
          if (fade <= 0.02) continue;
          const zone = T.zoneAt(x, y);
          const slope = T.slopeAt(x, y);
          const a = typeToday(slope, zone);
          let b = a, ang = 0;
          if (zone === 'kuppe') b = (Math.round(px / CELL) + Math.round(py / CELL)) % 2 ? 'ring' : 'hatch';
          if (zone === 'mittel' || zone === 'auslauf') {
            const dh = T.KEY_DH[zone];
            const z = T.heightAt(x, y);
            const tol = Math.max(0.5, (slope / 100) * mpc * 0.55);
            const r = ((z % dh) + dh) % dh;
            if (r < tol || dh - r < tol) {
              const e = 5;
              ang = Math.atan2(T.heightAt(x + e, y) - T.heightAt(x - e, y), -(T.heightAt(x, y + e) - T.heightAt(x, y - e)));
              b = 'wall';
            } else b = zone === 'mittel' ? 'tri' : 'hatch';
          }
          cells.push({ px, py, a, b, ang, fade, x, y });
        }
      // Ordnung für „Berg mit Konzept“: Teilchen tauschen die Plätze (Drehung um den Gipfel)
      const sx = ox + (T.SUMMIT.x / T.SIZE) * size, sy = oy + (T.SUMMIT.y / T.SIZE) * size;
      const order = cells.map((c, i) => i);
      const key = (c) => Math.round(Math.hypot(c.px - sx, c.py - sy) / (CELL * 3)) * 10 + Math.atan2(c.py - sy, c.px - sx);
      const sorted = [...order].sort((i, j) => key(cells[i]) - key(cells[j]));
      const shifted = sorted.map((_, n) => sorted[(n + Math.floor(sorted.length * 0.03)) % sorted.length]);
      const rank = new Array(cells.length);
      sorted.forEach((ci, n) => (rank[ci] = n));
      parts = cells.map((c, i) => ({
        A: c,
        B: cells[shifted[rank[i]]],
        fx: Math.random() * w, fy: Math.random() * h, // freie Position
        vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.5) * 18,
        delay: Math.random() * 0.35 + (c.px / w) * 0.25,
        freeType: ['hatch', 'cross', 'tri', 'dot'][i % 4],
      }));
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

    // Zustand im Ablauf: von, nach, Fortschritt 0..1
    function phase(tt) {
      for (let i = 0; i < KEYS.length - 1; i++) {
        const [ta, sa] = KEYS[i];
        const [tb, sb] = KEYS[i + 1];
        if (tt >= ta && tt < tb) return [sa, sb, (tt - ta) / (tb - ta)];
      }
      return ['free', 'free', 0];
    }

    function frame(now) {
      const time = (now - t0) / 1000;
      const tt = time % PERIOD;
      const [from, to, k] = phase(tt);
      const dt = 1 / 60;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Teilchen nach Zeichen sammeln, dann je Zeichen in einem Zug zeichnen
      const buckets = { hatch: [], cross: [], tri: [], dome: [], ring: [], dot: [], wall: [] };
      for (const p of parts) {
        // freie Teilchen treiben langsam
        p.fx += p.vx * dt;
        p.fy += p.vy * dt;
        if (p.fx < -20) p.fx = w + 20;
        if (p.fx > w + 20) p.fx = -20;
        if (p.fy < -20) p.fy = h + 20;
        if (p.fy > h + 20) p.fy = -20;
        const pos = (s) => (s === 'free' ? [p.fx, p.fy, 0.35] : s === 'A' ? [p.A.px, p.A.py, p.A.fade] : [p.B.px, p.B.py, p.B.fade]);
        const [x0, y0, a0] = pos(from);
        const [x1, y1, a1] = pos(to);
        const local = Math.min(1, Math.max(0, (k - p.delay * (from === to ? 0 : 1)) / (1 - p.delay)));
        const e = from === to ? 0 : ease(local);
        const x = x0 + (x1 - x0) * e;
        const y = y0 + (y1 - y0) * e;
        const alpha = a0 + (a1 - a0) * e;
        const state = e < 0.5 ? from : to;
        const type = state === 'free' ? p.freeType : state === 'A' ? p.A.a : p.B.b;
        const ang = state === 'B' ? p.B.ang : 0;
        buckets[type].push(x, y, alpha, ang);
      }

      const m = CELL / 2;
      const draw = (list, fn, style, isStroke, lw) => {
        if (!list.length) return;
        for (let i = 0; i < list.length; i += 4) {
          ctx.globalAlpha = list[i + 2];
          ctx.beginPath();
          fn(list[i], list[i + 1], list[i + 3]);
          if (isStroke) { ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.stroke(); }
          else { ctx.fillStyle = style; ctx.fill(); }
        }
      };
      draw(buckets.hatch, (x, y) => { ctx.moveTo(x - m * 0.8, y - m * 0.8); ctx.lineTo(x + m * 0.8, y + m * 0.8); }, 'rgba(17,17,17,0.4)', true, 0.7);
      draw(buckets.cross, (x, y) => {
        ctx.moveTo(x - m * 0.5, y - m * 0.5); ctx.lineTo(x + m * 0.5, y + m * 0.5);
        ctx.moveTo(x + m * 0.5, y - m * 0.5); ctx.lineTo(x - m * 0.5, y + m * 0.5);
      }, 'rgba(17,17,17,0.55)', true, 0.7);
      draw(buckets.tri, (x, y) => { ctx.moveTo(x, y - m * 0.55); ctx.lineTo(x + m * 0.5, y + m * 0.45); ctx.lineTo(x - m * 0.5, y + m * 0.45); }, INK, false);
      draw(buckets.dome, (x, y) => {
        ctx.arc(x, y + m * 0.1, m * 0.62, Math.PI, 0); ctx.lineTo(x + m * 0.62, y + m * 0.55); ctx.lineTo(x - m * 0.62, y + m * 0.55);
      }, INK, false);
      draw(buckets.ring, (x, y) => { ctx.arc(x, y, m * 0.42, 0, Math.PI * 2); }, INK, true, 1.2);
      draw(buckets.dot, (x, y) => { ctx.rect(x - 1, y - 1, 2, 2); }, 'rgba(17,17,17,0.3)', false);
      draw(buckets.wall, (x, y, a) => {
        ctx.moveTo(x - Math.cos(a) * m, y - Math.sin(a) * m); ctx.lineTo(x + Math.cos(a) * m, y + Math.sin(a) * m);
      }, BLUE, true, 1.8);
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
