/*
 * Wassersimulation im Hangprofil (vom Gipfel nach Süden).
 * Vereinfachtes Modell zum Zeigen des Prinzips – KEINE hydrologische Berechnung.
 *
 * Wasser wird in „Pakete“ aufgeteilt. Jedes Paket fällt als Regen, fließt hangabwärts
 * und kann versickern, in einer Mulde landen, über eine Rinne geleitet werden
 * oder unten aus dem Hang abfließen.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  const PARAMS = {
    rainSeconds: 12,
    rainRate: 80, // Pakete pro Sekunde bei Faktor 1
    // Versickerung auf der Fläche je Meter Fließweg
    infil: {
      heute: { kuppe: 0.006, steil: 0.002, mittel: 0.003, auslauf: 0.004, rinne: 0.003 },
      konzept: { kuppe: 0.03, steil: 0.004, mittel: 0.007, auslauf: 0.009, rinne: 0.006 },
    },
    rinneSpacing: 3.5,
    rinneCatch: 0.06, // Anteil, den eine Rinne im Steilgürtel ableitet
    mulde: {
      mittel: { spacing: 5, cap: 4, rate: 0.5 },
      auslauf: { spacing: 8, cap: 6, rate: 0.8 },
    },
    becken: { length: 25, cap: 40, rate: 2 },
  };

  class WaterModel {
    constructor(profile) {
      this.p = profile; // Array {s, z, slope, zone}, 1 m Schritte
      this.L = profile[profile.length - 1].s;
      this.variant = 'konzept';
      this.factor = 1;
      this.reset();
    }

    zoneAt(s) {
      return this.p[Math.min(this.p.length - 1, Math.max(0, Math.round(s)))].zone;
    }
    slopeAt(s) {
      return this.p[Math.min(this.p.length - 1, Math.max(0, Math.round(s)))].slope / 100;
    }

    reset() {
      this.time = 0;
      this.raining = false;
      this.rainLeft = 0;
      this.parts = [];
      this.stats = { regen: 0, versickert: 0, geleitet: 0, abgeflossen: 0 };
      this.rinnen = [];
      this.mulden = [];
      this.becken = null;
      this.broken = null;
      if (this.variant === 'konzept') {
        let lastR = -99;
        const last = { mittel: -99, auslauf: -99 };
        for (const q of this.p) {
          if (q.zone === 'steil' && q.s - lastR >= PARAMS.rinneSpacing) {
            this.rinnen.push(q.s);
            lastR = q.s;
          }
          const m = PARAMS.mulde[q.zone];
          if (m && q.s - last[q.zone] >= m.spacing && q.s < this.L - PARAMS.becken.length) {
            this.mulden.push({ s: q.s, zone: q.zone, cap: m.cap, rate: m.rate, vol: 0, broken: false });
            last[q.zone] = q.s;
          }
        }
        this.becken = { s0: this.L - PARAMS.becken.length, cap: PARAMS.becken.cap, rate: PARAMS.becken.rate, vol: 0 };
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
      const full = this.mulden.filter((m) => !m.broken && m.zone === 'mittel');
      if (!full.length) return null;
      full.sort((a, b) => b.vol - a.vol);
      const m = full[0];
      m.broken = true;
      const n = Math.round(m.vol);
      for (let k = 0; k < n; k++) this.parts.push({ s: m.s + 0.5 + Math.random(), fall: 0 });
      m.vol = 0;
      this.broken = m;
      return m;
    }

    stored() {
      let v = 0;
      for (const m of this.mulden) v += m.vol;
      if (this.becken) v += this.becken.vol;
      return v;
    }

    step(dt) {
      this.time += dt;
      // Regen
      if (this.raining) {
        const n = PARAMS.rainRate * (this.L / 640) * this.factor * dt;
        let count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
        for (let k = 0; k < count; k++) {
          this.parts.push({ s: Math.random() * this.L, fall: 1 });
          this.stats.regen++;
        }
        this.rainLeft -= dt;
        if (this.rainLeft <= 0) this.raining = false;
      }

      const keep = [];
      for (const pt of this.parts) {
        if (pt.fall > 0) {
          pt.fall -= dt * 2.2; // Tropfen fällt
          keep.push(pt);
          continue;
        }
        const zone = this.zoneAt(pt.s);
        const slope = this.slopeAt(pt.s);
        const v = 6 + 60 * Math.sqrt(slope) * (this.variant === 'konzept' && zone === 'steil' ? 0.7 : 1);
        const s0 = pt.s;
        const s1 = s0 + v * dt;
        const dist = s1 - s0;

        // Versickerung auf der Fläche
        // Starkregen: Boden kann weniger aufnehmen
        const rate = PARAMS.infil[this.variant][zone] / Math.pow(this.factor, 0.8);
        const pInf = 1 - Math.pow(1 - rate, dist);
        if (Math.random() < pInf) {
          this.stats.versickert++;
          continue;
        }

        let gone = false;
        if (this.variant === 'konzept') {
          // Rinnen im Steilgürtel leiten Wasser zur Muldenlinie
          for (const r of this.rinnen) {
            if (r > s0 && r <= s1 && Math.random() < PARAMS.rinneCatch) {
              this.stats.geleitet++;
              gone = true;
              break;
            }
          }
          // Mulden fangen Wasser
          if (!gone) {
            for (const m of this.mulden) {
              if (m.s > s0 && m.s <= s1 && !m.broken && m.vol < m.cap) {
                m.vol += 1;
                gone = true;
                break;
              }
            }
          }
          // Becken am Hangfuß
          if (!gone && this.becken && s1 >= this.becken.s0 && this.becken.vol < this.becken.cap) {
            this.becken.vol += 1;
            gone = true;
          }
        }
        if (gone) continue;

        if (s1 >= this.L) {
          this.stats.abgeflossen++;
          continue;
        }
        pt.s = s1;
        keep.push(pt);
      }
      this.parts = keep;

      // Mulden und Becken versickern langsam
      for (const m of this.mulden) {
        if (m.vol > 0) {
          const d = Math.min(m.vol, m.rate * dt);
          m.vol -= d;
          this.stats.versickert += d;
        }
      }
      if (this.becken && this.becken.vol > 0) {
        const d = Math.min(this.becken.vol, this.becken.rate * dt);
        this.becken.vol -= d;
        this.stats.versickert += d;
      }
    }

    done() {
      return !this.raining && this.parts.length === 0;
    }
  }

  // ---------------- Darstellung ----------------
  class WaterView {
    constructor(canvas, model, terrain) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.m = model;
      this.t = terrain;
      this.resize();
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const p = this.m.p;
      this.zMax = p[0].z + 10;
      this.zMin = p[p.length - 1].z - 40;
      this.draw();
    }

    X(s) {
      return 30 + (s / this.m.L) * (this.w - 60);
    }
    Y(z) {
      const top = 40;
      const bottom = this.h - 70;
      return top + ((this.zMax - z) / (this.zMax - this.zMin)) * (bottom - top);
    }
    zAt(s) {
      const p = this.m.p;
      const i = Math.min(p.length - 1, Math.max(0, Math.round(s)));
      return p[i].z;
    }

    draw() {
      const { ctx, m } = this;
      const p = m.p;
      ctx.clearRect(0, 0, this.w, this.h);

      // Boden
      ctx.fillStyle = '#C9B39A';
      ctx.beginPath();
      ctx.moveTo(this.X(0), this.h - 70);
      for (const q of p) ctx.lineTo(this.X(q.s), this.Y(q.z));
      ctx.lineTo(this.X(m.L), this.h - 70);
      ctx.closePath();
      ctx.fill();

      // Oberfläche nach Zonen
      ctx.lineWidth = 5;
      for (let i = 1; i < p.length; i++) {
        ctx.strokeStyle = this.t.ZONES[p[i].zone].color;
        ctx.beginPath();
        ctx.moveTo(this.X(p[i - 1].s), this.Y(p[i - 1].z));
        ctx.lineTo(this.X(p[i].s), this.Y(p[i].z));
        ctx.stroke();
      }

      // Rinnen
      ctx.strokeStyle = '#3FD0E0';
      ctx.lineWidth = 1.5;
      for (const r of m.rinnen) {
        const x = this.X(r);
        const y = this.Y(this.zAt(r));
        ctx.beginPath();
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
      }

      // Mulden + Wälle
      for (const md of m.mulden) {
        const x = this.X(md.s);
        const y = this.Y(this.zAt(md.s));
        const wHalf = md.zone === 'auslauf' ? 6 : 4;
        // Wall
        ctx.fillStyle = md.broken ? '#E5402A' : '#7A5C3E';
        ctx.fillRect(x + wHalf, y - 7, 3, 8);
        // Mulde
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - wHalf, y);
        ctx.quadraticCurveTo(x, y + 10, x + wHalf, y);
        ctx.stroke();
        const fill = md.vol / md.cap;
        if (fill > 0.02) {
          ctx.fillStyle = '#2433F0';
          ctx.globalAlpha = 0.35 + 0.65 * fill;
          ctx.fillRect(x - wHalf, y + 5 - 7 * fill, wHalf * 2, 7 * fill);
          ctx.globalAlpha = 1;
        }
      }

      // Becken
      if (m.becken) {
        const x0 = this.X(m.becken.s0);
        const x1 = this.X(m.L);
        const y = this.Y(this.zAt(m.becken.s0 + 10));
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x0, y - 2, x1 - x0, 16);
        const f = m.becken.vol / m.becken.cap;
        ctx.fillStyle = '#2433F0';
        ctx.fillRect(x0, y + 14 - 16 * f, x1 - x0, 16 * f);
      }

      // Wasserpakete
      for (const pt of m.parts) {
        const x = this.X(pt.s);
        const yG = this.Y(this.zAt(pt.s));
        if (pt.fall > 0) {
          const y = yG - pt.fall * 120;
          ctx.strokeStyle = 'rgba(80,140,255,0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y - 6);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#4C7DFF';
          ctx.fillRect(x - 1.5, yG - 4, 3, 3);
        }
      }

      // Zonenbeschriftung
      ctx.font = '500 12px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = '#fff';
      let start = 0;
      for (let i = 1; i <= p.length; i++) {
        if (i === p.length || p[i].zone !== p[start].zone) {
          const z = this.t.ZONES[p[start].zone];
          const xa = this.X(p[start].s);
          const xb = this.X(p[i - 1].s);
          if (xb - xa > 60) {
            ctx.fillStyle = z.color;
            ctx.fillRect(xa, this.h - 52, xb - xa - 4, 3);
            ctx.fillStyle = '#fff';
            ctx.fillText(z.name, xa, this.h - 34);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            let sub = `${z.range} · ${z.water}`;
            while (sub.length > 4 && ctx.measureText(sub).width > xb - xa - 10) sub = sub.slice(0, -2);
            if (sub !== `${z.range} · ${z.water}`) sub = sub.trim() + '…';
            ctx.fillText(sub, xa, this.h - 18);
          }
          start = i;
        }
      }
    }
  }

  WB.WaterModel = WaterModel;
  WB.WaterView = WaterView;
  WB.SIM_PARAMS = PARAMS;
})();
