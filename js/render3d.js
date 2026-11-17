/*
 * 3D-Drahtgitter des Bergs auf einem Canvas (ohne Bibliothek).
 * Ziehen = drehen, Mausrad = zoomen.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  class Mountain3D {
    constructor(canvas, terrain) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.t = terrain;
      this.yaw = -0.55;
      this.pitch = 0.62;
      this.zoom = 1;
      this.exag = 1.8;
      this.mode = 'zonen'; // 'zonen' | 'hoehen'
      this.highlight = null; // Zonen-Key
      this.contours = terrain.contours(10);
      this._bind();
      this.resize();
    }

    _bind() {
      let drag = null;
      this.c.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
        this.c.setPointerCapture(e.pointerId);
      });
      this.c.addEventListener('pointermove', (e) => {
        if (!drag) return;
        this.yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
        this.pitch = Math.min(1.5, Math.max(0.12, drag.pitch + (e.clientY - drag.y) * 0.006));
        this.draw();
      });
      const end = () => (drag = null);
      this.c.addEventListener('pointerup', end);
      this.c.addEventListener('pointercancel', end);
      this.c.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          this.zoom = Math.min(2.6, Math.max(0.6, this.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
          this.draw();
        },
        { passive: false }
      );
    }

    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.c.width = Math.round(this.w * dpr);
      this.c.height = Math.round(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      this.draw();
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
      const f = 1 / (1 - depth / 2600);
      const scale = (this.zoom * Math.min(this.w, this.h)) / 1250;
      const cx = this.w > 1000 ? this.w * 0.4 : this.w / 2;
      return [cx + xr * f * scale, this.h * 0.52 + screenY * f * scale, depth];
    }

    draw() {
      const { ctx, t } = this;
      if (!this.w) return;
      ctx.clearRect(0, 0, this.w, this.h);
      const N = t.N;
      const C = t.CELL;
      const P = new Array(N * N);
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) P[j * N + i] = this.project(i * C, j * C, t.H[j * N + i]);

      // Sockel (freigestellter Block)
      const base = t.minH - 25;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const edge = [];
      for (let i = 0; i < N; i++) edge.push([i, 0]);
      for (let j = 0; j < N; j++) edge.push([N - 1, j]);
      for (let i = N - 1; i >= 0; i--) edge.push([i, N - 1]);
      for (let j = N - 1; j >= 0; j--) edge.push([0, j]);
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
      ctx.strokeStyle = this.mode === 'hoehen' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let j = 0; j < N; j += 2) {
        for (let i = 0; i < N; i++) {
          const p = P[j * N + i];
          if (i === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        }
      }
      for (let i = 0; i < N; i += 2) {
        for (let j = 0; j < N; j++) {
          const p = P[j * N + i];
          if (j === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        }
      }
      ctx.stroke();

      // Zonen als Punktraster
      if (this.mode === 'zonen') {
        for (let n = 0; n < N * N; n++) {
          const z = t.ZONE[n];
          if (this.highlight && z !== this.highlight) continue;
          const p = P[n];
          ctx.fillStyle = t.ZONES[z].color;
          const r = 1.1 + Math.max(0, p[2]) / 900;
          ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
        }
      }

      // Höhenlinien
      for (const c of this.contours) {
        const major = c.level % 50 === 0;
        if (this.mode === 'hoehen') {
          ctx.strokeStyle = major ? 'rgba(241,230,43,0.95)' : 'rgba(255,255,255,0.75)';
          ctx.lineWidth = major ? 1.6 : 0.9;
        } else {
          ctx.strokeStyle = major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)';
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
