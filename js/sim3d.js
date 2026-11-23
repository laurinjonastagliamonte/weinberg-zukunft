/*
 * Wassersimulation direkt auf dem 3D-Gelände.
 * Vereinfachtes Modell zum Zeigen des Prinzips – KEINE hydrologische Berechnung.
 *
 * Regen wird in „Pakete“ aufgeteilt. Jedes Paket fällt auf den Berg und fließt:
 *   heute:   dem stärksten Gefälle nach, Richtung Ort oder aus dem Ausschnitt.
 *   Konzept: Kuppe       – versickert viel (Schwammkuppe, Wald)
 *            Steilgürtel – Rinnen leiten das Wasser ein Stück quer zum Hang
 *            Mittelhang / Auslauf – Muldengraben: Das Wasser trifft auf einen Damm, läuft in der
 *                          Mulde seitlich bis zur nächsten Öffnung (alle 100 m, von Damm zu Damm
 *                          um 50 m versetzt), fällt eine Stufe tiefer und läuft wieder seitlich.
 *                          So geht es im eckigen Zickzack bergab, langsam, und versickert unterwegs.
 *            Hangfuß     – Becken fangen den Rest.
 */
(function () {
  const WB = (window.WB = window.WB || {});

  const PARAMS = {
    rainSeconds: 10,
    rainRate: 300, // Pakete pro Sekunde bei Faktor 1
    infil: {
      heute: { kuppe: 0.004, steil: 0.0015, mittel: 0.002, auslauf: 0.003 },
      konzept: { kuppe: 0.03, steil: 0.003, mittel: 0.005, auslauf: 0.006 },
    },
    muldeInfil: 0.008, // je Meter, während das Wasser seitlich in der Mulde läuft
    muldeSpeed: 9, // m/s seitlich in der Mulde (langsam)
    stillInfil: 0.6, // je Sekunde in einer Senke
    becken: { cap: 40, rate: 1.5, radius: 30 },
    trail: 22, // Länge der Spur (Punkte)
  };

  class WaterModel3D {
    constructor(terrain) {
      this.t = terrain;
      this.variant = 'konzept';
      this.factor = 1; // Regenstärke (Jahreszeit, Zeitraum, Live-Wetter)
      this.soakFactor = 1; // >1: Boden nimmt schlechter auf (z. B. ausgetrocknet im Sommer)
      this.snow = false; // unter 0 °C fällt Schnee: bleibt liegen, fließt nicht ab
      this.windX = 0; // Windversatz der Tropfen (m pro Fall), aus Windrichtung/-stärke
      this.windY = 0;
      this.reset();
    }

    reset() {
      const t = this.t;
      this.time = 0;
      this.raining = false;
      this.rainLeft = 0;
      this.parts = [];
      this.stats = { regen: 0, versickert: 0, geleitet: 0, ort: 0, schnee: 0 };
      this.broken = new Uint8Array(t.N * t.N);
      this.becken = t.BECKEN.map((b) => ({ ...b, vol: 0 }));
      this.lastBreak = null;
    }

    setVariant(v) {
      this.variant = v;
      this.reset();
    }

    startRain() {
      this.raining = true;
      this.rainLeft = PARAMS.rainSeconds;
    }

    // Damm bricht dort, wo gerade Wasser in einer Mulde im Mittelhang steht
    breakWall() {
      const t = this.t;
      const inMulde = this.parts.filter((p) => p.mode === 'lateral' && t.zoneAt(p.x, p.y) === 'mittel');
      if (!inMulde.length) return null;
      const c = inMulde[Math.floor(Math.random() * inMulde.length)];
      const i0 = Math.round(c.x / t.CELL), j0 = Math.round(c.y / t.CELL);
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const i = i0 + di, j = j0 + dj;
          if (i >= 0 && j >= 0 && i < t.N && j < t.N) this.broken[t.idx(i, j)] = 1;
        }
      for (const p of this.parts)
        if (p.mode === 'lateral' && Math.hypot(p.x - c.x, p.y - c.y) < 60) { p.mode = 'down'; p.burst = true; }
      this.lastBreak = { x: c.x, y: c.y };
      return this.lastBreak;
    }

    inMulden() {
      let n = 0;
      for (const p of this.parts) if (p.mode === 'lateral') n++;
      return n;
    }
    stored() {
      let v = this.inMulden();
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
          this.parts.push({ x: x - this.windX, y: y - this.windY, sx: x, sy: y, fall: 1, mode: 'down', trail: [], snow: this.snow });
          this.stats.regen++;
        }
        this.rainLeft -= dt;
        if (this.rainLeft <= 0) this.raining = false;
      }

      const inf = PARAMS.infil[this.variant];
      const soak = Math.pow(this.factor, 0.8) * this.soakFactor; // Starkregen / trockener Boden: nimmt weniger auf
      const konzept = this.variant === 'konzept';
      const e = 5;
      const keep = [];
      for (const p of this.parts) {
        if (p.fall > 0) {
          p.fall -= dt * (p.snow ? 0.8 : 2);
          // Wind trägt die Tropfen schräg
          p.x = p.sx - this.windX * p.fall;
          p.y = p.sy - this.windY * p.fall;
          keep.push(p);
          continue;
        }
        if (p.snow) {
          // Schnee bleibt liegen und schmilzt langsam in den Boden
          p.age = (p.age || 0) + dt;
          if (p.age > 6 + Math.random() * 6) { this.stats.versickert++; continue; }
          keep.push(p);
          continue;
        }
        p.age = (p.age || 0) + dt;
        if (p.age > 40) { this.stats.versickert++; continue; }

        const zone = t.zoneAt(p.x, p.y);
        if (zone === 'ort') { this.stats.ort++; continue; }
        const gx = (t.heightAt(p.x + e, p.y) - t.heightAt(p.x - e, p.y)) / (2 * e);
        const gy = (t.heightAt(p.x, p.y + e) - t.heightAt(p.x, p.y - e)) / (2 * e);
        const g = Math.hypot(gx, gy);
        const muldeZone = zone === 'mittel' || zone === 'auslauf';

        // Spur merken
        p.trail.push(p.x, p.y);
        if (p.trail.length > PARAMS.trail * 2) p.trail.splice(0, 2);

        // --- in der Mulde: seitlich zur nächsten Öffnung ---
        if (konzept && p.mode === 'lateral') {
          if (!muldeZone) { p.mode = 'down'; keep.push(p); continue; }
          const [ax, ay] = t.alongDir(p.x, p.y, gx, gy, p.dir);
          const dist = PARAMS.muldeSpeed * dt;
          p.x += ax * dist;
          p.y += ay * dist;
          // auf Höhe des Damms halten (kleine Korrektur hangauf/-ab)
          const z = t.heightAt(p.x, p.y);
          if (g > 0.002) {
            const corr = Math.max(-2, Math.min(2, (z - (p.level + 0.3)) / g));
            p.x -= (gx / g) * corr * 0.5;
            p.y -= (gy / g) * corr * 0.5;
          }
          if (Math.random() < 1 - Math.pow(1 - PARAMS.muldeInfil / soak, dist)) { this.stats.versickert++; continue; }
          const o = t.opening(p.x, p.y, p.line);
          const k = t.idx(Math.round(p.x / t.CELL), Math.round(p.y / t.CELL));
          if (o.open || this.broken[k]) { p.mode = 'down'; p.pass = p.line; }
          keep.push(p);
          continue;
        }

        if (g < 0.004) {
          if (Math.random() < PARAMS.stillInfil * dt) { this.stats.versickert++; continue; }
          p.x += (Math.random() - 0.5) * 2;
          p.y += (Math.random() - 0.5) * 2;
          keep.push(p);
          continue;
        }

        // --- hangabwärts ---
        let dx = -gx / g;
        let dy = -gy / g;
        let v = 6 + 110 * Math.sqrt(g);
        if (konzept && zone === 'steil' && (p.ledDist || 0) < 90) {
          [dx, dy] = t.leadDir(p.x, p.y, gx, gy); // Rinne leitet ein Stück quer
          v *= 0.55;
          p.ledDist = (p.ledDist || 0) + v * dt;
          if (!p.led) { p.led = true; this.stats.geleitet++; }
        }
        const dist = v * dt;
        const h0 = t.heightAt(p.x, p.y);
        p.x += dx * dist + (Math.random() - 0.5) * 0.4;
        p.y += dy * dist + (Math.random() - 0.5) * 0.4;

        if (p.x < 0 || p.y < 0 || p.x > S || p.y > S) { this.stats.ort++; continue; }
        if (Math.random() < 1 - Math.pow(1 - inf[zone] / soak, dist)) { this.stats.versickert++; continue; }

        if (konzept && muldeZone) {
          // Damm erreicht? (Wasser kreuzt eine Keyline)
          const dh = t.KEY_DH[zone];
          const h1 = t.heightAt(p.x, p.y);
          const line0 = Math.floor(h0 / dh);
          if (Math.floor(h1 / dh) < line0) {
            const k = t.idx(Math.round(p.x / t.CELL), Math.round(p.y / t.CELL));
            const o = t.opening(p.x, p.y, line0);
            if (!(o.open || this.broken[k] || p.pass === line0)) {
              // zurück auf den Damm und in der Mulde seitlich weiter
              p.x -= dx * dist * 0.6;
              p.y -= dy * dist * 0.6;
              p.mode = 'lateral';
              p.line = line0;
              p.wasLateral = true;
              p.level = line0 * dh;
              p.dir = o.dir;
            }
            p.pass = null;
          }
          // Becken am Hangfuß
          if (zone === 'auslauf' && p.mode === 'down') {
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

  // Zeichnet Wasser (mit kurzer Spur), Becken und Dammbrüche über das 3D-Modell
  function drawWater(ctx, view, model) {
    const t = view.t;
    for (let k = 0; k < model.broken.length; k++) {
      if (!model.broken[k]) continue;
      const p = view.P[k];
      ctx.fillStyle = '#E5402A';
      ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
    }
    for (const b of model.becken) {
      if (b.vol < 0.1) continue;
      const a = view.project(b.x, b.y, t.heightAt(b.x, b.y));
      ctx.fillStyle = '#2433F0';
      ctx.beginPath();
      ctx.arc(a[0], a[1], 2 + 6 * Math.min(1, b.vol / PARAMS.becken.cap), 0, Math.PI * 2);
      ctx.fill();
    }
    // Spuren: zeigen den Weg des Wassers (Zickzack im Muldengraben)
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const p of model.parts) {
      if (p.fall > 0 || p.trail.length < 4) continue;
      ctx.strokeStyle = p.mode === 'lateral' || p.line != null ? 'rgba(159,224,255,0.85)' : 'rgba(92,124,255,0.5)';
      ctx.beginPath();
      for (let i = 0; i < p.trail.length; i += 2) {
        const a = view.project(p.trail[i], p.trail[i + 1], t.heightAt(p.trail[i], p.trail[i + 1]) + 1);
        if (i === 0) ctx.moveTo(a[0], a[1]);
        else ctx.lineTo(a[0], a[1]);
      }
      ctx.stroke();
    }
    for (const p of model.parts) {
      const z = t.heightAt(p.x, p.y);
      if (p.snow && p.fall <= 0) {
        const a = view.project(p.x, p.y, z + 1);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(a[0] - 1.5, a[1] - 1.5, 3, 3);
        continue;
      }
      if (p.fall > 0 && p.snow) {
        const a = view.project(p.x, p.y, z + p.fall * 80);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(a[0], a[1], 1.8, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (p.fall > 0) {
        const a = view.project(p.x, p.y, z + p.fall * 80);
        const b = view.project(p.x + model.windX * 0.25, p.y + model.windY * 0.25, z + p.fall * 80 + 22);
        ctx.strokeStyle = 'rgba(92,124,255,0.9)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      } else {
        const a = view.project(p.x, p.y, z + 1);
        ctx.fillStyle = '#000';
        ctx.fillRect(a[0] - 2.8, a[1] - 2.8, 5.6, 5.6);
        ctx.fillStyle = p.burst ? '#E5402A' : p.mode === 'lateral' ? '#9FE0FF' : p.led ? '#9FE0FF' : '#5C7CFF';
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
      ctx.fillText('Dammbruch', a[0] + 16, a[1] + 4);
    }
  }

  WB.WaterModel3D = WaterModel3D;
  WB.drawWater = drawWater;
  WB.SIM_PARAMS = PARAMS;
})();
