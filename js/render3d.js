/*
 * 3D-Drahtgitter des Bergs auf einem Canvas (ohne Bibliothek).
 * Ziehen = drehen, Mausrad = zoomen, Klick = Zone auswählen.
 *
 * Das Gelände wird in ein Zwischenbild gezeichnet und nur neu berechnet, wenn sich
 * Ansicht oder Modus ändern. Darüber zeichnet `onOverlay` bewegte Dinge (Wasser, Auswahl).
 */
(function () {
  const WB = (window.WB = window.WB || {});

  class Mountain3D {
    constructor(canvas, terrain, opts = {}) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.t = terrain;
      this.yaw = -0.55;
      this.pitch = 0.62;
      this.zoom = 1.6; // nah am Berg, Ränder laufen ohnehin aus
      this.exag = 1; // Höhe unverzerrt (Modell 1:4000)
      this.mode = opts.mode || 'zonen'; // 'zonen' | 'hoehen' | 'sim' | 'reco'
      this.centerX = opts.centerX ?? 0.4; // Anteil der Breite (Platz für Panels)
      this.highlight = null; // Zonen-Key
      this.showConcept = false; // Keylines, Wälle, Mulden, Rinnen, Becken (Konzept Melissa)
      this.showLabels = false; // Beschriftung der Bausteine
      this.showPaths = false; // Weg des Wassers (blaue Linien) – zurzeit aus
      this.problems = new Set(['frost', 'trocken', 'feucht', 'wind']); // sichtbare Problemzonen
      this.problemHighlight = null;
      this.onOverlay = null;
      this.onPick = null;
      this.contours = terrain.contours(10);
      this.fine = null; // feine Höhenlinien für Wälle, bei Bedarf
      this.base = document.createElement('canvas');
      this.dirty = true;
      this._bind();
      this.resize();
    }

    _bind() {
      let drag = null;
      this.c.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: false };
        this.c.setPointerCapture(e.pointerId);
      });
      this.c.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (!drag.moved) return;
        this.yaw = drag.yaw + dx * 0.008;
        this.pitch = Math.min(1.5, Math.max(0.12, drag.pitch + dy * 0.006));
        this.invalidate();
      });
      this.c.addEventListener('pointerup', (e) => {
        if (drag && !drag.moved && this.onPick) {
          const r = this.c.getBoundingClientRect();
          const hit = this.pick(e.clientX - r.left, e.clientY - r.top);
          if (hit) this.onPick(hit);
        }
        drag = null;
      });
      this.c.addEventListener('pointercancel', () => (drag = null));
      this.c.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          this.zoom = Math.min(4, Math.max(0.9, this.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
          this.invalidate();
        },
        { passive: false }
      );
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.dpr = dpr;
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      for (const cv of [this.c, this.base]) {
        cv.width = Math.round(this.w * dpr);
        cv.height = Math.round(this.h * dpr);
      }
      this.invalidate();
    }

    invalidate() {
      this.dirty = true;
      this.draw();
    }

    setView(name) {
      if (name === 'draufsicht') {
        this.pitch = 1.5;
        this.yaw = 0;
      } else {
        this.pitch = 0.62;
        this.yaw = -0.55;
      }
      this.invalidate();
    }

    project(x, y, z) {
      const t = this.t;
      // Mitte = Gipfel, damit der Berg (nicht der Ausschnitt) im Bild zentriert ist
      const X = x - t.SUMMIT.x;
      const Y = y - t.SUMMIT.y;
      const Z = (z - (t.minH + t.maxH) / 2) * this.exag;
      const cy = Math.cos(this.yaw);
      const sy = Math.sin(this.yaw);
      const xr = X * cy - Y * sy;
      const yr = X * sy + Y * cy;
      const sp = Math.sin(this.pitch);
      const cp = Math.cos(this.pitch);
      const screenY = yr * sp - Z * cp;
      const depth = yr * cp + Z * sp;
      const f = 1 / (1 - depth / (t.SIZE * 2.6));
      const scale = (this.zoom * Math.min(this.w, this.h)) / (t.SIZE * 1.25);
      const cx = this.w > 1000 ? this.w * this.centerX : this.w / 2;
      return [cx + xr * f * scale, this.h * 0.52 + screenY * f * scale, depth];
    }

    // nächster Rasterpunkt zur Mausposition
    pick(mx, my) {
      if (!this.P) return null;
      const t = this.t;
      let best = -1;
      let bd = 14 * 14;
      for (let n = 0; n < this.P.length; n++) {
        const p = this.P[n];
        const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2;
        if (d < bd) { bd = d; best = n; }
      }
      if (best < 0) return null;
      return { index: best, zone: t.ZONE[best], x: (best % t.N) * t.CELL, y: Math.floor(best / t.N) * t.CELL };
    }

    draw() {
      if (!this.w) return;
      if (this.dirty) {
        this._drawBase();
        this.dirty = false;
      }
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.c.width, this.c.height);
      ctx.drawImage(this.base, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.onOverlay) this.onOverlay(ctx, this);
      this._fadeOut(ctx);
    }

    // Berg läuft nach außen weich aus: kein Viereck als Sockel, nur der Berg
    _fadeOut(ctx) {
      const t = this.t;
      const c = this.project(t.SUMMIT.x, t.SUMMIT.y, (t.minH + t.maxH) / 2);
      const scale = (this.zoom * Math.min(this.w, this.h)) / (t.SIZE * 1.25);
      const r = (t.AREA_R + 260) * scale; // ganz ausgeblendet etwas außerhalb des Gebiets
      const squash = Math.max(0.25, Math.sin(this.pitch));
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.translate(c[0], c[1]);
      ctx.scale(1, squash);
      const g = ctx.createRadialGradient(0, 0, r * 0.62, 0, 0, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-this.w * 4, -this.h * 8, this.w * 8, this.h * 16);
      ctx.restore();
    }

    _drawBase() {
      const t = this.t;
      const ctx = this.base.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const N = t.N;
      const C = t.CELL;
      const P = new Array(N * N);
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) P[j * N + i] = this.project(i * C, j * C, t.H[j * N + i]);
      this.P = P;
      const mode = this.mode;

      // Drahtgitter
      ctx.strokeStyle = mode === 'zonen' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let j = 0; j < N; j += 2)
        for (let i = 0; i < N; i++) {
          const p = P[j * N + i];
          if (i === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        }
      for (let i = 0; i < N; i += 2)
        for (let j = 0; j < N; j++) {
          const p = P[j * N + i];
          if (j === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        }
      ctx.stroke();

      // Zonen als Punktraster
      if (mode !== 'hoehen') {
        const dim = mode === 'probleme' ? 0.22 : this.showConcept ? 0.28 : mode === 'sim' ? 0.35 : 1;
        for (let n = 0; n < N * N; n++) {
          const z = t.ZONE[n];
          const on = !this.highlight || z === this.highlight;
          if (mode === 'reco' && (!this.highlight || !on)) continue; // Bepflanzung: nur gewählte Zone andeuten
          ctx.globalAlpha = on ? dim : 0.12;
          const p = P[n];
          ctx.fillStyle = on && this.highlight ? (mode === 'reco' ? '#3A3A3A' : '#F1E62B') : t.ZONES[z].color;
          const r = 0.9 + Math.max(0, p[2]) / (t.SIZE * 1.1) + (on && this.highlight ? 0.4 : 0);
          ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      }

      if (mode === 'probleme') this._drawProblems(ctx);
      if (this.showConcept) this._drawConcept(ctx);

      // Höhenlinien
      for (const c of this.contours) {
        const major = c.level % 50 === 0;
        if (mode === 'hoehen') {
          ctx.strokeStyle = major ? 'rgba(241,230,43,0.95)' : 'rgba(255,255,255,0.75)';
          ctx.lineWidth = major ? 1.6 : 0.9;
        } else if (this.showConcept) {
          ctx.strokeStyle = major ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0)';
          ctx.lineWidth = 0.6;
        } else {
          ctx.strokeStyle = major ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)';
          ctx.lineWidth = major ? 1 : 0.6;
        }
        ctx.beginPath();
        for (const [a, b] of c.segments) {
          const pa = this.project(a[0], a[1], c.level);
          const pb = this.project(b[0], b[1], c.level);
          ctx.moveTo(pa[0], pa[1]);
          ctx.lineTo(pb[0], pb[1]);
        }
        ctx.stroke();
      }

      // Wind (aus Wetter): Pfeile in Windrichtung über den Berg
      if (this.weather && this.weather.wind > 0) this._drawWind(ctx);

      // Gipfelmarke
      const s = this.project(t.SUMMIT.x, t.SUMMIT.y, t.TOP);
      ctx.fillStyle = '#F1E62B';
      ctx.beginPath();
      ctx.arc(s[0], s[1] - 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '500 12px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${t.name} · ${Math.round(t.TOP)} m`, s[0] + 10, s[1] - 10);

      // Nordpfeil
      const n0 = this.project(t.SIZE * 0.05, t.SIZE * 0.12, t.minH);
      const n1 = this.project(t.SIZE * 0.05, t.SIZE * 0.02, t.minH);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(n0[0], n0[1]);
      ctx.lineTo(n1[0], n1[1]);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('N', n1[0] - 4, n1[1] - 6);
    }

    // ---------- Konzept Melissa im Gelände ----------
    _seg(ctx, a, b, z) {
      const pa = this.project(a[0], a[1], z);
      const pb = this.project(b[0], b[1], z);
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
    }

    _drawConcept(ctx) {
      const t = this.t;
      const K = t.keylines();
      const lift = 0.6; // Linien minimal über dem Boden
      const hl = this.highlight;
      const on = (z) => !hl || hl === z;

      for (const kl of K) {
        if (!on(kl.zone)) continue;
        if (kl.zone === 'steil') {
          // Rinnen alle 3,5 m: eng, leiten das Wasser quer zur Muldenlinie
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          for (const l of kl.walls) for (const [a, b] of l.segments) this._seg(ctx, a, b, l.level + lift);
          ctx.stroke();
          // Pfeile in Leitrichtung
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (const l of kl.walls)
            l.segments.forEach(([a, b], n) => {
              if (n % 9) return;
              const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
              const e = 4;
              const gx = (t.heightAt(mx + e, my) - t.heightAt(mx - e, my)) / (2 * e);
              const gy = (t.heightAt(mx, my + e) - t.heightAt(mx, my - e)) / (2 * e);
              const [dx, dy] = t.leadDir(mx, my, gx, gy);
              const z = t.heightAt(mx, my) + lift;
              const tip = [mx + dx * 9, my + dy * 9];
              const p0 = this.project(mx - dx * 3, my - dy * 3, z);
              const p1 = this.project(tip[0], tip[1], z);
              const w1 = this.project(tip[0] - dx * 4 - dy * 3, tip[1] - dy * 4 + dx * 3, z);
              const w2 = this.project(tip[0] - dx * 4 + dy * 3, tip[1] - dy * 4 - dx * 3, z);
              ctx.moveTo(p0[0], p0[1]);
              ctx.lineTo(p1[0], p1[1]);
              ctx.lineTo(w1[0], w1[1]);
              ctx.moveTo(p1[0], p1[1]);
              ctx.lineTo(w2[0], w2[1]);
            });
          ctx.stroke();
          continue;
        }
        const wide = kl.zone === 'auslauf';
        // Mulde hinter dem Wall (hangaufwärts)
        ctx.strokeStyle = wide ? 'rgba(61,91,255,0.75)' : 'rgba(61,91,255,0.6)';
        ctx.lineWidth = wide ? 2.4 : 1.3;
        ctx.beginPath();
        for (const l of kl.mulden) for (const [a, b] of l.segments) this._seg(ctx, a, b, l.level + lift);
        ctx.stroke();
        // Damm aus dem Aushub, mit versetzten Öffnungen (alle 100 m, von Damm zu Damm um 50 m versetzt)
        const doors = [];
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = wide ? 1.4 : 1;
        ctx.beginPath();
        for (const l of kl.walls) {
          const line = Math.round(l.level / kl.dh);
          for (const [a, b] of l.segments) {
            const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
            if (t.opening(mx, my, line).open) { doors.push([a, b, l.level]); continue; }
            this._seg(ctx, a, b, l.level + lift + 0.4);
          }
        }
        ctx.stroke();
        // Öffnungen: Lücke im Damm (blau markiert) mit kurzen Wangen hangabwärts wie in der Skizze
        ctx.fillStyle = '#9FE0FF';
        for (const [a, b, lvl] of doors) {
          const p = this.project((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, lvl + lift + 0.4);
          ctx.fillRect(p[0] - 1.6, p[1] - 1.6, 3.2, 3.2);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const [a, b, lvl] of doors) {
          for (const q of [a, b]) {
            const e = 4;
            const gx = (t.heightAt(q[0] + e, q[1]) - t.heightAt(q[0] - e, q[1])) / (2 * e);
            const gy = (t.heightAt(q[0], q[1] + e) - t.heightAt(q[0], q[1] - e)) / (2 * e);
            const g = Math.hypot(gx, gy) || 1;
            const len = wide ? 12 : 9;
            const end = [q[0] - (gx / g) * len, q[1] - (gy / g) * len];
            const p0 = this.project(q[0], q[1], lvl + lift + 0.4);
            const p1 = this.project(end[0], end[1], t.heightAt(end[0], end[1]) + lift);
            ctx.moveTo(p0[0], p0[1]);
            ctx.lineTo(p1[0], p1[1]);
          }
        }
        ctx.stroke();
        // Reben auf dem Damm
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        for (const l of kl.walls)
          for (const [a, b] of l.segments) {
            if ((a[0] * 7 + a[1] * 3) % 3 >= 1.2) continue;
            const p = this.project((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, l.level + lift + 0.4);
            ctx.fillRect(p[0] - 0.9, p[1] - 2.2, 1.8, 1.8);
          }
        // einzelne Bäume (Mandel, Feige, Maulbeere) im Mittelhang
        if (kl.zone === 'mittel') {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 0.8;
          for (let k = 0; k < t.N * t.N; k += 97) {
            if (t.ZONE[k] !== 'mittel') continue;
            const p = this.P[k];
            ctx.beginPath();
            ctx.arc(p[0], p[1] - 4, 2.4, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      if (this.showPaths) this._drawPaths(ctx);

      // Becken am Hangfuß
      if (on('auslauf'))
        for (const b of t.BECKEN) {
          const p = this.project(b.x, b.y, t.heightAt(b.x, b.y) + lift);
          ctx.strokeStyle = 'rgba(61,91,255,0.95)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(p[0], p[1], 7, 4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

      if (this.showLabels) this._drawLabels(ctx);
    }

    _drawWind(ctx) {
      const t = this.t;
      const w = this.weather;
      // Windrichtung = woher der Wind kommt; Pfeil zeigt wohin
      const r = ((w.windDir + 180) * Math.PI) / 180;
      const dx = Math.sin(r), dy = -Math.cos(r);
      const len = 60 + w.wind * 5;
      ctx.strokeStyle = 'rgba(229,64,42,0.85)';
      ctx.fillStyle = 'rgba(229,64,42,0.85)';
      ctx.lineWidth = 1.4;
      for (let gy = 250; gy < t.SIZE; gy += 500)
        for (let gx = 250; gx < t.SIZE; gx += 500) {
          const x0 = gx - (dx * len) / 2, y0 = gy - (dy * len) / 2;
          const x1 = gx + (dx * len) / 2, y1 = gy + (dy * len) / 2;
          const a = this.project(x0, y0, t.heightAt(x0, y0) + 25);
          const b = this.project(x1, y1, t.heightAt(x1, y1) + 25);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          ctx.beginPath();
          ctx.moveTo(b[0] + Math.cos(ang) * 6, b[1] + Math.sin(ang) * 6);
          ctx.lineTo(b[0] + Math.cos(ang + 2.5) * 6, b[1] + Math.sin(ang + 2.5) * 6);
          ctx.lineTo(b[0] + Math.cos(ang - 2.5) * 6, b[1] + Math.sin(ang - 2.5) * 6);
          ctx.fill();
        }
    }

    _drawProblems(ctx) {
      const t = this.t;
      const keys = Object.keys(t.PROBLEMS).filter((k) => this.problems.has(k) && (!this.problemHighlight || this.problemHighlight === k));
      const offs = { frost: [-1.6, -1.6], trocken: [1.6, -1.6], feucht: [-1.6, 1.6], wind: [1.6, 1.6] };
      for (const key of keys) {
        const bit = t.PROBLEM_BITS[key];
        ctx.fillStyle = t.PROBLEMS[key].color;
        ctx.globalAlpha = 0.8;
        const [ox, oy] = offs[key];
        for (let k = 0; k < t.N * t.N; k++) {
          if (!(t.PROBLEM[k] & bit)) continue;
          const p = this.P[k];
          ctx.fillRect(p[0] + ox - 1.6, p[1] + oy - 1.6, 3.2, 3.2);
        }
      }
      ctx.globalAlpha = 1;
    }

    _drawPaths(ctx) {
      const t = this.t;
      const paths = t.waterPaths();
      for (const p of paths) {
        const end = p.firstMulde > 0 ? p.firstMulde : p.pts.length - 1;
        // fest: der Weg bis zur ersten Mulde
        ctx.strokeStyle = '#2433F0';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= end; i++) {
          const q = p.pts[i];
          const s = this.project(q[0], q[1], q[2] + 2);
          if (i === 0) ctx.moveTo(s[0], s[1]);
          else ctx.lineTo(s[0], s[1]);
        }
        ctx.stroke();
        // gestrichelt: Überlauf, wenn die Mulden voll sind
        if (end < p.pts.length - 1) {
          ctx.setLineDash([5, 5]);
          ctx.strokeStyle = 'rgba(36,51,240,0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = end; i < p.pts.length; i++) {
            const q = p.pts[i];
            const s = this.project(q[0], q[1], q[2] + 2);
            if (i === end) ctx.moveTo(s[0], s[1]);
            else ctx.lineTo(s[0], s[1]);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Start und Mulden
        const s0 = this.project(p.pts[0][0], p.pts[0][1], p.pts[0][2] + 2);
        ctx.fillStyle = '#2433F0';
        ctx.beginPath();
        ctx.arc(s0[0], s0[1], 3.5, 0, Math.PI * 2);
        ctx.fill();
        p.mulden.forEach((m, i) => {
          const s = this.project(m[0], m[1], m[2] + 2);
          ctx.fillStyle = i === 0 ? '#2433F0' : '#000';
          ctx.strokeStyle = '#2433F0';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(s[0], s[1], i === 0 ? 4.5 : 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        // Pfeilspitze am Ende
        const a = p.pts[p.pts.length - 2], b = p.pts[p.pts.length - 1];
        const sa = this.project(a[0], a[1], a[2] + 2), sb = this.project(b[0], b[1], b[2] + 2);
        const ang = Math.atan2(sb[1] - sa[1], sb[0] - sa[0]);
        ctx.fillStyle = '#2433F0';
        ctx.beginPath();
        ctx.moveTo(sb[0] + Math.cos(ang) * 6, sb[1] + Math.sin(ang) * 6);
        ctx.lineTo(sb[0] + Math.cos(ang + 2.5) * 6, sb[1] + Math.sin(ang + 2.5) * 6);
        ctx.lineTo(sb[0] + Math.cos(ang - 2.5) * 6, sb[1] + Math.sin(ang - 2.5) * 6);
        ctx.fill();
      }
    }

    _labelAnchors() {
      if (this._anchors) return this._anchors;
      const t = this.t;
      const N = t.N;
      let steil = -1, mittel = -1, ort = [0, 0, 0];
      for (let k = 0; k < N * N; k++) {
        const z = t.ZONE[k];
        const dS = (k2) => Math.hypot((k2 % N) * t.CELL - t.SUMMIT.x, Math.floor(k2 / N) * t.CELL - t.SUMMIT.y);
        if (z === 'steil' && t.SLOPE[k] > 35 && (steil < 0 || dS(k) < dS(steil))) steil = k;
        if (z === 'mittel' && (mittel < 0 || t.H[k] > t.H[mittel])) mittel = k;
        if (z === 'ort') { ort[0] += k % N; ort[1] += Math.floor(k / N); ort[2]++; }
      }
      const at = (k) => [(k % N) * t.CELL, Math.floor(k / N) * t.CELL];
      const list = [
        ['Schwammkuppe', [t.SUMMIT.x, t.SUMMIT.y], [-40, -40]],
        ['Steilgürtel: enge Rinnen leiten das Wasser quer', at(steil), [40, -50]],
        ['Damm mit Reben · Mulde dahinter', at(mittel), [-60, 40]],
        ['Öffnungen versetzt: Wasser läuft im Zickzack', at(mittel), [-60, 64]],
      ];
      if (t.BECKEN.length) list.push(['Becken am Hangfuß', [t.BECKEN[0].x, t.BECKEN[0].y], [20, 30]]);
      const wp = this.showPaths ? t.waterPaths() : [];
      if (wp.length) {
        const p0 = wp[0].pts[Math.floor(wp[0].pts.length * 0.35)];
        list.push(['Weg des Wassers: geleitet, gebremst, versickert', [p0[0], p0[1]], [40, 30]]);
      }
      if (ort[2]) list.push(['Ort Korb', [(ort[0] / ort[2]) * t.CELL, (ort[1] / ort[2]) * t.CELL], [0, 0]]);
      this._anchors = list;
      return list;
    }

    _drawLabels(ctx) {
      const t = this.t;
      ctx.font = '500 12px Inter, "Helvetica Neue", Arial, sans-serif';
      for (const [text, [x, y], [ox, oy]] of this._labelAnchors()) {
        const p = this.project(x, y, t.heightAt(x, y));
        const lx = p[0] + ox, ly = p[1] + oy;
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p[0], p[1], 2, 0, Math.PI * 2);
        ctx.fill();
        const w = ctx.measureText(text).width + 16;
        ctx.fillStyle = 'rgba(20,20,20,0.9)';
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.roundRect(lx - (ox < 0 ? w : 0), ly - 11, w, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText(text, lx - (ox < 0 ? w : 0) + 8, ly + 4);
      }
    }
  }

  WB.Mountain3D = Mountain3D;
})();
