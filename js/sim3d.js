/*
 * Wassersimulation direkt auf dem 3D-Gelände, nach Konzept Melissa.
 * Vereinfachtes Modell zum Zeigen des Prinzips – KEINE hydrologische Berechnung.
 *
 * Regen wird in „Pakete“ aufgeteilt. Jedes Paket fällt auf den Berg und fließt:
 *   heute:   dem stärksten Gefälle nach, Richtung Ort oder aus dem Ausschnitt.
 *   Konzept: Kuppe     – versickert viel (Schwammkuppe, Wald)
 *            Steilgürtel – Rinnen leiten das Wasser quer zum Hang zur Muldenlinie
 *            Muldenlinie – Stufenrinne mit Kopfweiden bremst, Wasser versickert
 *            Mittelhang / Auslauf – Wasser trifft auf einen Wall und bleibt in der Mulde
 *                         dahinter, bis es versickert. Ist sie voll, läuft es über (Überlauf).
 *            Hangfuß – Becken fangen den Rest.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  const PARAMS = {
    rainSeconds: 10,
    rainRate: 320, // Pakete pro Sekunde bei Faktor 1
    infil: {
      heute: { kuppe: 0.004, steil: 0.0015, mittel: 0.002, auslauf: 0.003, rinne: 0.002 },
      konzept: { kuppe: 0.03, steil: 0.003, mittel: 0.005, auslauf: 0.006, rinne: 0.012 },
    },
    stillInfil: 0.6, // je Sekunde, wenn das Wasser in einer Senke steht
    mulde: {
      mittel: { cap: 3, rate: 0.25 },
      auslauf: { cap: 5, rate: 0.35 },
    },
    becken: { cap: 40, rate: 1.5, radius: 30 },
  };

  class WaterModel3D {
    constructor(terrain) {
      this.t = terrain;
      this.variant = 'konzept';
      this.factor = 1;
      this.reset();
    }

    reset() {
      const t = this.t;
      const n = t.N * t.N;
      this.time = 0;
      this.raining = false;
      this.rainLeft = 0;
      this.parts = [];
      this.stats = { regen: 0, versickert: 0, geleitet: 0, ort: 0 };
      this.store = new Float32Array(n);
      this.cap = new Float32Array(n);
      this.rate = new Float32Array(n);
      this.broken = new Uint8Array(n);
      this.becken = t.BECKEN.map((b) => ({ ...b, vol: 0 }));
      this.lastBreak = null;
      if (this.variant === 'konzept') {
        for (let k = 0; k < n; k++) {
          const m = PARAMS.mulde[t.ZONE[k]];
          if (!m) continue;
          this.cap[k] = m.cap;
          this.rate[k] = m.rate;
        }
      }
    }

    setVariant(v) {
      this.variant = v;
      this.reset();
    }

    startRain() {
      this.raining = true;
      this.rainLeft = PARAMS.rainSeconds;
    }

    breakWall() {
      const t = this.t;
      let best = -1;
      let bv = 0.5;
      for (let k = 0; k < this.store.length; k++)
        if (t.ZONE[k] === 'mittel' && !this.broken[k] && this.store[k] > bv) { bv = this.store[k]; best = k; }
      if (best < 0) return null;
      const i0 = best % t.N;
      const j0 = Math.floor(best / t.N);
      let released = 0;
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= t.N || j >= t.N) continue;
          const k = t.idx(i, j);
          if (t.ZONE[k] !== 'mittel') continue;
          released += this.store[k];
          this.store[k] = 0;
          this.broken[k] = 1;
          this.cap[k] = 0;
        }
      const x = i0 * t.CELL;
      const y = j0 * t.CELL;
      for (let q = 0; q < Math.max(8, Math.round(released)); q++)
        this.parts.push({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 14, fall: 0, burst: true });
      this.lastBreak = { x, y };
      return this.lastBreak;
    }

    stored() {
      let v = 0;
      for (let k = 0; k < this.store.length; k++) v += this.store[k];
      for (const b of this.becken) v += b.vol;
      return v;
    }

    step(dt) {
      const t = this.t;
      const S = t.SIZE;
      this.time += dt;

      if (this.raining) {
        const n = PARAMS.rainRate * this.factor * dt;
        const count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        for (let q = 0; q < count; q++) {
          const x = Math.random() * S;
          const y = Math.random() * S;
          if (t.zoneAt(x, y) === 'ort') continue; // Regen im Ort zählt nicht zum Hang
          this.parts.push({ x, y, fall: 1 });
          this.stats.regen++;
        }
        this.rainLeft -= dt;
        if (this.rainLeft <= 0) this.raining = false;
      }

      const inf = PARAMS.infil[this.variant];
      const soak = Math.pow(this.factor, 0.8); // Starkregen: Boden kann weniger aufnehmen
      const konzept = this.variant === 'konzept';
      const e = 5;
      const keep = [];
      for (const p of this.parts) {
        if (p.fall > 0) {
          p.fall -= dt * 2;
          keep.push(p);
          continue;
        }
        p.age = (p.age || 0) + dt;
        if (p.age > 25) { this.stats.versickert++; continue; }

        const k = t.idx(Math.round(p.x / t.CELL), Math.round(p.y / t.CELL));
        const zone = t.ZONE[k];
        if (zone === 'ort') { this.stats.ort++; continue; }

        const gx = (t.heightAt(p.x + e, p.y) - t.heightAt(p.x - e, p.y)) / (2 * e);
        const gy = (t.heightAt(p.x, p.y + e) - t.heightAt(p.x, p.y - e)) / (2 * e);
        const g = Math.hypot(gx, gy);
        if (g < 0.004) {
          if (Math.random() < PARAMS.stillInfil * dt) { this.stats.versickert++; continue; }
          p.x += (Math.random() - 0.5) * 2;
          p.y += (Math.random() - 0.5) * 2;
          keep.push(p);
          continue;
        }

        // Richtung und Tempo
        let dx = -gx / g;
        let dy = -gy / g;
        let v = 6 + 110 * Math.sqrt(g);
        if (konzept && zone === 'steil') {
          [dx, dy] = t.leadDir(p.x, p.y, gx, gy); // Rinne leitet quer zur Muldenlinie
          v *= 0.55;
          if (!p.led) { p.led = true; this.stats.geleitet++; }
        } else if (konzept && zone === 'rinne') {
          v *= 0.45; // Stufenrinne bremst
          p.led = true;
        }
        const dist = v * dt;
        const h0 = t.heightAt(p.x, p.y);
        p.x += dx * dist + (Math.random() - 0.5) * 0.5;
        p.y += dy * dist + (Math.random() - 0.5) * 0.5;

        if (p.x < 0 || p.y < 0 || p.x > S || p.y > S) { this.stats.ort++; continue; }
        if (Math.random() < 1 - Math.pow(1 - inf[zone] / soak, dist)) { this.stats.versickert++; continue; }

        if (konzept) {
          // Wall erreicht? (Wasser kreuzt eine Keyline im Mittelhang / Auslauf)
          const dh = t.KEY_DH[zone];
          if ((zone === 'mittel' || zone === 'auslauf') && dh) {
            const h1 = t.heightAt(p.x, p.y);
            if (Math.floor(h1 / dh) < Math.floor(h0 / dh)) {
              const kk = t.idx(Math.round(p.x / t.CELL), Math.round(p.y / t.CELL));
              if (this.cap[kk] > 0 && this.store[kk] < this.cap[kk]) {
                this.store[kk] += 1;
                continue;
              }
              p.over = true; // Mulde voll: läuft über den Überlauf weiter
            }
          }
          // Becken am Hangfuß
          if (zone === 'auslauf') {
            let caught = false;
            for (const b of this.becken)
              if (b.vol < PARAMS.becken.cap && Math.abs(b.x - p.x) < PARAMS.becken.radius && Math.abs(b.y - p.y) < PARAMS.becken.radius) {
                b.vol += 1;
                caught = true;
                break;
              }
            if (caught) continue;
          }
        }
        keep.push(p);
      }
      this.parts = keep;

      for (let k = 0; k < this.store.length; k++) {
        const s = this.store[k];
        if (s > 0) {
          const d = Math.min(s, this.rate[k] * dt);
          this.store[k] = s - d;
          this.stats.versickert += d;
        }
      }
      for (const b of this.becken)
        if (b.vol > 0) {
          const d = Math.min(b.vol, PARAMS.becken.rate * dt);
          b.vol -= d;
          this.stats.versickert += d;
        }
    }

    done() {
      return !this.raining && this.parts.length === 0;
    }
  }

  // Zeichnet Wasser, gefüllte Mulden und Becken über das 3D-Modell
  function drawWater(ctx, view, model) {
    const t = view.t;
    for (let k = 0; k < model.store.length; k++) {
      if (model.broken[k]) {
        const p = view.P[k];
        ctx.fillStyle = '#E5402A';
        ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
        continue;
      }
      const s = model.store[k];
      if (s < 0.05) continue;
      const p = view.P[k];
      const f = Math.min(1, s / model.cap[k]);
      ctx.globalAlpha = 0.4 + 0.6 * f;
      ctx.fillStyle = '#2433F0';
      const r = 1.2 + 2.4 * f;
      ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    for (const b of model.becken) {
      if (b.vol < 0.1) continue;
      const a = view.project(b.x, b.y, t.heightAt(b.x, b.y));
      ctx.fillStyle = '#2433F0';
      ctx.beginPath();
      ctx.arc(a[0], a[1], 2 + 6 * Math.min(1, b.vol / PARAMS.becken.cap), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of model.parts) {
      const z = t.heightAt(p.x, p.y);
      if (p.fall > 0) {
        const a = view.project(p.x, p.y, z + p.fall * 60);
        const b = view.project(p.x, p.y, z + p.fall * 60 + 8);
        ctx.strokeStyle = 'rgba(120,150,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      } else {
        const a = view.project(p.x, p.y, z + 1);
        ctx.fillStyle = '#000';
        ctx.fillRect(a[0] - 2.8, a[1] - 2.8, 5.6, 5.6);
        ctx.fillStyle = p.burst ? '#E5402A' : p.led ? '#9FE0FF' : '#5C7CFF';
        ctx.fillRect(a[0] - 2, a[1] - 2, 4, 4);
      }
    }
    if (model.lastBreak) {
      const z = t.heightAt(model.lastBreak.x, model.lastBreak.y);
      const a = view.project(model.lastBreak.x, model.lastBreak.y, z);
      ctx.strokeStyle = '#E5402A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(a[0], a[1], 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '500 12px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = '#E5402A';
      ctx.fillText('Wallbruch', a[0] + 16, a[1] + 4);
    }
  }

  WB.WaterModel3D = WaterModel3D;
  WB.drawWater = drawWater;
  WB.SIM_PARAMS = PARAMS;
})();
