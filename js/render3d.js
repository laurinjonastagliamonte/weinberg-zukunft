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
      this.zoom = 1;
      this.exag = 2.2;
      this.mode = opts.mode || 'zonen'; // 'zonen' | 'hoehen' | 'sim' | 'reco'
      this.centerX = opts.centerX ?? 0.4; // Anteil der Breite (Platz für Panels)
      this.highlight = null; // Zonen-Key
      this.showConcept = false; // Keylines, Wälle, Mulden, Rinnen, Becken (Konzept Melissa)
      this.showLabels = false; // Beschriftung der Bausteine
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
          this.zoom = Math.min(3, Math.max(0.6, this.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
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
      const X = x - t.SIZE / 2;
      const Y = y - t.SIZE / 2;
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

      // Sockel (freigestellter Block)
      const base = t.minH - 25;
      const edge = [];
      for (let i = 0; i < N; i++) edge.push([i, 0]);
      for (let j = 0; j < N; j++) edge.push([N - 1, j]);
      for (let i = N - 1; i >= 0; i--) edge.push([i, N - 1]);
      for (let j = N - 1; j >= 0; j--) edge.push([0, j]);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      edge.forEach(([i, j], k) => {
        if (k % 3) return;
        const a = P[j * N + i];
        const b = this.project(i * C, j * C, base);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      edge.forEach(([i, j], k) => {
        const b = this.project(i * C, j * C, base);
        if (k === 0) ctx.moveTo(b[0], b[1]);
        else ctx.lineTo(b[0], b[1]);
      });
      ctx.closePath();
      ctx.stroke();

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
        const dim = this.showConcept ? 0.28 : mode === 'sim' ? 0.35 : 1;
        for (let n = 0; n < N * N; n++) {
          const z = t.ZONE[n];
          const on = !this.highlight || z === this.highlight;
          ctx.globalAlpha = on ? dim : 0.12;
          const p = P[n];
          ctx.fillStyle = on && this.highlight ? '#F1E62B' : t.ZONES[z].color;
          const r = 0.9 + Math.max(0, p[2]) / (t.SIZE * 1.1) + (on && this.highlight ? 0.4 : 0);
          ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      }

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

      // Kuppe: Wald von innen nach außen (innen große Pionierbäume, außen Büsche)
      if (on('kuppe')) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 0.8;
        for (let j = 0; j < t.N; j += 2)
          for (let i = (j / 2) % 2; i < t.N; i += 2) {
            const k = j * t.N + i;
            if (t.ZONE[k] !== 'kuppe') continue;
            const inner = t.H[k] > t.maxH - 7;
            const p = this.P[k];
            ctx.beginPath();
            ctx.arc(p[0], p[1] - (inner ? 3 : 1.5), inner ? 2.6 : 1.4, 0, Math.PI * 2);
            ctx.stroke();
          }
      }

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
        // Wall aus dem Aushub
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = wide ? 1.4 : 1;
        ctx.beginPath();
        for (const l of kl.walls) for (const [a, b] of l.segments) this._seg(ctx, a, b, l.level + lift + 0.4);
        ctx.stroke();
        // Reben auf dem Wall, Querriegel und Überlauf
        const cham = 10 * t.VIS; // eine Kammer = 10 m
        for (const l of kl.walls) {
          const used = new Set();
          for (const [a, b] of l.segments) {
            const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
            const z = l.level + lift + 0.4;
            const p = this.project(mx, my, z);
            if ((a[0] * 7 + a[1] * 3) % 3 < 1.2) {
              ctx.fillStyle = 'rgba(255,255,255,0.95)';
              ctx.fillRect(p[0] - 0.9, p[1] - 2.2, 1.8, 1.8); // Rebe
            }
            const key = Math.floor(mx / cham) + ':' + Math.floor(my / cham);
            if (used.has(key)) continue;
            used.add(key);
            // Querriegel: kurzer Strich quer zum Wall, hangaufwärts durch die Mulde
            const sx = b[0] - a[0], sy = b[1] - a[1];
            const sl = Math.hypot(sx, sy) || 1;
            const nx = -sy / sl, ny = sx / sl;
            const up = t.heightAt(mx + nx * 4, my + ny * 4) > t.heightAt(mx - nx * 4, my - ny * 4) ? 1 : -1;
            const q0 = this.project(mx, my, z);
            const q1 = this.project(mx + nx * up * (wide ? 12 : 8), my + ny * up * (wide ? 12 : 8), z + 1);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(q0[0], q0[1]);
            ctx.lineTo(q1[0], q1[1]);
            ctx.stroke();
            // Überlauf mit Steinen: in der Mitte der Kammer
            const o = this.project(mx + (sx / sl) * cham * 0.5, my + (sy / sl) * cham * 0.5, z);
            ctx.fillStyle = 'rgba(180,180,180,0.95)';
            ctx.fillRect(o[0] - 1.6, o[1] - 1.6, 3.2, 3.2);
          }
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

      // Muldenlinie: Stufenrinne mit Kopfweiden
      if (on('rinne')) {
        for (let k = 0; k < t.N * t.N; k++) {
          if (t.ZONE[k] !== 'rinne') continue;
          const p = this.P[k];
          ctx.fillStyle = 'rgba(61,91,255,0.8)';
          ctx.fillRect(p[0] - 1.4, p[1] - 1.4, 2.8, 2.8);
          const i = k % t.N, j = Math.floor(k / t.N);
          if ((i * 7 + j * 3) % 13 === 0) {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.arc(p[0], p[1] - 3.5, 2.2, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

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

    _labelAnchors() {
      if (this._anchors) return this._anchors;
      const t = this.t;
      const N = t.N;
      let steil = -1, rinne = -1, mittel = -1, ort = [0, 0, 0];
      for (let k = 0; k < N * N; k++) {
        const z = t.ZONE[k];
        const dS = (k2) => Math.hypot((k2 % N) * t.CELL - t.SUMMIT.x, Math.floor(k2 / N) * t.CELL - t.SUMMIT.y);
        if (z === 'steil' && t.SLOPE[k] > 35 && (steil < 0 || dS(k) < dS(steil))) steil = k;
        if (z === 'rinne' && (rinne < 0 || t.H[k] > t.H[rinne])) rinne = k;
        if (z === 'mittel' && (mittel < 0 || t.H[k] > t.H[mittel])) mittel = k;
        if (z === 'ort') { ort[0] += k % N; ort[1] += Math.floor(k / N); ort[2]++; }
      }
      const at = (k) => [(k % N) * t.CELL, Math.floor(k / N) * t.CELL];
      const list = [
        ['Schwammkuppe: Wald von innen nach außen', [t.SUMMIT.x, t.SUMMIT.y], [-40, -40]],
        ['Steilgürtel: Rinnen leiten zur Muldenlinie', at(steil), [40, -50]],
        ['Muldenlinie: Stufenrinne mit Kopfweiden', at(rinne), [30, 20]],
        ['Wall mit Reben · Mulde dahinter', at(mittel), [-60, 40]],
        ['Querriegel (Strich) · Überlauf mit Steinen (grau)', at(mittel), [-60, 64]],
      ];
      if (t.BECKEN.length) list.push(['Becken am Hangfuß', [t.BECKEN[0].x, t.BECKEN[0].y], [20, 30]]);
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
