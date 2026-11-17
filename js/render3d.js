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
      this.showMulden = false; // Wälle/Mulden als Linien (Simulation)
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
        const dim = mode === 'sim' ? 0.35 : 1;
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

      // Wälle und Mulden als feine Linien entlang der Höhe (nur Mittelhang und Auslauf)
      if (this.showMulden) {
        if (!this.fine) this.fine = t.contours(4);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (const c of this.fine)
          for (const [a, b] of c.segments) {
            const z = t.zoneAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
            if (z !== 'mittel' && z !== 'auslauf') continue;
            const pa = this.project(a[0], a[1], c.level);
            const pb = this.project(b[0], b[1], c.level);
            ctx.moveTo(pa[0], pa[1]);
            ctx.lineTo(pb[0], pb[1]);
          }
        ctx.stroke();
      }

      // Höhenlinien
      for (const c of this.contours) {
        const major = c.level % 50 === 0;
        if (mode === 'hoehen') {
          ctx.strokeStyle = major ? 'rgba(241,230,43,0.95)' : 'rgba(255,255,255,0.75)';
          ctx.lineWidth = major ? 1.6 : 0.9;
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
  }

  WB.Mountain3D = Mountain3D;
})();
