/*
 * Pflanzen am Berg: aus den Standortregeln (WB.content.plantList) werden Standorte im
 * Gelände berechnet und als Grundformen auf dem 3D-Modell gezeichnet – wie auf der Titelseite:
 *   Baum = Ring · Nutzbaum = Punkt · Busch = Dreieck · Kraut/Gras = Kreuz · Rebe = Strich · Feucht = Quadrat
 */
(function () {
  const WB = (window.WB = window.WB || {});

  const FORMS = {
    baum: { name: 'Bäume' },
    nutzbaum: { name: 'Nutzbäume' },
    busch: { name: 'Büsche' },
    rebe: { name: 'Reben' },
    kraut: { name: 'Kräuter & Gräser' },
    feucht: { name: 'Muldenrand (feucht)' },
  };

  // Dichte: jede n-te passende Rasterzelle (10 m) bekommt ein Zeichen
  const DENSITY = { baum: 3, nutzbaum: 4, busch: 3, rebe: 1, kraut: 8, feucht: 4 };
  // dünnere Bestände je Standort (Bäume am Hangfuß, Büsche im Steilgürtel)
  const RULE_DENSITY = { hangfuss: 22, steil: 9 };

  function rules(T) {
    const range = T.maxH - T.minH;
    const keyInfo = (k) => {
      const z = T.ZONE[k];
      if (z !== 'mittel' && z !== 'auslauf') return null;
      const dh = T.KEY_DH[z];
      const h = T.H[k];
      const slope = T.SLOPE[k] / 100;
      const r = ((h % dh) + dh) % dh; // Höhe über dem letzten Damm
      const tol = Math.max(0.25, slope * T.CELL * 0.55);
      const md = (z === 'auslauf' ? 15 : 9) * Math.max(slope, 0.02);
      const x = (k % T.N) * T.CELL, y = Math.floor(k / T.N) * T.CELL;
      const onDam = r < tol || dh - r < tol;
      return { onDam, inMulde: !onDam && r > tol && r < md + tol * 1.5, x, y, line: Math.round(h / dh) };
    };
    return {
      kuppeInnen: (k) => T.ZONE[k] === 'kuppe' && T.H[k] > T.TOP - 6,
      kuppeMitte: (k) => T.ZONE[k] === 'kuppe' && T.H[k] <= T.TOP - 6 && T.H[k] > T.TOP - 11,
      kuppeAussen: (k) => T.ZONE[k] === 'kuppe' && T.H[k] <= T.TOP - 11,
      steil: (k) => T.ZONE[k] === 'steil',
      damm: (k) => { const i = keyInfo(k); return !!i && i.onDam && !T.opening(i.x, i.y, i.line).open; },
      oeffnung: (k) => { const i = keyInfo(k); return !!i && i.onDam && T.opening(i.x, i.y, i.line).open; },
      mulde: (k) => { const i = keyInfo(k); return !!i && i.inMulde; },
      boeschung: (k) => { const i = keyInfo(k); return !!i && !i.onDam && !i.inMulde; },
      einzel: (k) => T.ZONE[k] === 'mittel',
      hangfuss: (k) => T.ZONE[k] === 'auslauf' && T.H[k] < T.minH + 0.3 * range,
    };
  }

  // deterministischer Zufall je Zelle und Pflanze
  const hash = (k, s) => {
    let h = (k * 2654435761) ^ (s * 40503);
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };

  function placePlants(T, list) {
    const R = rules(T);
    return list.map((p, n) => {
      const parts = p.wo.split('+');
      const meide = (p.meide || []).reduce((m, key) => m | T.PROBLEM_BITS[key], 0);
      const cells = [];
      let avoided = 0;
      for (let k = 0; k < T.N * T.N; k++) {
        if (T.ZONE[k] === 'ort' || !T.AREA[k]) continue; // nur am Berg, nicht in der Landschaft
        // welche Regel trifft zu? „einzel“ = einzelne Bäume, sehr dünn
        const w = parts.find((w) => (w === 'einzel' ? R.einzel(k) && hash(k, 7) < 1 / 45 : R[w](k)));
        if (!w) continue;
        if (meide && T.PROBLEM[k] & meide) { avoided++; continue; }
        const dens = w === 'einzel' ? 1 : RULE_DENSITY[w] && p.form !== 'kraut' ? RULE_DENSITY[w] : DENSITY[p.form];
        const d = w.startsWith('kuppe') ? Math.min(dens, 2) : dens; // Kuppe ist klein: dichter
        if (hash(k, n + 1) < 1 / d) cells.push(k);
      }
      const zones = [...new Set(cells.map((k) => T.ZONE[k]))].map((z) => T.ZONES[z].name);
      return { ...p, id: n, cells, zones, avoided };
    });
  }

  // eine Grundform zeichnen (auch für Icons im Panel)
  function glyph(ctx, form, x, y, s, ang = 0) {
    const m = s / 2;
    ctx.beginPath();
    switch (form) {
      case 'baum':
        ctx.arc(x, y, m * 0.8, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1, s / 7);
        ctx.stroke();
        break;
      case 'nutzbaum':
        ctx.arc(x, y, m * 0.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'busch':
        ctx.moveTo(x, y - m * 0.75);
        ctx.lineTo(x + m * 0.7, y + m * 0.55);
        ctx.lineTo(x - m * 0.7, y + m * 0.55);
        ctx.closePath();
        ctx.fill();
        break;
      case 'kraut':
        ctx.lineWidth = Math.max(1, s / 8);
        ctx.moveTo(x - m * 0.55, y - m * 0.55);
        ctx.lineTo(x + m * 0.55, y + m * 0.55);
        ctx.moveTo(x + m * 0.55, y - m * 0.55);
        ctx.lineTo(x - m * 0.55, y + m * 0.55);
        ctx.stroke();
        break;
      case 'rebe':
        ctx.lineWidth = Math.max(1.4, s / 5);
        ctx.moveTo(x - Math.cos(ang) * m * 0.8, y - Math.sin(ang) * m * 0.8);
        ctx.lineTo(x + Math.cos(ang) * m * 0.8, y + Math.sin(ang) * m * 0.8);
        ctx.stroke();
        break;
      case 'feucht':
        ctx.lineWidth = Math.max(1, s / 7);
        ctx.rect(x - m * 0.5, y - m * 0.5, m, m);
        ctx.stroke();
        break;
    }
  }

  // Icon als SVG für Buttons
  function icon(form) {
    const s = {
      baum: '<circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
      nutzbaum: '<circle cx="8" cy="8" r="4.5" fill="currentColor"/>',
      busch: '<path d="M8 2.5 L13.5 12.5 H2.5 Z" fill="currentColor"/>',
      kraut: '<path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" stroke="currentColor" stroke-width="1.8"/>',
      rebe: '<path d="M2.5 8 H13.5" stroke="currentColor" stroke-width="2.6"/>',
      feucht: '<rect x="4" y="4" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    }[form];
    return `<svg class="pi" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">${s}</svg>`;
  }

  // auf dem 3D-Modell zeichnen
  function drawPlants(ctx, view, placed, selected, active) {
    const T = view.t;
    const e = 5;
    for (const p of placed) {
      if (!selected.has(p.id)) continue;
      const on = active === p.id;
      ctx.strokeStyle = ctx.fillStyle = on ? '#F1E62B' : '#FFFFFF';
      ctx.globalAlpha = on || active == null ? 1 : 0.75;
      const size = on ? 11 : 8;
      for (const k of p.cells) {
        const x = (k % T.N) * T.CELL, y = Math.floor(k / T.N) * T.CELL;
        const s = view.project(x, y, T.H[k] + 1.5);
        let ang = 0;
        if (p.form === 'rebe') {
          const gx = T.heightAt(x + e, y) - T.heightAt(x - e, y);
          const gy = T.heightAt(x, y + e) - T.heightAt(x, y - e);
          const a = view.project(x - gy * 3, y + gx * 3, T.H[k]);
          const b = view.project(x + gy * 3, y - gx * 3, T.H[k]);
          ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        }
        // dunkler Rand, damit die Form auf dem Gitter lesbar bleibt
        const sc = ctx.strokeStyle;
        ctx.strokeStyle = ctx.fillStyle = 'rgba(0,0,0,0.85)';
        glyph(ctx, p.form, s[0], s[1] - size * 0.3, size + 3, ang);
        ctx.strokeStyle = ctx.fillStyle = sc;
        glyph(ctx, p.form, s[0], s[1] - size * 0.3, size, ang);
      }
    }
    ctx.globalAlpha = 1;
  }

  WB.plants = { FORMS, placePlants, drawPlants, glyph, icon };
})();
