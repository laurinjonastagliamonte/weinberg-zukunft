/*
 * Wassersimulation direkt auf dem 3D-Gelände.
 * Vereinfachtes Modell zum Zeigen des Prinzips – KEINE hydrologische Berechnung.
 *
 * Regen wird in „Pakete“ aufgeteilt. Jedes Paket fällt auf den Berg, fließt in Richtung
 * des stärksten Gefälles und kann:
 *   - auf der Fläche versickern,
 *   - im Steilgürtel von einer Rinne zur Muldenlinie geleitet werden,
 *   - im Mittelhang / Auslauf in einer Versickerungsmulde landen,
 *   - am Rand des Ausschnitts abfließen.
 * Die Mulden geben das Wasser langsam an den Boden ab.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  const PARAMS = {
    rainSeconds: 10,
    rainRate: 320, // Pakete pro Sekunde bei Faktor 1 (gesamter Ausschnitt)
    // Versickerung auf der Fläche je Meter Fließweg
    infil: {
      heute: { kuppe: 0.004, steil: 0.0015, mittel: 0.002, auslauf: 0.003, rinne: 0.002 },
      konzept: { kuppe: 0.02, steil: 0.003, mittel: 0.005, auslauf: 0.006, rinne: 0.008 },
    },
    stillInfil: 0.6, // je Sekunde, wenn das Wasser in einer Senke steht
    rinneCatch: 0.02, // je Meter im Steilgürtel: Anteil, den Rinnen ableiten
    // Mulden je Rasterzelle (10 x 10 m): Fangwahrscheinlichkeit je Meter, Speicher, Versickerung je Sekunde
    mulde: {
      mittel: { catch: 0.06, cap: 3, rate: 0.25 },
      auslauf: { catch: 0.08, cap: 5, rate: 0.35 },
    },
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
      this.stats = { regen: 0, versickert: 0, geleitet: 0, abgeflossen: 0 };
      this.store = new Float32Array(n);
      this.cap = new Float32Array(n);
      this.rate = new Float32Array(n);
      this.catchP = new Float32Array(n);
      this.broken = new Uint8Array(n);
      this.lastBreak = null;
      if (this.variant === 'konzept') {
        for (let k = 0; k < n; k++) {
          const m = PARAMS.mulde[t.ZONE[k]];
          if (!m) continue;
          this.cap[k] = m.cap;
          this.rate[k] = m.rate;
          this.catchP[k] = m.catch;
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
      for (let k = 0; k < this.store.length; k++) {
        if (t.ZONE[k] === 'mittel' && !this.broken[k] && this.store[k] > bv) { bv = this.store[k]; best = k; }
      }
      if (best < 0) return null;
      // Bruch betrifft die Zelle und ihre Nachbarn hangabwärts
      const i0 = best % t.N;
      const j0 = Math.floor(best / t.N);
      let released = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
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
      for (let q = 0; q < Math.round(released); q++)
        this.parts.push({ x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 12, fall: 0, led: false, burst: true });
      this.lastBreak = { x, y };
      return this.lastBreak;
    }

    stored() {
      let v = 0;
      for (let k = 0; k < this.store.length; k++) v += this.store[k];
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
          this.parts.push({ x: Math.random() * S, y: Math.random() * S, fall: 1, led: false });
          this.stats.regen++;
        }
        this.rainLeft -= dt;
        if (this.rainLeft <= 0) this.raining = false;
      }

      const inf = PARAMS.infil[this.variant];
      const soak = Math.pow(this.factor, 0.8); // Starkregen: Boden kann weniger aufnehmen
      const konzept = this.variant === 'konzept';
      const e = 6;
      const keep = [];
      for (const p of this.parts) {
        if (p.fall > 0) {
          p.fall -= dt * 2;
          keep.push(p);
          continue;
        }
        p.age = (p.age || 0) + dt;
        // Wasser, das lange in einer Mulde im Gelände pendelt, versickert dort
        if (p.age > 25) {
          this.stats.versickert++;
          continue;
        }
        const k = t.idx(Math.round(p.x / t.CELL), Math.round(p.y / t.CELL));
        const zone = t.ZONE[k];
        const gx = (t.heightAt(p.x + e, p.y) - t.heightAt(p.x - e, p.y)) / (2 * e);
        const gy = (t.heightAt(p.x, p.y + e) - t.heightAt(p.x, p.y - e)) / (2 * e);
        const g = Math.hypot(gx, gy);

        // in einer Senke: steht und versickert
        if (g < 0.004) {
          if (Math.random() < PARAMS.stillInfil * dt) {
            this.stats.versickert++;
            continue;
          }
          p.x += (Math.random() - 0.5) * 2;
          p.y += (Math.random() - 0.5) * 2;
          keep.push(p);
          continue;
        }

        const slow = konzept && zone === 'steil' ? 0.6 : 1;
        const v = (6 + 110 * Math.sqrt(g)) * slow;
        const dist = v * dt;
        p.x -= (gx / g) * dist + (Math.random() - 0.5) * 0.6;
        p.y -= (gy / g) * dist + (Math.random() - 0.5) * 0.6;

        if (p.x < 0 || p.y < 0 || p.x > S || p.y > S) {
          this.stats.abgeflossen++;
          continue;
        }
        if (Math.random() < 1 - Math.pow(1 - inf[zone] / soak, dist)) {
          this.stats.versickert++;
          continue;
        }
        if (konzept) {
          if (zone === 'steil' && !p.led && Math.random() < 1 - Math.pow(1 - PARAMS.rinneCatch, dist)) {
            p.led = true; // läuft jetzt in einer Rinne Richtung Muldenlinie
            this.stats.geleitet++;
          }
          if (this.cap[k] > 0 && this.store[k] < this.cap[k] && Math.random() < 1 - Math.pow(1 - this.catchP[k], dist)) {
            this.store[k] += 1;
            continue;
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
    }

    done() {
      return !this.raining && this.parts.length === 0;
    }
  }

  // Zeichnet Wasser und Mulden über das 3D-Modell
  function drawWater(ctx, view, model) {
    const t = view.t;
    // gefüllte Mulden
    for (let k = 0; k < model.store.length; k++) {
      const s = model.store[k];
      if (model.broken[k]) {
        const p = view.P[k];
        ctx.fillStyle = '#E5402A';
        ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4);
        continue;
      }
      if (s < 0.05) continue;
      const p = view.P[k];
      const f = Math.min(1, s / model.cap[k]);
      ctx.globalAlpha = 0.35 + 0.65 * f;
      ctx.fillStyle = '#2433F0';
      const r = 1.4 + 2.6 * f;
      ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    // Wasserpakete
    for (const p of model.parts) {
      const z = t.heightAt(p.x, p.y);
      if (p.fall > 0) {
        const a = view.project(p.x, p.y, z + p.fall * 60);
        const b = view.project(p.x, p.y, z + p.fall * 60 + 8);
        ctx.strokeStyle = 'rgba(120,170,255,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      } else {
        const a = view.project(p.x, p.y, z + 1);
        ctx.fillStyle = p.burst ? '#E5402A' : p.led ? '#3FD0E0' : '#9DBBFF';
        ctx.fillRect(a[0] - 1.8, a[1] - 1.8, 3.6, 3.6);
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
